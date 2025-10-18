#!/usr/bin/env node

/**
 * Batch Document Training Script
 * 
 * This script automates the process of adding and training multiple documents:
 * 1. Reads document configurations from a JSON file
 * 2. Adds documents to the database registry
 * 3. Updates build.js with new PDF paths
 * 4. Trains documents with both OpenAI and local embeddings
 * 5. Generates summary reports
 * 
 * Usage:
 *   node scripts/batch-train-documents.js --config documents-to-train.json
 *   node scripts/batch-train-documents.js --config documents-to-train.json --skip-openai
 *   node scripts/batch-train-documents.js --config documents-to-train.json --skip-local
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { execSync } = require('child_process');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// Initialize Supabase client
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Validate document configuration
 */
function validateDocumentConfig(doc, index) {
    const required = ['slug', 'title', 'pdfFilename', 'pdfSubdirectory', 'embeddingTypes'];
    const missing = required.filter(field => !doc[field]);
    
    if (missing.length > 0) {
        throw new Error(`Document ${index + 1} is missing required fields: ${missing.join(', ')}`);
    }
    
    // Validate embedding types
    const validTypes = ['openai', 'local', 'both'];
    if (!validTypes.includes(doc.embeddingTypes)) {
        throw new Error(`Document ${index + 1} has invalid embeddingTypes: ${doc.embeddingTypes}. Must be one of: ${validTypes.join(', ')}`);
    }
    
    // Check if PDF exists
    const pdfPath = path.join(__dirname, '..', 'PDFs', doc.pdfSubdirectory, doc.pdfFilename);
    if (!fs.existsSync(pdfPath)) {
        throw new Error(`PDF file not found: ${pdfPath}`);
    }
    
    return true;
}

/**
 * Add document to database registry
 * Note: Creates ONE document entry with a primary embedding type.
 * The ?embedding= URL parameter allows switching between OpenAI and local at runtime.
 */
async function addDocumentToRegistry(doc) {
    const embeddingTypes = doc.embeddingTypes === 'both' 
        ? ['openai', 'local'] 
        : [doc.embeddingTypes];
    
    // Determine primary embedding type (prefer OpenAI if both are specified)
    const primaryEmbeddingType = embeddingTypes.includes('openai') ? 'openai' : 'local';
    
    // Prepare metadata with PubMed info if provided
    const metadata = doc.metadata || {};
    if (doc.pubmedId) {
        metadata.pubmed_id = doc.pubmedId;
        metadata.pubmed_url = `https://pubmed.ncbi.nlm.nih.gov/${doc.pubmedId}/`;
    }
    
    const record = {
        slug: doc.slug,
        title: doc.title,
        subtitle: doc.subtitle || null,
        back_link: doc.backLink || null,
        welcome_message: doc.welcomeMessage || doc.title,
        pdf_filename: doc.pdfFilename,
        pdf_subdirectory: doc.pdfSubdirectory,
        embedding_type: primaryEmbeddingType,
        year: doc.year || null,
        active: true,
        metadata: metadata
    };
    
    // Check if document already exists
    const { data: existing } = await supabase
        .from('documents')
        .select('slug')
        .eq('slug', doc.slug)
        .single();
    
    if (existing) {
        console.log(`  ⊘ Document ${doc.slug} already exists in registry, skipping...`);
        // Return results for all embedding types that will be trained
        return embeddingTypes.map(type => ({ 
            slug: doc.slug, 
            status: 'exists', 
            embeddingType: type 
        }));
    }
    
    // Insert document
    const { data, error } = await supabase
        .from('documents')
        .insert([record])
        .select();
    
    if (error) {
        throw new Error(`Failed to insert ${doc.slug}: ${error.message}`);
    }
    
    console.log(`  ✓ Added ${doc.slug} to registry (primary: ${primaryEmbeddingType})`);
    
    // Return results for all embedding types that will be trained
    return embeddingTypes.map(type => ({ 
        slug: doc.slug, 
        status: 'added', 
        embeddingType: type 
    }));
}

/**
 * Update build.js with new PDF path
 */
