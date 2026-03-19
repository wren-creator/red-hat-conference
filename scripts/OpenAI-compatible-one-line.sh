#!/usr/bin/env bash
# Usage: ./bash2py.sh myscript.sh > myscript.py
set -euo pipefail

FILE="${1:-}"
: "${FILE:?Usage: $0 <bash-file>}"

API_URL="${API_URL:-http://localhost:11434/v1/chat/completions}"  # Change to your provider
API_KEY="${API_KEY:-unset}"
MODEL="${MODEL:-qwen2.5-coder}"  # Or your model name

CONTENT=$(
  printf 'Convert the following Bash script to Python 3.
- Use argparse for CLI flags
- Replace backticks and $() with subprocess.run()
- Preserve comments and function structure
- Ensure idempotent behavior
- Output only valid Python code; no backticks

```bash
'
  cat "$FILE"
  printf '\n```'
)

curl -s "$API_URL" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d @- <<EOF | jq -r '.choices[0].message.content'
{
  "model": "${MODEL}",
  "messages": [
    {"role":"system","content":"You are a senior Python engineer and Linux SRE."},
    {"role":"user","content": ${CONTENT@Q} }
  ],
  "temperature": 0.1
}
EOF
