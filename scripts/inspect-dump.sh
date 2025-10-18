#!/bin/bash

# Inspect a database dump file without restoring it

set -e

DUMP_DIR="./database-dumps"

# Colors
BLUE='\033[0;34m'
GREEN='\033[0;32m'
NC='\033[0m'

echo -e "${BLUE}=== Database Dump Inspector ===${NC}"
echo ""

# List available dumps
if [ ! -d "$DUMP_DIR" ]; then
    echo "❌ Dump directory not found: $DUMP_DIR"
    exit 1
fi

dumps=($(ls -t "$DUMP_DIR"/*.sql 2>/dev/null || true))

if [ ${#dumps[@]} -eq 0 ]; then
    echo "❌ No SQL dump files found in $DUMP_DIR"
    exit 1
fi

echo "Available dump files:"
for i in "${!dumps[@]}"; do
    size=$(du -h "${dumps[$i]}" | cut -f1)
    echo "$((i+1))) $(basename "${dumps[$i]}") ($size)"
done

echo ""
read -p "Select dump file number (1-${#dumps[@]}): " SELECTION

if ! [[ "$SELECTION" =~ ^[0-9]+$ ]] || [ "$SELECTION" -lt 1 ] || [ "$SELECTION" -gt ${#dumps[@]} ]; then
    echo "❌ Invalid selection"
    exit 1
fi

DUMP_FILE="${dumps[$((SELECTION-1))]}"
echo ""
echo -e "${GREEN}Inspecting: $(basename "$DUMP_FILE")${NC}"
echo ""

# File info
echo "📁 File Information:"
echo "  Size: $(du -h "$DUMP_FILE" | cut -f1)"
echo "  Lines: $(wc -l < "$DUMP_FILE" | xargs)"
echo "  Modified: $(date -r "$DUMP_FILE" "+%Y-%m-%d %H:%M:%S")"
echo ""

# Extract table names
echo "📊 Tables in dump:"
grep "^CREATE TABLE" "$DUMP_FILE" | sed 's/CREATE TABLE /  - /' | sed 's/ ($//'
echo ""

# Count INSERT statements
insert_count=$(grep -c "^INSERT INTO\|^COPY" "$DUMP_FILE" || echo "0")
echo "📝 Data Operations: $insert_count"
echo ""

# Show functions
func_count=$(grep -c "^CREATE FUNCTION\|^CREATE OR REPLACE FUNCTION" "$DUMP_FILE" || echo "0")
if [ "$func_count" -gt 0 ]; then
    echo "⚙️  Functions: $func_count"
    grep "^CREATE FUNCTION\|^CREATE OR REPLACE FUNCTION" "$DUMP_FILE" | head -5
    echo ""
fi

# Show triggers
trigger_count=$(grep -c "^CREATE TRIGGER" "$DUMP_FILE" || echo "0")
if [ "$trigger_count" -gt 0 ]; then
    echo "🔔 Triggers: $trigger_count"
    grep "^CREATE TRIGGER" "$DUMP_FILE" | head -5
    echo ""
fi

# Show indexes
index_count=$(grep -c "^CREATE INDEX\|^CREATE UNIQUE INDEX" "$DUMP_FILE" || echo "0")
echo "🔍 Indexes: $index_count"
echo ""

# Show first and last few lines (for context)
echo "📄 Dump Preview (first 10 lines):"
echo "---"
head -10 "$DUMP_FILE"
echo "---"

