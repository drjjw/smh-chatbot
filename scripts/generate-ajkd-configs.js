#!/usr/bin/env node

/**
 * Generate configuration files for AJKD Core Curriculum batch training
 * Creates 20 batch files with 5 documents each
 */

const fs = require('fs');
const path = require('path');

// Get all PDF files
const ajkdDir = path.join(__dirname, '..', 'PDFs', 'ajkd-core-curriculum');
const files = fs.readdirSync(ajkdDir)
    .filter(f => f.endsWith('.pdf'))
    .sort();

console.log(`Found ${files.length} PDF files`);

/**
 * Parse filename to extract topic and year
 */
function parseFilename(filename) {
    // Remove .pdf extension
    let name = filename.replace('.pdf', '');
    
    // Extract year from patterns like "2024_2024_yaj", "2020_2", "2021_2021", etc.
    const yearMatch = name.match(/[-_](\d{4})[-_]/);
    const year = yearMatch ? yearMatch[1] : null;
    
    // Remove year suffixes and file extensions
    name = name.replace(/[-_]\d{4}[-_].*$/, '');
    name = name.replace(/[-_]yajkd$/, '');
    name = name.replace(/[-_]\d+$/, '');
    
    // Clean up the topic name
    let topic = name
        .replace(/--Core-Curriculum/g, '')
        .replace(/-Core-Curriculum/g, '')
        .replace(/--/g, '-')
        .replace(/-+/g, ' ')
        .trim();
    
    // Decode HTML entities
    topic = topic.replace(/&#x2013;/g, '–');
    
    // Create slug
    const slug = 'ajkd-cc-' + topic
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    
    return { topic, year, slug };
}

/**
 * Create document configuration
 */
function createDocConfig(filename) {
    const { topic, year, slug } = parseFilename(filename);
    
    const config = {
        slug: slug,
        title: topic,
        subtitle: year ? `Core Curriculum ${year}` : 'Core Curriculum',
        year: year,
        backLink: 'https://www.ajkd.org/',
        welcomeMessage: year ? `AJKD Core Curriculum: ${topic} (${year})` : `AJKD Core Curriculum: ${topic}`,
        pdfFilename: filename,
        pdfSubdirectory: 'ajkd-core-curriculum',
        embeddingTypes: 'both',
        metadata: {
            source: 'AJKD',
            series: 'Core Curriculum',
            topic: topic
        }
    };
    
    return config;
}

/**
 * Generate batch configuration files
 */
function generateBatchConfigs() {
    const batchSize = 5;
    const totalBatches = Math.ceil(files.length / batchSize);
    
    console.log(`\nGenerating ${totalBatches} batch configuration files...\n`);
    
    for (let i = 0; i < totalBatches; i++) {
        const batchNum = String(i + 1).padStart(2, '0');
        const start = i * batchSize;
        const end = Math.min(start + batchSize, files.length);
        const batchFiles = files.slice(start, end);
        
        const documents = batchFiles.map(createDocConfig);
        
        const config = { documents };
        
        const outputPath = path.join(__dirname, '..', `ajkd-batch-${batchNum}.json`);
        fs.writeFileSync(outputPath, JSON.stringify(config, null, 2));
        
        console.log(`✓ Created ajkd-batch-${batchNum}.json (${documents.length} documents)`);
        documents.forEach(doc => {
            console.log(`  - ${doc.slug} (${doc.pdfFilename})`);
        });
        console.log();
    }
    
    console.log(`\n✅ Generated ${totalBatches} batch configuration files`);
    console.log(`📝 Total documents: ${files.length}`);
    console.log(`\nNote: PubMed IDs not included. These can be added manually or via separate lookup script.`);
}

// Run
generateBatchConfigs();


