#Requires -Version 5.1
#Requires -RunAsAdministrator

<#
.SYNOPSIS
    Enterprise application deployment and configuration script.

.DESCRIPTION
    Deploys a multi-tier .NET web application to a Windows Server environment.
    Handles IIS site configuration, Windows service installation, SQL database
    provisioning, Active Directory service account setup, and Windows Firewall
    rule management. Designed for use in a CI/CD pipeline or manual deployment.

.PARAMETER AppName
    The name of the application being deployed. Used as the IIS site name,
    service name, and base for directory paths.

.PARAMETER Environment
    Target environment: Dev, QA, Staging, or Production.

.PARAMETER BuildPath
    Path to the build artifacts to deploy.

.PARAMETER SqlServer
    Hostname or IP of the SQL Server instance.

.PARAMETER SqlDatabase
    Name of the target SQL database.

.PARAMETER SqlAdminUser
    SQL Server administrator username for schema migrations.

.PARAMETER SqlAdminPassword
    SQL Server administrator password. Will be converted to SecureString.

.PARAMETER ServiceAccountName
    Active Directory service account to run the Windows service and app pool.

.PARAMETER ServiceAccountPassword
    Password for the AD service account.

.PARAMETER BackupBeforeDeploy
    If true, backs up the current deployment before overwriting.

.PARAMETER RollbackOnFailure
    If true, automatically restores the backup if any step fails.

.EXAMPLE
    .\Deploy-EnterpriseApp.ps1 `
        -AppName "InventoryAPI" `
        -Environment "Production" `
        -BuildPath "\\buildserver\drops\inventoryapi\1.4.2" `
        -SqlServer "sqlprod01" `
        -SqlDatabase "InventoryDB" `
        -SqlAdminUser "sa" `
        -SqlAdminPassword "Sup3rS3cur3!" `
        -ServiceAccountName "svc_inventoryapi" `
        -ServiceAccountPassword "Svc@ccPass99" `
        -BackupBeforeDeploy $true `
        -RollbackOnFailure $true
#>

[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [Parameter(Mandatory = $true)]
    [string]$AppName,

    [Parameter(Mandatory = $true)]
    [ValidateSet("Dev", "QA", "Staging", "Production")]
    [string]$Environment,

    [Parameter(Mandatory = $true)]
    [string]$BuildPath,

    [Parameter(Mandatory = $true)]
    [string]$SqlServer,

    [Parameter(Mandatory = $true)]
    [string]$SqlDatabase,

    [Parameter(Mandatory = $true)]
    [string]$SqlAdminUser,

    [Parameter(Mandatory = $true)]
    [string]$SqlAdminPassword,

    [Parameter(Mandatory = $true)]
    [string]$ServiceAccountName,

    [Parameter(Mandatory = $true)]
    [string]$ServiceAccountPassword,

    [Parameter(Mandatory = $false)]
    [bool]$BackupBeforeDeploy = $true,

    [Parameter(Mandatory = $false)]
    [bool]$RollbackOnFailure = $true,

    [Parameter(Mandatory = $false)]
    [string]$LogPath = "C:\Logs\Deployments",

    [Parameter(Mandatory = $false)]
    [string]$BackupRoot = "C:\Backups\Deployments",

    [Parameter(Mandatory = $false)]
    [int]$AppPoolWorkerProcesses = 4,

    [Parameter(Mandatory = $false)]
    [int]$HttpPort = 80,

    [Parameter(Mandatory = $false)]
    [int]$HttpsPort = 443,

    [Parameter(Mandatory = $false)]
    [int]$ServicePort = 8443,

    [Parameter(Mandatory = $false)]
    [string]$CertificateThumbprint = "",

    [Parameter(Mandatory = $false)]
    [int]$MaxRetries = 3,

    [Parameter(Mandatory = $false)]
    [int]$RetryDelaySeconds = 10
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ─── Constants and derived paths ──────────────────────────────────────────────
$script:DeployTimestamp  = Get-Date -Format "yyyyMMdd_HHmmss"
$script:AppRoot          = "C:\Apps\$AppName"
$script:WebRoot          = "C:\inetpub\wwwroot\$AppName"
$script:ServiceBinPath   = "C:\Services\$AppName"
$script:ConfigPath       = "C:\Config\$AppName"
$script:LogFile          = "$LogPath\$AppName`_$($script:DeployTimestamp).log"
$script:BackupPath       = "$BackupRoot\$AppName`_$($script:DeployTimestamp)"
$script:ServiceName      = "$AppName`_Service"
$script:AppPoolName      = "$AppName`_AppPool"
$script:Domain           = $env:USERDOMAIN
$script:FullServiceAcct  = "$($script:Domain)\$ServiceAccountName"
$script:RollbackNeeded   = $false
$script:DeployedItems    = [System.Collections.Generic.List[string]]::new()