function updateBuildScript(pdfSubdirectory, pdfFilename) {
    const buildPath = path.join(__dirname, '..', 'build.js');
    let buildContent = fs.readFileSync(buildPath, 'utf8');
    
    const pdfPath = `PDFs/${pdfSubdirectory}/${pdfFilename}`;
    const pdfEntry = `    { from: '${pdfPath}', to: '${pdfPath}' }`;
    
    // Check if already in build.js
    if (buildContent.includes(pdfPath)) {
        console.log(`  ⊘ PDF already in build.js: ${pdfPath}`);
        return false;
    }
    
    // Find the pdfFiles array and add the new entry
    const pdfFilesRegex = /(const pdfFiles = \[[\s\S]*?)(\n\];)/;
    const match = buildContent.match(pdfFilesRegex);
    
    if (!match) {
        throw new Error('Could not find pdfFiles array in build.js');
    }
    
    // Add comma to last entry if needed
    let updatedArray = match[1];
    if (!updatedArray.trim().endsWith(',')) {
        updatedArray += ',';
    }
    
    updatedArray += `\n${pdfEntry}`;
    buildContent = buildContent.replace(pdfFilesRegex, updatedArray + match[2]);
    
    fs.writeFileSync(buildPath, buildContent);
    console.log(`  ✓ Added to build.js: ${pdfPath}`);
    return true;
}

/**
 * Train document with embeddings
 */
function trainDocument(slug, embeddingType, skipOpenai, skipLocal) {
    const isLocal = embeddingType === 'local';
    
    if (isLocal && skipLocal) {
        console.log(`  ⊘ Skipping local embeddings for ${slug} (--skip-local flag)`);
        return { slug, embeddingType, status: 'skipped' };
    }
    
    if (!isLocal && skipOpenai) {
        console.log(`  ⊘ Skipping OpenAI embeddings for ${slug} (--skip-openai flag)`);
        return { slug, embeddingType, status: 'skipped' };
    }
    
    const scriptName = isLocal ? 'chunk-and-embed-local.js' : 'chunk-and-embed.js';
    const scriptPath = path.join(__dirname, scriptName);
    
    console.log(`\n  🔄 Training ${slug} with ${embeddingType} embeddings...`);
    
    try {
        const startTime = Date.now();
        execSync(`node "${scriptPath}" --doc=${slug}`, {
            stdio: 'inherit',
            cwd: path.join(__dirname, '..')
        });
        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        
        console.log(`  ✓ Completed ${slug} (${embeddingType}) in ${duration}s`);
        return { slug, embeddingType, status: 'success', duration };
    } catch (error) {
        console.error(`  ✗ Failed to train ${slug} (${embeddingType}):`, error.message);
        return { slug, embeddingType, status: 'failed', error: error.message };
    }
}

/**
 * Generate summary report
 */
function generateSummary(results, totalTime) {
    console.log('\n' + '='.repeat(70));
    console.log('📊 BATCH TRAINING SUMMARY');
    console.log('='.repeat(70));
    
    const added = results.registry.filter(r => r.status === 'added');
    const exists = results.registry.filter(r => r.status === 'exists');
    const trained = results.training.filter(r => r.status === 'success');
    const failed = results.training.filter(r => r.status === 'failed');
    const skipped = results.training.filter(r => r.status === 'skipped');
    
    console.log('\n📝 Registry Updates:');
    console.log(`   ✓ Added: ${added.length} documents`);
    if (exists.length > 0) {
        console.log(`   ⊘ Already existed: ${exists.length} documents`);
    }
    
    console.log('\n🔢 Embedding Training:');
    console.log(`   ✓ Successfully trained: ${trained.length} documents`);
    if (failed.length > 0) {
        console.log(`   ✗ Failed: ${failed.length} documents`);
        failed.forEach(f => {
            console.log(`      - ${f.slug} (${f.embeddingType}): ${f.error}`);
        });
    }
    if (skipped.length > 0) {
        console.log(`   ⊘ Skipped: ${skipped.length} documents`);
    }
    
    console.log('\n⏱️  Performance:');
    console.log(`   Total time: ${totalTime}s`);
    if (trained.length > 0) {
        const avgTime = trained.reduce((sum, t) => sum + parseFloat(t.duration), 0) / trained.length;
        console.log(`   Average per document: ${avgTime.toFixed(1)}s`);
    }
    
    console.log('\n📦 Build Script:');
    console.log(`   ✓ Updated: ${results.buildUpdates} PDFs added`);
    
    console.log('\n' + '='.repeat(70));
    
    if (failed.length === 0) {
        console.log('✅ All documents processed successfully!');
    } else {
        console.log('⚠️  Some documents failed to process. See details above.');
    }
    console.log('='.repeat(70) + '\n');
}

