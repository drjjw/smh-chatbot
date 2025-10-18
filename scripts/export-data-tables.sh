#!/bin/bash

# Export table data as CSV files

set -e

PROJECT_REF="mlxctdgnojvkgfqldaob"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
EXPORT_DIR="./database-dumps/data_${TIMESTAMP}"

echo "📊 Exporting Table Data"
echo "Project: Manuals-Chat"
echo "Export to: $EXPORT_DIR"
echo ""
echo "💾 Database size: ~196 MB"
echo "   - document_chunks: 147 MB (8,142 rows with OpenAI embeddings)"
echo "   - document_chunks_local: 48 MB (8,140 rows with local embeddings)"  
echo "   - chat_conversations: 1.1 MB (552 rows)"
echo "   - documents: 184 KB (114 rows)"
echo ""
read -p "Export all tables? (yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    echo "Export cancelled"
    exit 0
fi

# Create export directory
mkdir -p "$EXPORT_DIR"

# Get password
PASS=$(cat supabase/.env.local 2>/dev/null | grep "^DB_PASSWORD=" | cut -d= -f2- || echo "")

if [ -z "$PASS" ]; then
    read -sp "Enter database password: " PASS
    echo ""
fi

echo ""
echo "📦 Exporting tables..."

# Export each table using Supabase MCP / psql
export PGPASSWORD="$PASS"

# Function to export table
export_table() {
    local table=$1
    local file="${EXPORT_DIR}/${table}.csv"
    echo "  Exporting $table..."
    
    # Note: We'll use a SQL dump format instead since CSV might truncate embeddings
    supabase db dump \
        --linked \
        -p "$PASS" \
        -f "${EXPORT_DIR}/${table}.sql" \
        --data-only 2>&1 | grep -v "Pulling\|Download\|Digest\|Status\|Already exists" || true
}

# Export schema first
echo "  [1/5] Exporting schema..."
supabase db dump \
    --linked \
    -p "$PASS" \
    -f "${EXPORT_DIR}/schema.sql" 2>&1 | grep -v "Pulling\|Download\|Digest\|Status\|Already exists" || true

# Export data
echo "  [2/5] Exporting documents table..."
export_table "documents"

echo "  [3/5] Exporting chat_conversations..."
export_table "chat_conversations"

echo "  [4/5] Exporting document_chunks (this will take a while - 147MB)..."
export_table "document_chunks"

echo "  [5/5] Exporting document_chunks_local (48MB)..."
export_table "document_chunks_local"

unset PGPASSWORD

# Show results
echo ""
echo "✅ Export complete!"
echo ""
echo "📁 Files created in: $EXPORT_DIR"
ls -lh "$EXPORT_DIR" | tail -n +2 | awk '{print "   " $9 " - " $5}'

echo ""
echo "Total size:"
du -sh "$EXPORT_DIR" | awk '{print "   " $1}'