# Environment-specific configuration
$script:EnvConfig = @{
    Dev        = @{ DbConnTimeout = 15; MaxConnections = 10;  EnableDetailedErrors = $true;  MinWorkers = 1 }
    QA         = @{ DbConnTimeout = 20; MaxConnections = 25;  EnableDetailedErrors = $true;  MinWorkers = 2 }
    Staging    = @{ DbConnTimeout = 25; MaxConnections = 50;  EnableDetailedErrors = $false; MinWorkers = 2 }
    Production = @{ DbConnTimeout = 30; MaxConnections = 100; EnableDetailedErrors = $false; MinWorkers = $AppPoolWorkerProcesses }
}
$script:Config = $script:EnvConfig[$Environment]

# ─── Logging ──────────────────────────────────────────────────────────────────
function Write-Log {
    param(
        [string]$Message,
        [ValidateSet("INFO", "WARN", "ERROR", "SUCCESS", "DEBUG")]
        [string]$Level = "INFO"
    )
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $entry = "[$timestamp] [$Level] $Message"
    Add-Content -Path $script:LogFile -Value $entry -ErrorAction SilentlyContinue
    switch ($Level) {
        "ERROR"   { Write-Host $entry -ForegroundColor Red }
        "WARN"    { Write-Host $entry -ForegroundColor Yellow }
        "SUCCESS" { Write-Host $entry -ForegroundColor Green }
        "DEBUG"   { if ($VerbosePreference -eq "Continue") { Write-Host $entry -ForegroundColor Gray } }
        default   { Write-Host $entry }
    }
}

# ─── Prerequisites check ──────────────────────────────────────────────────────
function Test-Prerequisites {
    Write-Log "Checking deployment prerequisites..."

    # Check IIS is installed
    $iisFeature = Get-WindowsFeature -Name Web-Server -ErrorAction SilentlyContinue
    if (-not $iisFeature -or -not $iisFeature.Installed) {
        throw "IIS (Web-Server) is not installed on this server."
    }

    # Check WebAdministration module
    if (-not (Get-Module -ListAvailable -Name WebAdministration)) {
        throw "WebAdministration PowerShell module is not available."
    }
    Import-Module WebAdministration -Force

    # Check .NET Framework version
    $dotNetKey = Get-ItemProperty "HKLM:\SOFTWARE\Microsoft\NET Framework Setup\NDP\v4\Full" -ErrorAction SilentlyContinue
    if (-not $dotNetKey -or $dotNetKey.Release -lt 461808) {
        throw ".NET Framework 4.7.2 or later is required. Current release key: $($dotNetKey.Release)"
    }

    # Check SQL connectivity
    Write-Log "Testing SQL Server connectivity to $SqlServer..."
    $sqlConn = New-Object System.Data.SqlClient.SqlConnection
    $sqlConn.ConnectionString = "Server=$SqlServer;Database=master;User Id=$SqlAdminUser;Password=$SqlAdminPassword;Connect Timeout=10;"
    try {
        $sqlConn.Open()
        Write-Log "SQL Server connection successful." -Level SUCCESS
    } catch {
        throw "Cannot connect to SQL Server '$SqlServer': $_"
    } finally {
        $sqlConn.Close()
        $sqlConn.Dispose()
    }

    # Check build path exists and has content
    if (-not (Test-Path $BuildPath)) {
        throw "Build path does not exist: $BuildPath"
    }
    $buildFiles = Get-ChildItem -Path $BuildPath -Recurse -File
    if ($buildFiles.Count -eq 0) {
        throw "Build path is empty: $BuildPath"
    }
    Write-Log "Build path contains $($buildFiles.Count) files." -Level SUCCESS

    # Check service account exists in AD
    Write-Log "Verifying service account '$ServiceAccountName' in Active Directory..."
    try {
        $adUser = Get-WmiObject -Class Win32_Account -Filter "Name='$ServiceAccountName' AND Domain='$($script:Domain)'"
        if (-not $adUser) {
            throw "Service account not found in domain."
        }
        Write-Log "Service account verified: $($script:FullServiceAcct)" -Level SUCCESS
    } catch {
        throw "Could not verify service account '$ServiceAccountName': $_"
    }

    # Check disk space — require at least 2GB free on C:
    $disk = Get-WmiObject -Class Win32_LogicalDisk -Filter "DeviceID='C:'"
    $freeGB = [math]::Round($disk.FreeSpace / 1GB, 2)
    if ($freeGB -lt 2) {
        throw "Insufficient disk space. Only $freeGB GB free on C:. Minimum 2 GB required."
    }
    Write-Log "Disk space OK: $freeGB GB free on C:." -Level SUCCESS

    Write-Log "All prerequisites passed." -Level SUCCESS
}

