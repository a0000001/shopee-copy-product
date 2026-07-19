const fs = require('fs');
const current = JSON.parse(fs.readFileSync('E:\\proj\\shopee\\docs\\data\\product-catalog.json', 'utf8'));
const tr1 = require('./tr1.js');
const tr2 = require('./tr2.js');
const tr3 = require('./tr3.js');
const tr4 = require('./tr4.js');
const all = [...tr1, ...tr2, ...tr3, ...tr4];

console.log('Translations:', all.length);
console.log('Products:', current.length);

if (all.length !== current.length) {
    console.error('MISMATCH!', all.length, 'vs', current.length);
    process.exit(1);
}

// Apply translations to current[].product_name.en and .ms
for (let i = 0; i < current.length; i++) {
    const [en, ms] = all[i].split(' ||| ');
    // For zh-TW, keep the original Chinese name with emoji stripped
    const zh_tw = current[i].product_name['zh-TW'] || current[i].product_name;
    current[i].product_name = { "zh-TW": zh_tw, en, ms };
}

fs.writeFileSync('E:\\proj\\shopee\\docs\\data\\product-catalog.json', JSON.stringify(current, null, 4), 'utf8');
console.log('Written. Sample:');
console.log(JSON.stringify(current.slice(0, 2), null, 2));
