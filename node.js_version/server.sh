#!/bin/bash
# Start/stop/status/restart for the Rosetta Stone server.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_FILE="$DIR/.server.pid"
LOG_FILE="$DIR/.server.log"
PORT="${PORT:-3000}"

is_running() {
  [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null
}

start() {
  if is_running; then
    echo "Already running (pid $(cat "$PID_FILE"))."
    return 0
  fi

  local port_pid
  port_pid="$(lsof -ti ":$PORT" 2>/dev/null || true)"
  if [ -n "$port_pid" ]; then
    echo "Port $PORT is already in use by pid $port_pid (not started by this script)."
    echo "Stop it yourself, or run: kill $port_pid"
    return 1
  fi

  (cd "$DIR" && nohup npm start > "$LOG_FILE" 2>&1 &)
  sleep 1

  local pid
  pid="$(lsof -ti ":$PORT" 2>/dev/null || true)"
  if [ -z "$pid" ]; then
    echo "Failed to start — check $LOG_FILE"
    return 1
  fi

  echo "$pid" > "$PID_FILE"
  echo "Started (pid $pid). Logs: $LOG_FILE"
}

stop() {
  if ! is_running; then
    echo "Not running."
    rm -f "$PID_FILE"
    return 0
  fi

  local pid
  pid="$(cat "$PID_FILE")"
  kill "$pid"
  rm -f "$PID_FILE"
  echo "Stopped (pid $pid)."
}

status() {
  if is_running; then
    echo "Running (pid $(cat "$PID_FILE"), port $PORT)."
  else
    echo "Not running."
  fi
}

case "${1:-}" in
  start)   start ;;
  stop)    stop ;;
  status)  status ;;
  restart) stop || true; start ;;
  *)
    echo "Usage: $0 {start|stop|status|restart}"
    exit 1
    ;;
esac
