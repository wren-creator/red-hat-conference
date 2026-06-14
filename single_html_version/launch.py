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
        try:
            ver = subprocess.run(
                ['ansible-lint', '--version'],
                capture_output=True, text=True, timeout=5
            )
            lint_version = ver.stdout.split('\n')[0].strip()
        except FileNotFoundError:
            self._json(200, {
                'available': False,
                'error': 'ansible-lint not found',
                'install': 'pip install ansible-lint ansible-core'
            })
            return
        except Exception as e:
            self._json(200, {'available': False, 'error': str(e)})
            return

        # Write playbook to a temp file
        tmp = None
        try:
            with tempfile.NamedTemporaryFile(
                mode='w', suffix='.yml', prefix='rosetta_', delete=False
            ) as f:
                f.write(playbook)
                tmp = f.name

            result = subprocess.run(
                ['ansible-lint', '--format', 'json', '--nocolor', tmp],
                capture_output=True, text=True, timeout=30
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
                    'severity': _normalise_severity(v.get('severity', 'warning')),
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


def _normalise_severity(raw):
    raw = str(raw).lower()
    if raw in ('error', 'critical', 'blocker', 'major'):
        return 'error'
    if raw in ('info', 'minor'):
        return 'info'
    return 'warning'


def main():
    parser = argparse.ArgumentParser(description='Launch the Rosetta Stone app')
    parser.add_argument('--port', type=int, default=8000, help='Port to serve on (default: 8000)')
    parser.add_argument('--no-browser', action='store_true', help='Do not auto-open browser')
    args = parser.parse_args()

    script_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(script_dir)

    url = f'http://localhost:{args.port}/index.html'

    # Check ansible-lint availability at startup and tell the user
    try:
        ver = subprocess.run(['ansible-lint', '--version'], capture_output=True, text=True, timeout=5)
        lint_info = f'ansible-lint found — {ver.stdout.split(chr(10))[0].strip()}'
    except FileNotFoundError:
        lint_info = 'ansible-lint not found — install with: pip install ansible-lint ansible-core'
    except Exception:
        lint_info = 'ansible-lint status unknown'

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
