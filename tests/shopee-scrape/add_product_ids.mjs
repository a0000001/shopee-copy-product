import { readFileSync, writeFileSync } from 'fs'

const files = [
  'docs/data/product-catalog-tw.json',
  'docs/data/product-catalog-en.json',
  'docs/data/product-catalog-ms.json',
]

for (const f of files) {
  let raw = readFileSync(f, 'utf-8')
  if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1)
  const data = JSON.parse(raw)
  for (let i = 0; i < data.length; i++) {
    data[i].ProductId = `PROD-ID-${String(i + 1).padStart(6, '0')}`
  }
  writeFileSync(f, JSON.stringify(data, null, 4) + '\n', 'utf-8')
}

console.log(`Done — added ProductId to ${files.length} files`)
