#!/bin/bash

# AJKD Core Curriculum Batch Training Automation Script
# Runs all 20 batches sequentially with error handling

set -e  # Exit on error

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

echo "========================================="
echo "AJKD Core Curriculum Batch Training"
echo "========================================="
echo ""
echo "Total batches: 20"
echo "Documents per batch: 5"
echo "Total documents: 100"
echo "Estimated time: 2-3 hours"
echo ""
echo "Starting at: $(date)"
echo ""

START_TIME=$(date +%s)
FAILED_BATCHES=()
SUCCESSFUL_BATCHES=0

for i in $(seq -f "%02g" 1 20); do
    BATCH_FILE="ajkd-batch-$i.json"
    
    echo "========================================="
    echo "Processing Batch $i/20"
    echo "Config: $BATCH_FILE"
    echo "========================================="
    echo ""
    
    if [ ! -f "$BATCH_FILE" ]; then
        echo "❌ Error: $BATCH_FILE not found"
        FAILED_BATCHES+=("$i")
        continue
    fi
    
    BATCH_START=$(date +%s)
    
    if node scripts/batch-train-documents.js --config="$BATCH_FILE"; then
        BATCH_END=$(date +%s)
        BATCH_DURATION=$((BATCH_END - BATCH_START))
        echo ""
        echo "✅ Batch $i completed successfully in ${BATCH_DURATION}s"
        SUCCESSFUL_BATCHES=$((SUCCESSFUL_BATCHES + 1))
    else
        BATCH_END=$(date +%s)
        BATCH_DURATION=$((BATCH_END - BATCH_START))
        echo ""
        echo "❌ Batch $i failed after ${BATCH_DURATION}s"
        FAILED_BATCHES+=("$i")
        
        # Ask user if they want to continue
        echo ""
        read -p "Continue with next batch? (y/n) " -n 1 -r
        echo ""
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            echo "Stopping batch processing"
            break
        fi
    fi
    
    echo ""
    echo "Progress: $SUCCESSFUL_BATCHES/20 batches completed"
    echo ""
    
    # Small delay between batches to avoid rate limits
    if [ $i -lt 20 ]; then
        echo "Waiting 5 seconds before next batch..."
        sleep 5
    fi
done

END_TIME=$(date +%s)
TOTAL_DURATION=$((END_TIME - START_TIME))
HOURS=$((TOTAL_DURATION / 3600))
MINUTES=$(((TOTAL_DURATION % 3600) / 60))
SECONDS=$((TOTAL_DURATION % 60))

echo ""
echo "========================================="
echo "BATCH TRAINING COMPLETE"
echo "========================================="
echo ""
echo "Finished at: $(date)"
echo "Total time: ${HOURS}h ${MINUTES}m ${SECONDS}s"
echo "Successful batches: $SUCCESSFUL_BATCHES/20"

if [ ${#FAILED_BATCHES[@]} -gt 0 ]; then
    echo "Failed batches: ${FAILED_BATCHES[*]}"
    echo ""
    echo "⚠️  Some batches failed. Review errors above."
    exit 1
else
    echo ""
    echo "✅ All batches completed successfully!"
    echo ""
    echo "Next steps:"
    echo "1. Restart the server to load new documents"
    echo "2. Clear browser localStorage cache"
    echo "3. Verify documents in browser"
    exit 0
fi

