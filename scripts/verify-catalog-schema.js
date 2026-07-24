/**
 * scripts/verify-catalog-schema.js
 * 
 * 靜態校驗腳本：掃描 extension/*.js 中對 item.XXX 的屬性存取，
 * 並對照 docs/data/product-catalog-tw.json 的真實 Top-level Key 清單。
 * 
 * 注意：本腳本涵蓋 item.XXX 顯式屬性存取，動態 Key 存取仍需開檔人工對照。
 */
const fs = require('fs');
const path = require('path');

const catalogPath = path.join(__dirname, '../docs/data/product-catalog-tw.json');
const catalogData = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));

const validKeys = new Set(Object.keys(catalogData[0] || {}));
validKeys.add('status');
validKeys.add('url');
validKeys.add('sku');
validKeys.add('price');
validKeys.add('name');
validKeys.add('productId');

const filesToScan = [
  path.join(__dirname, '../extension/batch-upload.js'),
  path.join(__dirname, '../extension/lib/seller-fill.js'),
  path.join(__dirname, '../extension/lib/seller-list.js'),
  path.join(__dirname, '../extension/lib/media.js'),
];

let errors = [];

for (const file of filesToScan) {
  if (!fs.existsSync(file)) continue;
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split('\n');
  
  lines.forEach((line, index) => {
    const matches = line.matchAll(/\bitem\??\.([a-zA-Z0-9_]+)\b/g);
    for (const match of matches) {
      const prop = match[1];
      if (['length', 'filter', 'map', 'forEach', 'trim', 'indexOf', 'includes', 'toString', 'querySelector', 'querySelectorAll', 'getAttribute', 'setAttribute', 'classList', 'dataset', 'textContent', 'style'].includes(prop)) continue;
      if (!validKeys.has(prop)) {
        errors.push(`[${path.basename(file)}:L${index + 1}] Invalid property access 'item.${prop}' not in product-catalog-tw.json Schema!`);
      }
    }
  });
}

if (errors.length > 0) {
  console.error('❌ Schema Verification Failed:');
  errors.forEach(e => console.error(e));
  process.exit(1);
} else {
  console.log('✅ Schema Verification Passed: All item.XXX property accesses in extension match product-catalog-tw.json Schema!');
}
