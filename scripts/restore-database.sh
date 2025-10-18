#!/bin/bash

# Supabase Database Restore Script
# This script restores a database dump

set -e

PROJECT_ID="mlxctdgnojvkgfqldaob"
DUMP_DIR="./database-dumps"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}=== Supabase Database Restore ===${NC}"
echo "Project ID: $PROJECT_ID"
echo ""

# Check if supabase CLI is installed and logged in
if ! command -v supabase &> /dev/null; then
    echo -e "${RED}Error: Supabase CLI is not installed${NC}"
    echo "Install it with: brew install supabase/tap/supabase"
    exit 1
fi

if ! supabase projects list &>/dev/null; then
    echo -e "${RED}Error: Not logged in to Supabase${NC}"
    echo "Run: supabase login"
    exit 1
fi

# List available dumps
echo -e "${BLUE}Available dump files:${NC}"
if [ -d "$DUMP_DIR" ]; then
    dumps=($(ls -t "$DUMP_DIR"/*.sql "$DUMP_DIR"/*.dump 2>/dev/null || true))
    
    if [ ${#dumps[@]} -eq 0 ]; then
        echo -e "${RED}No dump files found in $DUMP_DIR${NC}"
        exit 1
    fi
    
    for i in "${!dumps[@]}"; do
        size=$(du -h "${dumps[$i]}" | cut -f1)
        echo "$((i+1))) $(basename "${dumps[$i]}") ($size)"
    done
else
    echo -e "${RED}Dump directory not found: $DUMP_DIR${NC}"
    exit 1
fi

echo ""
read -p "Select dump file number (1-${#dumps[@]}): " SELECTION

if ! [[ "$SELECTION" =~ ^[0-9]+$ ]] || [ "$SELECTION" -lt 1 ] || [ "$SELECTION" -gt ${#dumps[@]} ]; then
    echo -e "${RED}Invalid selection${NC}"
    exit 1
fi

DUMP_FILE="${dumps[$((SELECTION-1))]}"
echo ""
echo -e "${YELLOW}⚠️  WARNING: This will restore data to your database${NC}"
echo -e "${YELLOW}⚠️  Existing data may be modified or replaced${NC}"
echo ""
read -p "Are you sure you want to continue? (yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    echo "Restore cancelled"
    exit 0
fi

# Get database password
echo ""
echo -e "${BLUE}Preparing to restore...${NC}"

PASS=$(cat supabase/.env.local 2>/dev/null | grep DB_PASSWORD | cut -d= -f2 || echo "")

if [ -z "$PASS" ]; then
    echo "Database password required for restore."
    read -sp "Enter database password: " PASS
    echo ""
fi

DB_URL="postgresql://postgres:${PASS}@db.${PROJECT_ID}.supabase.co:5432/postgres"

echo -e "${GREEN}✓ Ready to restore${NC}"
echo ""

# Restore based on file type
if [[ "$DUMP_FILE" == *.dump ]]; then
    echo -e "${BLUE}Restoring from custom format dump...${NC}"
    pg_restore --no-owner --no-privileges --clean --if-exists -d "$DB_URL" "$DUMP_FILE" 2>/dev/null
else
    echo -e "${BLUE}Restoring from SQL dump...${NC}"
    psql "$DB_URL" -f "$DUMP_FILE" 2>/dev/null
fi

echo ""
echo -e "${GREEN}✓ Database restore complete!${NC}"

