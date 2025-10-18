#!/bin/bash

# Supabase Database Dump Script
# This script exports the entire database (schema + data) using pg_dump

set -e

# Configuration
PROJECT_REF="mlxctdgnojvkgfqldaob"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DUMP_DIR="./database-dumps"
SCHEMA_FILE="${DUMP_DIR}/schema_${TIMESTAMP}.sql"
DATA_FILE="${DUMP_DIR}/data_${TIMESTAMP}.sql"
FULL_FILE="${DUMP_DIR}/full_dump_${TIMESTAMP}.sql"
CUSTOM_FILE="${DUMP_DIR}/full_dump_${TIMESTAMP}.dump"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== Supabase Database Dump ===${NC}"
echo "Project: Manuals-Chat"
echo "Timestamp: $TIMESTAMP"
echo ""

# Create dump directory if it doesn't exist
mkdir -p "$DUMP_DIR"

# Check if supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo -e "${RED}Error: Supabase CLI is not installed${NC}"
    echo "Install it with: brew install supabase/tap/supabase"
    exit 1
fi

# Check if logged in
echo -e "${BLUE}Checking Supabase connection...${NC}"
if ! supabase projects list &>/dev/null; then
    echo -e "${RED}Error: Not logged in to Supabase${NC}"
    echo "Run: supabase login"
    exit 1
fi

echo -e "${GREEN}✓ Connected to database${NC}"
echo ""

# Export options
echo "Select dump type:"
echo "1) Full dump (schema + data) - SQL format"
echo "2) Schema only"
echo "3) Data only"
echo "4) Full dump - Custom format (for pg_restore)"
echo "5) All of the above"
read -p "Enter choice (1-5) [default: 1]: " CHOICE
CHOICE=${CHOICE:-1}

echo ""
echo -e "${BLUE}Starting export...${NC}"

case $CHOICE in
    1)
        echo "Exporting full database (schema + data)..."
        supabase db dump --linked -f "$FULL_FILE"
        echo -e "${GREEN}✓ Full dump saved to: $FULL_FILE${NC}"
        ;;
    2)
        echo "Exporting schema only..."
        supabase db dump --linked -f "$SCHEMA_FILE" --schema-only
        # Note: supabase CLI doesn't have --schema-only flag, falling back to pg_dump
        echo -e "${BLUE}Note: Getting connection string for schema-only dump...${NC}"
        PASS=$(cat supabase/.env.local 2>/dev/null | grep DB_PASSWORD | cut -d= -f2 || echo "")
        if [ -z "$PASS" ]; then
            read -sp "Enter database password: " PASS
            echo ""
        fi
        DB_URL="postgresql://postgres:${PASS}@db.mlxctdgnojvkgfqldaob.supabase.co:5432/postgres"
        pg_dump "$DB_URL" --schema-only --no-owner --no-privileges --clean --if-exists --file="$SCHEMA_FILE"
        echo -e "${GREEN}✓ Schema saved to: $SCHEMA_FILE${NC}"
        ;;
    3)
        echo "Exporting data only..."
        supabase db dump --linked -f "$DATA_FILE" --data-only
        echo -e "${GREEN}✓ Data saved to: $DATA_FILE${NC}"
        ;;
    4)
        echo "Exporting full database (custom format)..."
        echo -e "${BLUE}Note: Getting connection string for custom format...${NC}"
        PASS=$(cat supabase/.env.local 2>/dev/null | grep DB_PASSWORD | cut -d= -f2 || echo "")
        if [ -z "$PASS" ]; then
            read -sp "Enter database password: " PASS
            echo ""
        fi
        DB_URL="postgresql://postgres:${PASS}@db.mlxctdgnojvkgfqldaob.supabase.co:5432/postgres"
        pg_dump "$DB_URL" --format=custom --no-owner --no-privileges --clean --if-exists --file="$CUSTOM_FILE"
        echo -e "${GREEN}✓ Custom dump saved to: $CUSTOM_FILE${NC}"
        echo -e "${BLUE}Note: Use pg_restore to import this file${NC}"
        ;;
    5)
        echo "Exporting all formats..."
        
        echo "  [1/3] Full SQL dump..."
        supabase db dump --linked -f "$FULL_FILE"
        
        echo "  [2/3] Data only..."
        supabase db dump --linked -f "$DATA_FILE" --data-only
        
        echo "  [3/3] Schema and custom format (requires password)..."
        PASS=$(cat supabase/.env.local 2>/dev/null | grep DB_PASSWORD | cut -d= -f2 || echo "")
        if [ -z "$PASS" ]; then
            read -sp "Enter database password: " PASS
            echo ""
        fi
        DB_URL="postgresql://postgres:${PASS}@db.mlxctdgnojvkgfqldaob.supabase.co:5432/postgres"
        pg_dump "$DB_URL" --schema-only --no-owner --no-privileges --clean --if-exists --file="$SCHEMA_FILE"
        pg_dump "$DB_URL" --format=custom --no-owner --no-privileges --clean --if-exists --file="$CUSTOM_FILE"
        
        echo -e "${GREEN}✓ All dumps saved:${NC}"
        echo "  - Full: $FULL_FILE"
        echo "  - Schema: $SCHEMA_FILE"
        echo "  - Data: $DATA_FILE"
        echo "  - Custom: $CUSTOM_FILE"
        ;;
    *)
        echo -e "${RED}Invalid choice${NC}"
        exit 1
        ;;
esac

# Show dump statistics
echo ""
echo -e "${BLUE}=== Dump Statistics ===${NC}"
for file in "$FULL_FILE" "$SCHEMA_FILE" "$DATA_FILE" "$CUSTOM_FILE"; do
    if [ -f "$file" ]; then
        size=$(du -h "$file" | cut -f1)
        echo "$(basename "$file"): $size"
    fi
done

echo ""
echo -e "${GREEN}✓ Database export complete!${NC}"
echo ""
echo -e "${BLUE}To restore:${NC}"
echo "  SQL format: psql <connection-string> -f <dump-file.sql>"
echo "  Custom format: pg_restore --no-owner --no-privileges -d <connection-string> <dump-file.dump>"


