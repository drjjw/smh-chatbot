#!/bin/bash

# Deployment script for bot.ukidney.com Manual Assistant
# Usage: ./deploy.sh

set -e

echo "🚀 Deploying Manual Assistant to bot.ukidney.com"
echo "=============================================="

# Configuration
SERVER_USER="root"
SERVER_HOST="bot.ukidney.com"
DEPLOY_PATH="/home/ukidney/bot.ukidney.com"
LOCAL_PATH="/Users/jordanweinstein/Downloads/chat"

echo ""
echo "📦 Preparing files for deployment..."

# Create temporary deployment directory
TEMP_DIR=$(mktemp -d)
echo "   Creating temp directory: $TEMP_DIR"

# Copy necessary files
cp -r "$LOCAL_PATH/public" "$TEMP_DIR/"
cp "$LOCAL_PATH/server.js" "$TEMP_DIR/"
cp "$LOCAL_PATH/package.json" "$TEMP_DIR/"
cp "$LOCAL_PATH/.env" "$TEMP_DIR/"
cp "$LOCAL_PATH/SMH Nephrology Housestaff Manual.- 2023.pdf" "$TEMP_DIR/"

# Optional documentation
cp "$LOCAL_PATH/README.md" "$TEMP_DIR/" 2>/dev/null || true
cp "$LOCAL_PATH/DEPLOYMENT.md" "$TEMP_DIR/" 2>/dev/null || true

echo "   ✓ Files prepared"

echo ""
echo "📤 Uploading to server..."
echo "   Target: $SERVER_USER@$SERVER_HOST:$DEPLOY_PATH"

# Upload files (replace with your actual upload method)
echo ""
echo "Please run one of these commands to upload:"
echo ""
echo "Option 1 - SCP:"
echo "scp -r $TEMP_DIR/* $SERVER_USER@$SERVER_HOST:$DEPLOY_PATH/"
echo ""
echo "Option 2 - RSYNC:"
echo "rsync -avz --delete $TEMP_DIR/ $SERVER_USER@$SERVER_HOST:$DEPLOY_PATH/"
echo ""
echo "Option 3 - FTP/SFTP:"
echo "Use your FTP client to upload $TEMP_DIR/* to $DEPLOY_PATH"
echo ""

read -p "Have you uploaded the files? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Deployment cancelled."
    rm -rf "$TEMP_DIR"
    exit 1
fi

echo ""
echo "🔧 Setting up on server..."
echo "Run these commands on your server:"
echo ""
echo "cd $DEPLOY_PATH"
echo "npm install --production"
echo "pm2 start server.js --name manual-bot"
echo "pm2 save"
echo ""

echo "📊 After deployment, test with:"
echo "curl https://bot.ukidney.com/api/health"
echo ""

# Cleanup
rm -rf "$TEMP_DIR"
echo "✅ Deployment preparation complete!"

