const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const sellerListPath = path.join(__dirname, '../extension/lib/seller-list.js');
const batchUploadPath = path.join(__dirname, '../extension/batch-upload.js');

const sellerListContent = fs.readFileSync(sellerListPath, 'utf8');
const batchUploadContent = fs.readFileSync(batchUploadPath, 'utf8');

let errors = [];

if (!sellerListContent.includes('page_number') || !sellerListContent.includes('pageNum')) {
  errors.push('CRITICAL ERROR: seller-list.js is missing the page_number pagination loop!');
}

if (!batchUploadContent.includes('executeScript') || !batchUploadContent.includes('page_number') || !batchUploadContent.includes('pageNum') || !batchUploadContent.includes('live_all')) {
  errors.push('CRITICAL ERROR: batch-upload.js is missing the executeScript Main World page_number pagination loop!');
}

if (errors.length > 0) {
  console.error('❌ Scan Loop Verification failed:');
  errors.forEach(e => console.error(e));
  process.exit(1);
} else {
  console.log('✅ Scan Loop Verification passed!');
}

// Run schema verifier
try {
  execSync('node scripts/verify-catalog-schema.js', { stdio: 'inherit', cwd: path.join(__dirname, '..') });
} catch (e) {
  process.exit(1);
}