# ─── Backup ───────────────────────────────────────────────────────────────────
function New-DeploymentBackup {
    Write-Log "Creating pre-deployment backup at: $($script:BackupPath)"
    $null = New-Item -ItemType Directory -Path $script:BackupPath -Force

    $itemsToBackup = @(
        @{ Source = $script:WebRoot;        Dest = "$($script:BackupPath)\WebRoot" }
        @{ Source = $script:ServiceBinPath; Dest = "$($script:BackupPath)\ServiceBin" }
        @{ Source = $script:ConfigPath;     Dest = "$($script:BackupPath)\Config" }
    )

    foreach ($item in $itemsToBackup) {
        if (Test-Path $item.Source) {
            Write-Log "Backing up: $($item.Source) → $($item.Dest)"
            Copy-Item -Path $item.Source -Destination $item.Dest -Recurse -Force
            $script:DeployedItems.Add("BACKUP:$($item.Source):$($item.Dest)")
        } else {
            Write-Log "Skipping backup of non-existent path: $($item.Source)" -Level WARN
        }
    }

    # Export current IIS site config
    $iisExportPath = "$($script:BackupPath)\IISConfig.xml"
    try {
        & "$env:windir\system32\inetsrv\appcmd.exe" list site "$AppName" /config /xml > $iisExportPath
        Write-Log "IIS configuration exported to: $iisExportPath" -Level SUCCESS
    } catch {
        Write-Log "Could not export IIS config (site may not exist yet): $_" -Level WARN
    }

    # Export current service config via WMI
    try {
        $svcInfo = Get-WmiObject -Class Win32_Service -Filter "Name='$($script:ServiceName)'"
        if ($svcInfo) {
            $svcInfo | Export-Clixml -Path "$($script:BackupPath)\ServiceConfig.xml"
            Write-Log "Service configuration exported." -Level SUCCESS
        }
    } catch {
        Write-Log "Could not export service config: $_" -Level WARN
    }

    Write-Log "Backup complete." -Level SUCCESS
}

# ─── Active Directory service account setup ───────────────────────────────────
function Set-ServiceAccountPermissions {
    Write-Log "Configuring permissions for service account: $($script:FullServiceAcct)"

    $paths = @($script:WebRoot, $script:ServiceBinPath, $script:ConfigPath, $script:LogPath)
    foreach ($path in $paths) {
        if (-not (Test-Path $path)) {
            $null = New-Item -ItemType Directory -Path $path -Force
        }
        $acl = Get-Acl -Path $path
        $rule = New-Object System.Security.AccessControl.FileSystemAccessRule(
            $script:FullServiceAcct,
            "Modify",
            "ContainerInherit,ObjectInherit",
            "None",
            "Allow"
        )
        $acl.SetAccessRule($rule)
        Set-Acl -Path $path -AclObject $acl
        Write-Log "Granted Modify to '$($script:FullServiceAcct)' on: $path" -Level SUCCESS
    }

    # Grant "Log on as a service" right via LSA
    Write-Log "Granting 'Log on as a service' right to $($script:FullServiceAcct)..."
    $lsaPolicy = $null
    try {
        $lsaPolicy = New-Object -TypeName System.Security.Policy.Evidence
        # Use secedit to export, modify, and re-import the policy
        $tempInf = [System.IO.Path]::GetTempFileName() + ".inf"
        $tempDb  = [System.IO.Path]::GetTempFileName() + ".sdb"
        secedit /export /cfg $tempInf /quiet
        $infContent = Get-Content $tempInf
        $seServiceLogonRight = $infContent | Where-Object { $_ -match "SeServiceLogonRight" }
        if ($seServiceLogonRight) {
            $infContent = $infContent -replace "SeServiceLogonRight\s*=.*",
                "SeServiceLogonRight = $($seServiceLogonRight -replace 'SeServiceLogonRight\s*=\s*',''),$($script:FullServiceAcct)"
        } else {
            $infContent += "`nSeServiceLogonRight = $($script:FullServiceAcct)"
        }
        $infContent | Set-Content $tempInf
        secedit /configure /db $tempDb /cfg $tempInf /quiet
        Remove-Item $tempInf, $tempDb -ErrorAction SilentlyContinue
        Write-Log "Log on as a service right granted." -Level SUCCESS
    } catch {
        Write-Log "Could not set SeServiceLogonRight via secedit: $_" -Level WARN
    }
}

