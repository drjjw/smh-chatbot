#!/usr/bin/env node

/**
 * Fix duplicate slugs in AJKD batch configuration files
 * Adds year suffix or sequential number to duplicates
 */

const fs = require('fs');
const path = require('path');

// Track all slugs across all batches
const slugCounts = {};
const slugsByBatch = {};

// First pass: count all slugs
for (let i = 1; i <= 20; i++) {
    const batchNum = String(i).padStart(2, '0');
    const batchFile = path.join(__dirname, '..', `ajkd-batch-${batchNum}.json`);
    
    if (!fs.existsSync(batchFile)) continue;
    
    const config = JSON.parse(fs.readFileSync(batchFile, 'utf8'));
    slugsByBatch[batchNum] = config.documents.map((doc, idx) => ({
        ...doc,
        originalIndex: idx
    }));
    
    config.documents.forEach(doc => {
        if (!slugCounts[doc.slug]) {
            slugCounts[doc.slug] = [];
        }
        slugCounts[doc.slug].push({ batch: batchNum, doc });
    });
}

// Find duplicates
const duplicates = Object.entries(slugCounts).filter(([slug, docs]) => docs.length > 1);

console.log(`Found ${duplicates.length} duplicate slugs:\n`);

duplicates.forEach(([slug, docs]) => {
    console.log(`  ${slug}: ${docs.length} occurrences`);
    docs.forEach(({ batch, doc }) => {
        console.log(`    - Batch ${batch}: ${doc.pdfFilename} (year: ${doc.year || 'null'})`);
    });
    console.log();
});

// Fix duplicates by adding year or sequence number
console.log('Fixing duplicates...\n');

duplicates.forEach(([baseSlug, docs]) => {
    // Sort by year if available
    docs.sort((a, b) => {
        const yearA = a.doc.year ? parseInt(a.doc.year) : 0;
        const yearB = b.doc.year ? parseInt(b.doc.year) : 0;
        return yearA - yearB;
    });
    
    docs.forEach(({ batch, doc }, idx) => {
        const batchDocs = slugsByBatch[batch];
        const docIndex = batchDocs.findIndex(d => 
            d.pdfFilename === doc.pdfFilename && d.slug === doc.slug
        );
        
        if (docIndex === -1) return;
        
        // Generate new unique slug
        let newSlug;
        if (doc.year) {
            newSlug = `${baseSlug}-${doc.year}`;
        } else {
            newSlug = `${baseSlug}-${idx + 1}`;
        }
        
        console.log(`  Batch ${batch}: ${baseSlug} → ${newSlug}`);
        batchDocs[docIndex].slug = newSlug;
    });
});

// Write updated configs
console.log('\nWriting updated configuration files...\n');

Object.entries(slugsByBatch).forEach(([batchNum, docs]) => {
    const batchFile = path.join(__dirname, '..', `ajkd-batch-${batchNum}.json`);
    const config = {
        documents: docs.map(({ originalIndex, ...doc }) => doc)
    };
    fs.writeFileSync(batchFile, JSON.stringify(config, null, 2));
    console.log(`  ✓ Updated ajkd-batch-${batchNum}.json`);
});

console.log('\n✅ All duplicate slugs fixed!');


