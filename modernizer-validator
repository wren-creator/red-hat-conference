#!/bin/bash

SOURCE_DIR="./legacy_scripts"
OUTPUT_DIR="./modern_playbooks"
LOG_DIR="./lint_reports"

mkdir -p "$OUTPUT_DIR" "$LOG_DIR"

echo "Starting AI-powered migration with Verification..."

for script in "$SOURCE_DIR"/*.{sh,py}; do
    [ -e "$script" ] || continue

    filename=$(basename -- "$script")
    base="${filename%.*}"
    target_yml="$OUTPUT_DIR/${base}.yml"

    echo "Converting: $filename..."
    
    # 1. Conversion Step
    cat "$script" | ollama run ansible-modernizer > "$target_yml"

    # 2. Validation Step (The "Red Hat" Way)
    if command -v ansible-lint &> /dev/null; then
        echo "Linting $target_yml..."
        ansible-lint "$target_yml" > "$LOG_DIR/${base}_lint.txt" 2>&1
        
        if [ $? -eq 0 ]; then
            echo "$base: Verified & Valid."
        else
            echo "$base: Conversion completed with linting warnings (see $LOG_DIR)."
        fi
    else
        echo "ansible-lint not found. Skipping verification."
    fi
done

echo "Process complete."