# ─── IIS configuration ────────────────────────────────────────────────────────
function Set-IISConfiguration {
    Write-Log "Configuring IIS for application: $AppName"
    Import-Module WebAdministration -Force

    # Create web root if needed
    if (-not (Test-Path $script:WebRoot)) {
        $null = New-Item -ItemType Directory -Path $script:WebRoot -Force
    }

    # Remove existing app pool if present
    if (Test-Path "IIS:\AppPools\$($script:AppPoolName)") {
        Write-Log "Removing existing app pool: $($script:AppPoolName)"
        Remove-WebAppPool -Name $script:AppPoolName
    }

    # Create app pool
    Write-Log "Creating app pool: $($script:AppPoolName)"
    $null = New-WebAppPool -Name $script:AppPoolName
    $appPool = Get-Item "IIS:\AppPools\$($script:AppPoolName)"
    $appPool.managedRuntimeVersion       = "v4.0"
    $appPool.managedPipelineMode         = "Integrated"
    $appPool.processModel.userName       = $script:FullServiceAcct
    $appPool.processModel.password       = $ServiceAccountPassword
    $appPool.processModel.identityType   = "SpecificUser"
    $appPool.processModel.maxProcesses   = $script:Config.MinWorkers
    $appPool.recycling.periodicRestart.time = "00:00:00"  # Disable time-based recycling
    $appPool | Set-Item
    Write-Log "App pool created and configured." -Level SUCCESS

    # Remove existing site if present
    if (Get-Website -Name $AppName -ErrorAction SilentlyContinue) {
        Write-Log "Removing existing IIS site: $AppName"
        Remove-Website -Name $AppName
    }

    # Create site
    Write-Log "Creating IIS site: $AppName on port $HttpPort"
    $null = New-Website -Name $AppName `
                        -PhysicalPath $script:WebRoot `
                        -ApplicationPool $script:AppPoolName `
                        -Port $HttpPort `
                        -Force

    # Add HTTPS binding if certificate thumbprint provided
    if ($CertificateThumbprint -ne "") {
        Write-Log "Adding HTTPS binding on port $HttpsPort with cert: $CertificateThumbprint"
        $null = New-WebBinding -Name $AppName -Protocol "https" -Port $HttpsPort -SslFlags 0
        $cert = Get-ChildItem Cert:\LocalMachine\My | Where-Object { $_.Thumbprint -eq $CertificateThumbprint }
        if (-not $cert) {
            throw "Certificate with thumbprint '$CertificateThumbprint' not found in LocalMachine\My."
        }
        $binding = Get-WebBinding -Name $AppName -Protocol "https"
        $binding.AddSslCertificate($CertificateThumbprint, "My")
        Write-Log "HTTPS binding configured." -Level SUCCESS
    }

    # Set application settings
    Set-WebConfigurationProperty -PSPath "IIS:\Sites\$AppName" `
        -Filter "system.web/customErrors" -Name "mode" -Value "Off"

    if ($script:Config.EnableDetailedErrors) {
        Set-WebConfigurationProperty -PSPath "IIS:\Sites\$AppName" `
            -Filter "system.webServer/httpErrors" -Name "errorMode" -Value "Detailed"
    }

    # Configure connection limits
    Set-WebConfigurationProperty -PSPath "IIS:\Sites\$AppName" `
        -Filter "system.web/httpRuntime" -Name "maxRequestLength" -Value 51200
    Set-WebConfigurationProperty -PSPath "IIS:\Sites\$AppName" `
        -Filter "system.web/httpRuntime" -Name "executionTimeout" -Value "00:10:00"

    Start-Website -Name $AppName
    Write-Log "IIS site '$AppName' created and started." -Level SUCCESS
    $script:DeployedItems.Add("IIS_SITE:$AppName")
}

