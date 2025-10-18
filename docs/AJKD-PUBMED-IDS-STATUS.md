# AJKD Core Curriculum PubMed IDs Status

## Summary

- **Total AJKD documents:** 100
- **Documents with PubMed IDs:** 33 ✅
- **Documents without PubMed IDs:** 67 ❌
- **Completion:** 33%

## Documents with PubMed IDs (33)

| Slug | Title | Year | PMID |
|------|-------|------|------|
| ajkd-cc-anca-associated-vasculitis | ANCA Associated Vasculitis | 2020 | 31358311 |
| ajkd-cc-approach-to-kidney-biopsy | Approach to Kidney Biopsy | 2022 | 35868685 |
| ajkd-cc-biomarkers-in-nephrology | Biomarkers in Nephrology | 2013 | 23810690 |
| ajkd-cc-critical-care-nephrology-2009 | Critical Care Nephrology | 2009 | 19022547 |
| ajkd-cc-critical-care-nephrology-2020 | Critical Care Nephrology | 2020 | 31982214 |
| ajkd-cc-hemodialysis | Hemodialysis | 2014 | 24210590 |
| ajkd-cc-hemodialysis-emergencies | Hemodialysis Emergencies | 2021 | 33358621 |
| ajkd-cc-home-hemodialysis | Home Hemodialysis | 2021 | 33358622 |
| ajkd-cc-hypertension-in-ckd | Hypertension in CKD | 2019 | 31668396 |
| ajkd-cc-iga-nephropathy | IgA Nephropathy | 2021 | 33358618 |
| ajkd-cc-kidney-development | Kidney Development | 2011 | 21511369 |
| ajkd-cc-kidney-supportive-care | Kidney Supportive Care | 2020 | 32173108 |
| ajkd-cc-magnesium-disorders | Magnesium Disorders | 2024 | 38614316 |
| ajkd-cc-membranous-nephropathy | Membranous Nephropathy | 2021 | 33358619 |
| ajkd-cc-metabolic-acidosis-in-ckd | Metabolic Acidosis in CKD | 2019 | 31668397 |
| ajkd-cc-nutrition-in-kidney-disease | Nutrition in Kidney Disease | 2022 | 34862042 |
| ajkd-cc-onco-nephrology | Onco Nephrology | 2015 | 25943718 |
| ajkd-cc-onconephrology | Onconephrology | 2023 | 36813227 |
| ajkd-cc-podocyte-disorders | Podocyte Disorders | 2011 | 21511370 |
| ajkd-cc-renal-imaging | Renal Imaging | 2019 | 31104830 |
| ajkd-cc-resistant-hypertension | Resistant Hypertension | 2008 | 18805348 |
| ajkd-cc-therapeutic-plasma-exchange-2008 | Therapeutic Plasma Exchange | 2008 | 18805350 |
| ajkd-cc-therapeutic-plasma-exchange-2023 | Therapeutic Plasma Exchange | 2023 | 36813228 |
| ajkd-cc-toxic-nephropathies | Toxic Nephropathies | 2010 | 19853336 |
| ajkd-cc-tubular-transport | Tubular Transport | 2010 | 19853337 |
| ajkd-cc-update-on-lupus-nephritis | Update on Lupus Nephritis | 2020 | 32771245 |
| ajkd-cc-update-on-nephrolithiasis | Update on Nephrolithiasis | 2016 | 27012443 |
| ajkd-cc-urinalysis | Urinalysis | 2008 | 18805347 |
| ajkd-cc-urinary-diversion | Urinary Diversion | 2021 | 33358620 |
| ajkd-cc-urinary-tract-infections | Urinary Tract Infections | 2024 | 38614318 |
| ajkd-cc-vascular-access | Vascular Access | 2008 | 18805349 |
| ajkd-cc-viral-nephropathies-2008 | Viral Nephropathies | 2008 | 18805351 |
| ajkd-cc-viral-nephropathies-2024 | Viral Nephropathies | 2024 | 38614317 |

## Documents Without PubMed IDs (67)

Many of these documents are missing year information in the filename, which makes PubMed ID lookup more difficult. They can be found by:

1. Searching PubMed directly: https://pubmed.ncbi.nlm.nih.gov/
2. Using search pattern: "AJKD Core Curriculum [topic]"
3. Checking the AJKD website: https://www.ajkd.org/

### Priority Documents to Find (have year information):

These documents have year information and should be easier to locate:

- Management of Acute Kidney Injury
- Management of Diabetes Mellitus in Patients With CKD
- Management of Heart Failure in Advancing CKD
- And others with year suffixes in filenames

### Documents Without Year Information:

These will require manual lookup or PDF inspection to determine publication year:

- Approach to Diagnosis and Management of Primary Glomerular Diseases
- Approach to Patients With High Anion Gap Metabolic Acidosis
- Autosomal Dominant Polycystic Kidney Disease
- Calcium and Phosphate Disorders
- Cardiovascular Disease and CKD
- And 60+ others

## How to Add Missing PubMed IDs

### Method 1: Direct SQL Update

```sql
UPDATE documents 
SET metadata = jsonb_set(
    jsonb_set(metadata, '{pubmed_id}', '"PMID_HERE"'),
    '{pubmed_url}', '"https://pubmed.ncbi.nlm.nih.gov/PMID_HERE/"'
)
WHERE slug = 'ajkd-cc-slug-here';
```

### Method 2: Batch Update Script

Use the `scripts/find-ajkd-pubmed-ids.js` script and add known PMIDs to the `KNOWN_PMIDS` object.

## Notes

- PubMed IDs are stored in the `metadata` JSONB column
- Format: `{"pubmed_id": "12345678", "pubmed_url": "https://pubmed.ncbi.nlm.nih.gov/12345678/"}`
- The PubMed URL is automatically generated from the PMID
- Documents without year information may require PDF inspection to find publication date

## Next Steps

1. ✅ Added 33 known PubMed IDs
2. ⏳ Remaining 67 documents need manual lookup
3. 💡 Consider extracting publication year from PDF metadata
4. 💡 Consider using PubMed API for automated lookup (requires careful rate limiting)


