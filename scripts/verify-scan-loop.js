const fs = require('fs');
const path = require('path');

const sellerListPath = path.join(__dirname, '../extension/lib/seller-list.js');
const batchUploadPath = path.join(__dirname, '../extension/batch-upload.js');

const sellerListContent = fs.readFileSync(sellerListPath, 'utf8');
const batchUploadContent = fs.readFileSync(batchUploadPath, 'utf8');

let errors = [];

if (!sellerListContent.includes('page_number') || !sellerListContent.includes('pageNum')) {
  errors.push('CRITICAL ERROR: seller-list.js is missing the page_number pagination loop!');
}

if (!batchUploadContent.includes('page_number') || !batchUploadContent.includes('pageNum')) {
  errors.push('CRITICAL ERROR: batch-upload.js is missing the page_number pagination loop in scanProducts fallback!');
}

if (errors.length > 0) {
  console.error('❌ Verification failed:');
  errors.forEach(e => console.error(e));
  process.exit(1);
} else {
  console.log('✅ Verification passed: seller-list.js and batch-upload.js both preserve page_number pagination loop cleanly!');
}