# ─── Windows Service installation ─────────────────────────────────────────────
function Install-ApplicationService {
    Write-Log "Installing Windows service: $($script:ServiceName)"

    if (-not (Test-Path $script:ServiceBinPath)) {
        $null = New-Item -ItemType Directory -Path $script:ServiceBinPath -Force
    }

    # Check if service already exists
    $existingSvc = Get-WmiObject -Class Win32_Service -Filter "Name='$($script:ServiceName)'"
    if ($existingSvc) {
        Write-Log "Stopping and removing existing service: $($script:ServiceName)"
        if ($existingSvc.State -eq "Running") {
            $existingSvc.StopService() | Out-Null
            Start-Sleep -Seconds 5
        }
        $existingSvc.Delete() | Out-Null
        Start-Sleep -Seconds 2
    }

    # Copy service binaries
    $serviceBuildPath = Join-Path $BuildPath "service"
    if (Test-Path $serviceBuildPath) {
        Copy-Item -Path "$serviceBuildPath\*" -Destination $script:ServiceBinPath -Recurse -Force
        Write-Log "Service binaries deployed to: $($script:ServiceBinPath)" -Level SUCCESS
    } else {
        Write-Log "No service subdirectory found in build — skipping service binary copy." -Level WARN
    }

    # Install service
    $svcExe = Join-Path $script:ServiceBinPath "$AppName.Service.exe"
    if (-not (Test-Path $svcExe)) {
        Write-Log "Service executable not found at: $svcExe — skipping service install." -Level WARN
        return
    }

    $svcPassword = ConvertTo-SecureString $ServiceAccountPassword -AsPlainText -Force
    $svcCredential = New-Object System.Management.Automation.PSCredential($script:FullServiceAcct, $svcPassword)

    New-Service -Name $script:ServiceName `
                -BinaryPathName "`"$svcExe`" --environment $Environment" `
                -DisplayName "$AppName Background Service" `
                -Description "Background processing service for $AppName ($Environment)" `
                -StartupType Automatic `
                -Credential $svcCredential

    # Set recovery options via sc.exe (New-Service doesn't expose these)
    & sc.exe failure $script:ServiceName reset= 86400 actions= restart/30000/restart/60000/restart/120000
    Write-Log "Service recovery actions configured." -Level SUCCESS

    Start-Service -Name $script:ServiceName
    $svc = Get-Service -Name $script:ServiceName
    if ($svc.Status -ne "Running") {
        throw "Service '$($script:ServiceName)' failed to start. Status: $($svc.Status)"
    }
    Write-Log "Service '$($script:ServiceName)' installed and running." -Level SUCCESS
    $script:DeployedItems.Add("SERVICE:$($script:ServiceName)")
}

# ─── Database provisioning ────────────────────────────────────────────────────
function Invoke-DatabaseMigrations {
    Write-Log "Running database migrations against: $SqlServer\$SqlDatabase"

    $securePass  = ConvertTo-SecureString $SqlAdminPassword -AsPlainText -Force
    $sqlCred     = New-Object System.Management.Automation.PSCredential($SqlAdminUser, $securePass)
    $connString  = "Server=$SqlServer;Database=$SqlDatabase;User Id=$SqlAdminUser;Password=$SqlAdminPassword;Connect Timeout=$($script:Config.DbConnTimeout);"

    # Check if database exists, create if not
    $masterConn  = "Server=$SqlServer;Database=master;User Id=$SqlAdminUser;Password=$SqlAdminPassword;Connect Timeout=10;"
    $checkDbSql  = "SELECT COUNT(*) FROM sys.databases WHERE name = '$SqlDatabase'"
    $dbExists    = Invoke-SqlQuery -ConnectionString $masterConn -Query $checkDbSql -Scalar

    if ($dbExists -eq 0) {
        Write-Log "Database '$SqlDatabase' does not exist — creating..."
        $createDbSql = @"
CREATE DATABASE [$SqlDatabase]
ON PRIMARY (
    NAME = '${SqlDatabase}_data',
    FILENAME = 'C:\SQLData\${SqlDatabase}.mdf',
    SIZE = 256MB,
    MAXSIZE = UNLIMITED,
    FILEGROWTH = 64MB
)
LOG ON (
    NAME = '${SqlDatabase}_log',
    FILENAME = 'C:\SQLLogs\${SqlDatabase}_log.ldf',
    SIZE = 64MB,
    MAXSIZE = 4096MB,
    FILEGROWTH = 64MB
);
"@
        Invoke-SqlQuery -ConnectionString $masterConn -Query $createDbSql
        Write-Log "Database '$SqlDatabase' created." -Level SUCCESS
    } else {
        Write-Log "Database '$SqlDatabase' already exists." -Level SUCCESS
    }

    # Set service account as db_owner
    $grantSql = @"
IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = '$ServiceAccountName')
    CREATE USER [$ServiceAccountName] FOR LOGIN [$($script:FullServiceAcct)];
ALTER ROLE db_owner ADD MEMBER [$ServiceAccountName];
"@
    Invoke-SqlQuery -ConnectionString $connString -Query $grantSql
    Write-Log "Service account granted db_owner on '$SqlDatabase'." -Level SUCCESS

    # Run migration scripts from build path
    $migrationsPath = Join-Path $BuildPath "migrations"
    if (Test-Path $migrationsPath) {
        $scripts = Get-ChildItem -Path $migrationsPath -Filter "*.sql" | Sort-Object Name
        Write-Log "Found $($scripts.Count) migration script(s) to run."
        foreach ($sqlScript in $scripts) {
            Write-Log "Running migration: $($sqlScript.Name)"
            $sql = Get-Content -Path $sqlScript.FullName -Raw
            Invoke-SqlQuery -ConnectionString $connString -Query $sql
            Write-Log "Migration complete: $($sqlScript.Name)" -Level SUCCESS
        }
    } else {
        Write-Log "No migrations directory found at: $migrationsPath" -Level WARN
    }
}

function Invoke-SqlQuery {
    param(
        [string]$ConnectionString,
        [string]$Query,
        [switch]$Scalar
    )
    $conn = New-Object System.Data.SqlClient.SqlConnection($ConnectionString)
    $cmd  = New-Object System.Data.SqlClient.SqlCommand($Query, $conn)
    try {
        $conn.Open()
        if ($Scalar) {
            return $cmd.ExecuteScalar()
        } else {
            $cmd.ExecuteNonQuery() | Out-Null
        }
    } finally {
        $conn.Close()
        $conn.Dispose()
    }
}

# ─── Application configuration files ─────────────────────────────────────────
function Set-ApplicationConfiguration {
    Write-Log "Writing application configuration for environment: $Environment"

    if (-not (Test-Path $script:ConfigPath)) {
        $null = New-Item -ItemType Directory -Path $script:ConfigPath -Force
    }

    # Build connection string using service account credentials
    $appConnString = "Server=$SqlServer;Database=$SqlDatabase;Integrated Security=True;Connect Timeout=$($script:Config.DbConnTimeout);Max Pool Size=$($script:Config.MaxConnections);"

    # Write appsettings.json
    $appSettings = @{
        ConnectionStrings = @{
            DefaultConnection = $appConnString
        }
        AppSettings = @{
            Environment            = $Environment
            AppName                = $AppName
            EnableDetailedErrors   = $script:Config.EnableDetailedErrors
            ServicePort            = $ServicePort
            MaxDatabaseConnections = $script:Config.MaxConnections
            LogPath                = $script:LogPath
            DeployedAt             = $script:DeployTimestamp
            DeployedBy             = $env:USERNAME
        }
        Logging = @{
            LogLevel = @{
                Default  = if ($Environment -eq "Production") { "Warning" } else { "Debug" }
                System   = "Warning"
                Microsoft = "Warning"
            }
        }
    } | ConvertTo-Json -Depth 5

    $appSettings | Set-Content -Path "$($script:ConfigPath)\appsettings.$Environment.json" -Encoding UTF8
    Write-Log "Application settings written." -Level SUCCESS

    # Write encrypted API key to registry for retrieval at runtime
    $apiKeyPath = "HKLM:\SOFTWARE\$AppName\$Environment"
    if (-not (Test-Path $apiKeyPath)) {
        $null = New-Item -Path $apiKeyPath -Force
    }
    # Store a placeholder — actual key injected by secrets manager in pipeline
    $apiKey = "PIPELINE_INJECT_API_KEY"
    $encryptedKey = ConvertTo-SecureString $apiKey -AsPlainText -Force | ConvertFrom-SecureString
    Set-ItemProperty -Path $apiKeyPath -Name "ApiKey" -Value $encryptedKey
    Set-ItemProperty -Path $apiKeyPath -Name "ServiceAccount" -Value $script:FullServiceAcct
    Set-ItemProperty -Path $apiKeyPath -Name "DeployedAt" -Value $script:DeployTimestamp
    Write-Log "Registry configuration written to: $apiKeyPath" -Level SUCCESS
}

# ─── Firewall rules ───────────────────────────────────────────────────────────
function Set-FirewallRules {
    Write-Log "Configuring Windows Firewall rules for $AppName"

    $rules = @(
        @{ Name = "$AppName HTTP";    Port = $HttpPort;    Protocol = "TCP"; Description = "HTTP traffic for $AppName" }
        @{ Name = "$AppName Service"; Port = $ServicePort; Protocol = "TCP"; Description = "Background service port for $AppName" }
    )
    if ($CertificateThumbprint -ne "") {
        $rules += @{ Name = "$AppName HTTPS"; Port = $HttpsPort; Protocol = "TCP"; Description = "HTTPS traffic for $AppName" }
    }

    foreach ($rule in $rules) {
        # Remove existing rule if present
        $existing = Get-NetFirewallRule -DisplayName $rule.Name -ErrorAction SilentlyContinue
        if ($existing) {
            Remove-NetFirewallRule -DisplayName $rule.Name
            Write-Log "Removed existing firewall rule: $($rule.Name)"
        }
        New-NetFirewallRule `
            -DisplayName $rule.Name `
            -Direction Inbound `
            -Protocol $rule.Protocol `
            -LocalPort $rule.Port `
            -Action Allow `
            -Profile Any `
            -Description $rule.Description | Out-Null
        Write-Log "Firewall rule created: $($rule.Name) → port $($rule.Port)" -Level SUCCESS
        $script:DeployedItems.Add("FIREWALL:$($rule.Name)")
    }
}

