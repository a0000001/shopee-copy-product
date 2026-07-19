const fs = require('fs');
const current = JSON.parse(fs.readFileSync('E:\\proj\\shopee\\docs\\data\\product-catalog.json', 'utf8'));

// All translations: index -> { en, ms }
// I'll fill these in one batch
const translations = [];

// Read the current data and output a template for translation
current.forEach((item, i) => {
    console.log((i+1) + '|' + item.product_name['zh-TW'] + '|' + (item.product_name.en || '') + '|' + (item.product_name.ms || ''));
});
