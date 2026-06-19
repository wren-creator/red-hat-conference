#!/usr/bin/env python3
"""
Rosetta Stone — Launch Script
Serves the app locally and opens it in your browser.
Requires Python 3.6+ only. No pip installs needed.

Usage:
  python3 launch.py
  python3 launch.py --port 8080
  python3 launch.py --no-browser

When running via launch.py, the app gains a /validate endpoint that runs
ansible-lint locally and returns structured results. Install ansible-lint with:
  pip install ansible-lint ansible-core
"""
import http.server
import socketserver
import webbrowser
import argparse
import os
import sys
import json
import subprocess
import tempfile
import shutil


def _find_ansible_lint():
    """Locate ansible-lint, checking common pip/pipx install paths if not on PATH."""
    found = shutil.which('ansible-lint')
    if found:
        return found
    home = os.path.expanduser('~')
    candidates = [
        os.path.join(home, '.local', 'bin', 'ansible-lint'),
        os.path.join(home, '.pyenv', 'shims', 'ansible-lint'),
        '/opt/homebrew/bin/ansible-lint',
        '/opt/homebrew/opt/ansible-lint/bin/ansible-lint',
        '/usr/local/bin/ansible-lint',
        '/usr/bin/ansible-lint',
    ]
    for c in candidates:
        if os.path.isfile(c) and os.access(c, os.X_OK):
            return c
    return None


def _subprocess_env():
    """Return an env dict with common pip/pipx bin dirs prepended to PATH."""
    env = os.environ.copy()
    home = os.path.expanduser('~')
    extra = [
        os.path.join(home, '.local', 'bin'),
        os.path.join(home, '.pyenv', 'shims'),
        '/opt/homebrew/bin',
        '/usr/local/bin',
    ]
    env['PATH'] = ':'.join(extra + env.get('PATH', '').split(':'))
    return env


class RosettaHandler(http.server.SimpleHTTPRequestHandler):

    # ── GET /health — lets the browser detect that launch.py is running ──
    def do_GET(self):
        if self.path == '/health':
            self._json(200, {'ok': True, 'service': 'rosetta-stone'})
            return
        super().do_GET()

    # ── OPTIONS — needed for any preflight if origin differs ─────────────
    def do_OPTIONS(self):
        self.send_response(200)
        self._cors_headers()
        self.end_headers()

    # ── POST /validate — runs ansible-lint on the submitted playbook ──────
    def do_POST(self):
        if self.path != '/validate':
            self._json(404, {'error': 'Not found'})
            return

        # Read and parse the request body
        try:
            length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(length)
            data = json.loads(body)
            playbook = data.get('playbook', '').strip()
        except Exception as e:
            self._json(400, {'error': f'Invalid request body: {e}'})
            return

        if not playbook:
            self._json(400, {'error': 'No playbook content provided'})
            return

        # Check ansible-lint is installed
        lint_bin = _find_ansible_lint()
        if not lint_bin:
            self._json(200, {
                'available': False,
                'error': 'ansible-lint not found',
                'install': 'pip install ansible-lint ansible-core'
            })
            return

        try:
            ver = subprocess.run(
                [lint_bin, '--version'],
                capture_output=True, text=True, timeout=5, env=_subprocess_env()
            )
            lint_version = ver.stdout.split('\n')[0].strip()
        except Exception as e:
            self._json(200, {'available': False, 'error': str(e)})
            return

        # Write playbook to a temp file
        tmp = None
        try:
            with tempfile.NamedTemporaryFile(
                mode='w', suffix='.yml', prefix='rosetta_', delete=False
            ) as f:
                f.write(_clean_playbook(playbook))
                tmp = f.name

            result = subprocess.run(
                [lint_bin, '--format', 'json', '--nocolor', tmp],
                capture_output=True, text=True, timeout=30, env=_subprocess_env()
            )

            # returncode: 0 = passed, 2 = violations found, 1 = fatal/parse error
            passed = result.returncode == 0
            raw_out = (result.stdout + result.stderr).strip()

            violations = []
            try:
                parsed = json.loads(result.stdout or '[]')
                if isinstance(parsed, list):
                    violations = parsed
            except json.JSONDecodeError:
                pass

            # Normalise violations — strip the temp file path from location
            clean = []
            for v in violations:
                loc = v.get('location', {})
                lines = loc.get('lines', {})
                clean.append({
                    'rule':     v.get('check_name', v.get('rule', {}).get('id', 'unknown')),
                    'message':  v.get('description', v.get('message', '')),
                    'severity': _normalise_severity(v.get('severity', 'warning'), v.get('check_name', v.get('rule', {}).get('id', ''))),
                    'line':     lines.get('begin', loc.get('line', None)),
                })

            errors   = [v for v in clean if v['severity'] == 'error']
            warnings = [v for v in clean if v['severity'] == 'warning']
            info     = [v for v in clean if v['severity'] == 'info']

            self._json(200, {
                'available':     True,
                'passed':        passed,
                'lint_version':  lint_version,
                'violations':    clean,
                'error_count':   len(errors),
                'warning_count': len(warnings),
                'info_count':    len(info),
                'raw':           raw_out,
            })

        except subprocess.TimeoutExpired:
            self._json(200, {
                'available': True,
                'passed': False,
                'error': 'ansible-lint timed out after 30 seconds',
                'violations': [], 'raw': ''
            })
        except Exception as e:
            self._json(500, {'available': True, 'error': str(e)})
        finally:
            if tmp:
                try:
                    os.unlink(tmp)
                except OSError:
                    pass

    # ── Helpers ───────────────────────────────────────────────────────────
    def _json(self, code, data):
        body = json.dumps(data).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self._cors_headers()
        self.end_headers()
        self.wfile.write(body)

    def _cors_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

    def log_message(self, fmt, *args):
        # Only log validate calls and errors — suppress static file noise
        if '/validate' in (args[0] if args else '') or (args[1] if len(args) > 1 else '') not in ('200', '304'):
            print(f'  {self.address_string()} — {fmt % args}')


