#!/usr/bin/env python3
"""
Rosetta Stone — Launch Script
Serves the app locally and opens it in your browser.
Requires Python 3.6+ only. No pip installs needed.

Usage:
  python3 launch.py
  python3 launch.py --port 8080
"""
import http.server
import socketserver
import webbrowser
import argparse
import os
import sys

def main():
    parser = argparse.ArgumentParser(description='Launch the Rosetta Stone app')
    parser.add_argument('--port', type=int, default=8000, help='Port to serve on (default: 8000)')
    parser.add_argument('--no-browser', action='store_true', help='Do not auto-open browser')
    args = parser.parse_args()

    # Serve from the directory containing this script
    script_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(script_dir)

    handler = http.server.SimpleHTTPRequestHandler
    handler.extensions_map.update({'.html': 'text/html'})

    url = f'http://localhost:{args.port}/rosetta-stone.html'

    try:
        with socketserver.TCPServer(('', args.port), handler) as httpd:
            print(f'\n  Rosetta Stone is running at: {url}')
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