/**
 * Main execution
 */
async function main() {
    console.log('\n🚀 Batch Document Training Script');
    console.log('='.repeat(70) + '\n');
    
    // Parse arguments
    const args = process.argv.slice(2);
    const configArg = args.find(arg => arg.startsWith('--config='));
    const skipOpenai = args.includes('--skip-openai');
    const skipLocal = args.includes('--skip-local');
    const dryRun = args.includes('--dry-run');
    
    if (!configArg) {
        console.error('❌ Missing required argument: --config=<file.json>');
        console.log('\nUsage:');
        console.log('  node batch-train-documents.js --config=documents.json');
        console.log('  node batch-train-documents.js --config=documents.json --skip-openai');
        console.log('  node batch-train-documents.js --config=documents.json --skip-local');
        console.log('  node batch-train-documents.js --config=documents.json --dry-run');
        process.exit(1);
    }
    
    const configFile = configArg.split('=')[1];
    const configPath = path.join(process.cwd(), configFile);
    
    // Load configuration
    if (!fs.existsSync(configPath)) {
        console.error(`❌ Config file not found: ${configPath}`);
        process.exit(1);
    }
    
    console.log(`📄 Loading configuration from: ${configFile}`);
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    
    if (!config.documents || !Array.isArray(config.documents)) {
        console.error('❌ Invalid config: must have "documents" array');
        process.exit(1);
    }
    
    console.log(`✓ Found ${config.documents.length} documents to process\n`);
    
    if (dryRun) {
        console.log('🔍 DRY RUN MODE - No changes will be made\n');
    }
    
    // Validate all documents first
    console.log('🔍 Validating documents...');
    for (let i = 0; i < config.documents.length; i++) {
        try {
            validateDocumentConfig(config.documents[i], i);
            console.log(`  ✓ Document ${i + 1}: ${config.documents[i].slug}`);
        } catch (error) {
            console.error(`  ✗ ${error.message}`);
            process.exit(1);
        }
    }
    
    if (dryRun) {
        console.log('\n✓ Validation complete. Exiting (dry run mode).\n');
        process.exit(0);
    }
    
    const startTime = Date.now();
    const results = {
        registry: [],
        buildUpdates: 0,
        training: []
    };
    
    // Process each document
    for (let i = 0; i < config.documents.length; i++) {
        const doc = config.documents[i];
        console.log(`\n${'='.repeat(70)}`);
        console.log(`📄 Processing Document ${i + 1}/${config.documents.length}: ${doc.slug}`);
        console.log('='.repeat(70));
        
        // Step 1: Add to registry
        console.log('\n1️⃣  Adding to database registry...');
        const registryResults = await addDocumentToRegistry(doc);
        results.registry.push(...registryResults);
        
        // Step 2: Update build.js
        console.log('\n2️⃣  Updating build.js...');
        const buildUpdated = updateBuildScript(doc.pdfSubdirectory, doc.pdfFilename);
        if (buildUpdated) results.buildUpdates++;
        
        // Step 3: Train embeddings
        console.log('\n3️⃣  Training embeddings...');
        for (const result of registryResults) {
            if (result.status === 'added' || result.status === 'exists') {
                const trainingResult = trainDocument(
                    result.slug, 
                    result.embeddingType,
                    skipOpenai,
                    skipLocal
                );
                results.training.push(trainingResult);
            }
        }
    }
    
    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    generateSummary(results, totalTime);
}

// Run
if (require.main === module) {
    main().catch(error => {
        console.error('\n❌ Fatal error:', error);
        process.exit(1);
    });
}

module.exports = { validateDocumentConfig, addDocumentToRegistry, updateBuildScript };