def _normalise_severity(raw, rule=''):
    # load-failure means ansible-lint couldn't even parse the file — always an error
    if 'load-failure' in str(rule).lower():
        return 'error'
    raw = str(raw).lower()
    if raw in ('error', 'critical', 'blocker', 'major', 'very_high', 'high'):
        return 'error'
    if raw in ('info', 'minor', 'low'):
        return 'info'
    return 'warning'


def _clean_playbook(content):
    """Strip leading non-YAML text (explanations, code fences) before linting."""
    lines = content.split('\n')
    for i, line in enumerate(lines):
        s = line.strip()
        if s == '---' or s.startswith('- ') or s.startswith('-\t'):
            return '\n'.join(lines[i:])
    return content


def main():
    parser = argparse.ArgumentParser(description='Launch the Rosetta Stone app')
    parser.add_argument('--port', type=int, default=8000, help='Port to serve on (default: 8000)')
    parser.add_argument('--no-browser', action='store_true', help='Do not auto-open browser')
    args = parser.parse_args()

    script_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(script_dir)

    url = f'http://localhost:{args.port}/index.html'

    # Check ansible-lint availability at startup and tell the user
    lint_bin = _find_ansible_lint()
    if lint_bin:
        try:
            ver = subprocess.run([lint_bin, '--version'], capture_output=True, text=True, timeout=5, env=_subprocess_env())
            lint_info = f'ansible-lint found — {ver.stdout.split(chr(10))[0].strip()} ({lint_bin})'
        except Exception:
            lint_info = f'ansible-lint found at {lint_bin} (version check failed)'
    else:
        lint_info = 'ansible-lint not found — install with: pip install ansible-lint ansible-core'

    try:
        with socketserver.TCPServer(('', args.port), RosettaHandler) as httpd:
            print(f'\n  Rosetta Stone is running at: {url}')
            print(f'  {lint_info}')
            print(f'  Press Ctrl+C to stop.\n')
            if not args.no_browser:
                webbrowser.open(url)
            httpd.serve_forever()
    except KeyboardInterrupt:
        print('\n  Stopped.')
        sys.exit(0)
    except OSError as e:
        if 'Address already in use' in str(e):
            print(f'\n  Port {args.port} is in use. Try: python3 launch.py --port 8080')
        else:
            print(f'\n  Error: {e}')
        sys.exit(1)


if __name__ == '__main__':
    main()
