#!/bin/bash

# Save database password for use with dump scripts

set -e

PROJECT_REF="mlxctdgnojvkgfqldaob"

echo "🔐 Database Password Setup"
echo "Project: Manuals-Chat"
echo ""
echo "This will save your database password locally for automated dumps."
echo "The password will be stored in supabase/.env.local"
echo ""

# Create supabase directory if it doesn't exist
mkdir -p supabase

# Check if password already exists
if [ -f "supabase/.env.local" ] && grep -q "DB_PASSWORD" supabase/.env.local 2>/dev/null; then
    echo "✓ Password already configured in supabase/.env.local"
    read -p "Do you want to update it? (yes/no): " UPDATE
    if [ "$UPDATE" != "yes" ]; then
        echo "Keeping existing password."
        exit 0
    fi
fi

# Get password from user
read -sp "Enter your database password: " PASSWORD
echo ""

# Save to .env.local
if [ -f "supabase/.env.local" ]; then
    # Update existing file
    if grep -q "DB_PASSWORD" supabase/.env.local; then
        # Replace existing line
        sed -i.bak "s/^DB_PASSWORD=.*/DB_PASSWORD=$PASSWORD/" supabase/.env.local
        rm supabase/.env.local.bak
    else
        # Add new line
        echo "DB_PASSWORD=$PASSWORD" >> supabase/.env.local
    fi
else
    # Create new file
    echo "DB_PASSWORD=$PASSWORD" > supabase/.env.local
fi

chmod 600 supabase/.env.local

echo ""
echo "✅ Password saved successfully!"
echo ""
echo "You can now run dump scripts without entering the password:"
echo "  ./scripts/dump-database-quick.sh"
echo ""
echo "Note: The password is stored in supabase/.env.local (gitignored)"

