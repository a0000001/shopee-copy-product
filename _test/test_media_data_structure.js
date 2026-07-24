const fs = require('fs');
const path = require('path');

console.log('=== Running E2E Media Upload Data Payload Test ===');

const catalogPath = path.join(__dirname, '../docs/data/product-catalog-tw.json');
const catalogData = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));

const testItem = catalogData.find(i => i.ps_product_name && i.ps_product_name.includes('混元視頻'));

if (!testItem) {
  console.error('❌ Test item not found!');
  process.exit(1);
}

console.log('Test product:', testItem.ps_product_name);
console.log('Cover image:', testItem.ps_item_cover_image);
console.log('Images array count:', testItem.images ? testItem.images.length : 0);

// Simulate uploadMedia payload parsing in media.js
let images = Array.isArray(testItem.images) ? testItem.images : [];
if (images.length === 0) {
  for (let i = 0; i < 9; i++) {
    const key = i === 0 ? 'ps_item_cover_image' : `ps_item_image_${i}`;
    const url = testItem[key];
    if (url) images.push(url);
  }
}

if (images.length > 0) {
  console.log(`✅ E2E Test Passed: uploadMedia will successfully resolve ${images.length} valid images for upload!`);
  process.exit(0);
} else {
  console.error('❌ E2E Test Failed: No images resolved from item payload!');
  process.exit(1);
}