# ─── Health check ─────────────────────────────────────────────────────────────
function Test-DeploymentHealth {
    Write-Log "Running post-deployment health checks..."
    $attempts = 0
    $healthy  = $false

    while ($attempts -lt $MaxRetries -and -not $healthy) {
        $attempts++
        Write-Log "Health check attempt $attempts of $MaxRetries..."
        try {
            # Check IIS site is running
            $site = Get-Website -Name $AppName
            if ($site.State -ne "Started") {
                throw "IIS site '$AppName' is not in Started state. Current state: $($site.State)"
            }

            # Check app pool is running
            $pool = Get-WebAppPoolState -Name $script:AppPoolName
            if ($pool.Value -ne "Started") {
                throw "App pool '$($script:AppPoolName)' is not running. State: $($pool.Value)"
            }

            # Check Windows service is running (if installed)
            $svc = Get-Service -Name $script:ServiceName -ErrorAction SilentlyContinue
            if ($svc -and $svc.Status -ne "Running") {
                throw "Service '$($script:ServiceName)' is not running. Status: $($svc.Status)"
            }

            # Check HTTP response
            $url = "http://localhost:$HttpPort/health"
            Write-Log "Hitting health endpoint: $url"
            $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 15 -ErrorAction Stop
            if ($response.StatusCode -ne 200) {
                throw "Health endpoint returned HTTP $($response.StatusCode)"
            }

            # Validate response body
            $body = $response.Content | ConvertFrom-Json -ErrorAction SilentlyContinue
            if ($body -and $body.status -ne "healthy") {
                throw "Health endpoint reports unhealthy status: $($body.status). Details: $($body | ConvertTo-Json -Compress)"
            }

            $healthy = $true
            Write-Log "Health check passed." -Level SUCCESS

        } catch {
            Write-Log "Health check attempt $attempts failed: $_" -Level WARN
            if ($attempts -lt $MaxRetries) {
                Write-Log "Retrying in $RetryDelaySeconds seconds..."
                Start-Sleep -Seconds $RetryDelaySeconds
            }
        }
    }

    if (-not $healthy) {
        throw "Deployment health checks failed after $MaxRetries attempts."
    }
}

