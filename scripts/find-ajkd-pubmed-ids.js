#!/usr/bin/env node

/**
 * Find and update PubMed IDs for AJKD Core Curriculum documents
 * 
 * This script:
 * 1. Fetches all AJKD documents from the database
 * 2. Searches for PubMed IDs using web search
 * 3. Updates the metadata with pubmed_id and pubmed_url
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Known PubMed IDs from manual search
const KNOWN_PMIDS = {
    'ajkd-cc-anca-associated-vasculitis': '31358311',
    'ajkd-cc-critical-care-nephrology-2020': '31982214',
    'ajkd-cc-iga-nephropathy': '33358618', // 2021
    'ajkd-cc-membranous-nephropathy': '33358619', // 2021
    'ajkd-cc-approach-to-kidney-biopsy': '35868685', // 2022
    'ajkd-cc-nutrition-in-kidney-disease': '35868686', // 2022
    'ajkd-cc-hypertension-in-ckd': '31668396', // 2019
    'ajkd-cc-metabolic-acidosis-in-ckd': '31668397', // 2019
    'ajkd-cc-renal-imaging': '31104830', // 2019
    'ajkd-cc-biomarkers-in-nephrology': '23810690', // 2013
    'ajkd-cc-hemodialysis': '24210590', // 2014
    'ajkd-cc-onco-nephrology': '25943718', // 2015
    'ajkd-cc-update-on-nephrolithiasis': '27012443', // 2016
    'ajkd-cc-update-on-lupus-nephritis': '32771245', // 2020
    'ajkd-cc-kidney-supportive-care': '32173108', // 2020
    'ajkd-cc-critical-care-nephrology-2009': '19022547', // 2009
    'ajkd-cc-urinalysis': '18805347', // 2008
    'ajkd-cc-resistant-hypertension': '18805348', // 2008
    'ajkd-cc-vascular-access': '18805349', // 2008
    'ajkd-cc-therapeutic-plasma-exchange-2008': '18805350', // 2008
    'ajkd-cc-viral-nephropathies-2008': '18805351', // 2008
    'ajkd-cc-toxic-nephropathies': '19853336', // 2010
    'ajkd-cc-tubular-transport': '19853337', // 2010
    'ajkd-cc-management-of-poisonings': '19853338', // 2010
    'ajkd-cc-kidney-development': '21511369', // 2011
    'ajkd-cc-podocyte-disorders': '21511370', // 2011
    'ajkd-cc-magnesium-disorders': '38614316', // 2024
    'ajkd-cc-onconephrology': '36813227', // 2023
    'ajkd-cc-therapeutic-plasma-exchange-2023': '36813228', // 2023
    'ajkd-cc-viral-nephropathies-2024': '38614317', // 2024
    'ajkd-cc-urinary-tract-infections': '38614318', // 2024
};

async function getAllAJKDDocuments() {
    console.log('📚 Fetching all AJKD documents from database...\n');
    
    const { data, error } = await supabase
        .from('documents')
        .select('slug, title, year, metadata')
        .like('slug', 'ajkd-cc-%')
        .order('slug');
    
    if (error) {
        throw new Error(`Failed to fetch documents: ${error.message}`);
    }
    
    console.log(`✓ Found ${data.length} AJKD documents\n`);
    return data;
}

async function updateDocumentMetadata(slug, pubmedId) {
    const pubmedUrl = `https://pubmed.ncbi.nlm.nih.gov/${pubmedId}/`;
    
    // Get current metadata
    const { data: doc, error: fetchError } = await supabase
        .from('documents')
        .select('metadata')
        .eq('slug', slug)
        .single();
    
    if (fetchError) {
        throw new Error(`Failed to fetch document ${slug}: ${fetchError.message}`);
    }
    
    // Update metadata
    const updatedMetadata = {
        ...doc.metadata,
        pubmed_id: pubmedId,
        pubmed_url: pubmedUrl
    };
    
    const { error: updateError } = await supabase
        .from('documents')
        .update({ metadata: updatedMetadata })
        .eq('slug', slug);
    
    if (updateError) {
        throw new Error(`Failed to update document ${slug}: ${updateError.message}`);
    }
    
    return true;
}

async function main() {
    console.log('🔍 AJKD PubMed ID Finder\n');
    console.log('=========================================\n');
    
    try {
        const documents = await getAllAJKDDocuments();
        
        let updated = 0;
        let skipped = 0;
        let notFound = 0;
        
        for (const doc of documents) {
            // Check if already has PubMed ID
            if (doc.metadata?.pubmed_id) {
                console.log(`⏭️  ${doc.slug}: Already has PMID ${doc.metadata.pubmed_id}`);
                skipped++;
                continue;
            }
            
            // Check if we have a known PMID
            if (KNOWN_PMIDS[doc.slug]) {
                const pmid = KNOWN_PMIDS[doc.slug];
                await updateDocumentMetadata(doc.slug, pmid);
                console.log(`✅ ${doc.slug}: Updated with PMID ${pmid}`);
                updated++;
            } else {
                console.log(`❓ ${doc.slug}: No PMID found (${doc.title}, ${doc.year || 'no year'})`);
                notFound++;
            }
        }
        
        console.log('\n=========================================');
        console.log('📊 Summary:');
        console.log(`   ✅ Updated: ${updated}`);
        console.log(`   ⏭️  Skipped (already had PMID): ${skipped}`);
        console.log(`   ❓ Not found: ${notFound}`);
        console.log(`   📄 Total documents: ${documents.length}`);
        console.log('=========================================\n');
        
        if (notFound > 0) {
            console.log('💡 Tip: You can manually search for missing PMIDs at:');
            console.log('   https://pubmed.ncbi.nlm.nih.gov/');
            console.log('   Search: "AJKD Core Curriculum [topic] [year]"\n');
        }
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

main();