# ─── Rollback ─────────────────────────────────────────────────────────────────
function Invoke-Rollback {
    Write-Log "INITIATING ROLLBACK — restoring from backup: $($script:BackupPath)" -Level ERROR

    # Stop and remove newly installed service
    $svc = Get-Service -Name $script:ServiceName -ErrorAction SilentlyContinue
    if ($svc) {
        Stop-Service -Name $script:ServiceName -Force -ErrorAction SilentlyContinue
        $wmiSvc = Get-WmiObject -Class Win32_Service -Filter "Name='$($script:ServiceName)'"
        if ($wmiSvc) { $wmiSvc.Delete() | Out-Null }
    }

    # Restore files from backup
    $restorePairs = @(
        @{ Backup = "$($script:BackupPath)\WebRoot";    Target = $script:WebRoot }
        @{ Backup = "$($script:BackupPath)\ServiceBin"; Target = $script:ServiceBinPath }
        @{ Backup = "$($script:BackupPath)\Config";     Target = $script:ConfigPath }
    )
    foreach ($pair in $restorePairs) {
        if (Test-Path $pair.Backup) {
            Write-Log "Restoring: $($pair.Backup) → $($pair.Target)"
            if (Test-Path $pair.Target) { Remove-Item -Path $pair.Target -Recurse -Force }
            Copy-Item -Path $pair.Backup -Destination $pair.Target -Recurse -Force
            Write-Log "Restored: $($pair.Target)" -Level SUCCESS
        }
    }

    # Restore IIS config
    $iisBackup = "$($script:BackupPath)\IISConfig.xml"
    if (Test-Path $iisBackup) {
        Write-Log "Restoring IIS configuration..."
        & "$env:windir\system32\inetsrv\appcmd.exe" add site /in < $iisBackup
        Write-Log "IIS configuration restored." -Level SUCCESS
    }

    Write-Log "Rollback complete. Previous deployment restored." -Level WARN
}

# ─── Deployment summary ───────────────────────────────────────────────────────
function Write-DeploymentSummary {
    param([bool]$Success)
    $status = if ($Success) { "SUCCESS" } else { "FAILED" }
    $divider = "=" * 60
    Write-Log $divider
    Write-Log "DEPLOYMENT $status"
    Write-Log "Application : $AppName"
    Write-Log "Environment : $Environment"
    Write-Log "Build path  : $BuildPath"
    Write-Log "Timestamp   : $($script:DeployTimestamp)"
    Write-Log "Log file    : $($script:LogFile)"
    Write-Log "Items deployed:"
    $script:DeployedItems | ForEach-Object { Write-Log "  · $_" }
    Write-Log $divider
}

# ─── System metrics collection ────────────────────────────────────────────────
function Get-SystemMetrics {
    Write-Log "Collecting pre-deployment system metrics..."

    $cpu = Get-WmiObject -Class Win32_Processor | Measure-Object -Property LoadPercentage -Average
    $os  = Get-WmiObject -Class Win32_OperatingSystem
    $ramUsedGB  = [math]::Round(($os.TotalVisibleMemorySize - $os.FreePhysicalMemory) / 1MB, 2)
    $ramTotalGB = [math]::Round($os.TotalVisibleMemorySize / 1MB, 2)
    $disk = Get-WmiObject -Class Win32_LogicalDisk -Filter "DeviceID='C:'"
    $diskFreeGB = [math]::Round($disk.FreeSpace / 1GB, 2)

    Write-Log "System metrics — CPU: $([math]::Round($cpu.Average, 1))% | RAM: $ramUsedGB / $ramTotalGB GB | Disk free: $diskFreeGB GB"

    if ($cpu.Average -gt 85) {
        Write-Log "WARNING: CPU utilization is high ($([math]::Round($cpu.Average,1))%). Deployment may be slow." -Level WARN
    }
    if (($os.FreePhysicalMemory / $os.TotalVisibleMemorySize) -lt 0.15) {
        Write-Log "WARNING: Less than 15% RAM free. Consider deferring deployment." -Level WARN
    }
}

# ─── Main entry point ─────────────────────────────────────────────────────────
function Main {
    # Ensure log directory exists
    if (-not (Test-Path $LogPath)) {
        $null = New-Item -ItemType Directory -Path $LogPath -Force
    }

    Write-Log ("=" * 60)
    Write-Log "Starting deployment: $AppName → $Environment"
    Write-Log "Build: $BuildPath"
    Write-Log "Operator: $env:USERNAME on $env:COMPUTERNAME"
    Write-Log ("=" * 60)

    try {
        Get-SystemMetrics
        Test-Prerequisites

        if ($BackupBeforeDeploy) {
            New-DeploymentBackup
        }

        Set-ServiceAccountPermissions
        Set-IISConfiguration
        Install-ApplicationService
        Invoke-DatabaseMigrations
        Set-ApplicationConfiguration
        Set-FirewallRules
        Test-DeploymentHealth

        Write-DeploymentSummary -Success $true
        Write-Log "Deployment completed successfully." -Level SUCCESS

    } catch {
        Write-Log "Deployment failed: $_" -Level ERROR
        Write-DeploymentSummary -Success $false

        if ($RollbackOnFailure -and $BackupBeforeDeploy -and (Test-Path $script:BackupPath)) {
            Invoke-Rollback
        } else {
            Write-Log "Rollback skipped (RollbackOnFailure=$RollbackOnFailure, BackupBeforeDeploy=$BackupBeforeDeploy)." -Level WARN
        }

        exit 1
    }
}

Main
