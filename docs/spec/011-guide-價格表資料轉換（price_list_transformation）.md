---
type: guide
status: draft
updated: 2026-07-17
domain: shopee
tags: [price-list, json, multilingual, data-transformation, translation, nsfw]
---

# 價格表資料轉換與多語系處理經驗

> 記錄從 Shopee 賣場價格一覽表（Markdown）解析為結構化 JSON，並完成 3 語系（zh-TW / en / ms）轉換的完整流程與教訓。

---

## 背景

原始資料為 Shopee 賣場價格一覽表（`總店（mazz68）價格一覽表.md`），為 Markdown 格式但非標準表格，包含商品名稱、價格、以及非商品條目（隔日到貨、新上架等賣場資訊）。

目標：產出 `product-catalog.json`，供後續商品上架流程使用。

---

## 資料管線（Pipeline）

### #pipeline-overview

```text
Markdown 原始檔
    ↓ Node.js 解析（transform_prices.js）
去除非商品條目、去重、去 emoji
    ↓
179 筆唯一商品（name + price_twd）
    ↓ 自動標籤（guessTags）
每商品產生 zh-TW tag 陣列（關鍵字比對）
    ↓ 標籤翻譯（tagMap）
en / ms 雙語標籤
    ↓ 品名翻譯
product_name 三語系物件
    ↓ 手動修正批次檔
JSON 最終版
```

### #parsing-markdown

檔案非標準 Markdown 表格，而是「名稱行 → 金額符號 `$` → 數字行」的三行結構。使用 `transform_prices.js` 逐行掃描：

- 遇到 `$` 行則上一行為名稱、下一行為價格
- 過濾非商品條目（隔日到貨、新上架、rating-star 等）
- 名稱去重（179 筆唯一商品）

### #emoji-stripping

使用 Unicode Extended Pictographic 正則：
```js
s.replace(/\p{Extended_Pictographic}/gu, '').replace(/\uFE0F/g, '').trim()
```

安全、無損。

---

## JSON Schema 演變

### #schema-evolution

| 版本 | 欄位 | 說明 |
|------|------|------|
| v1 | `name`, `price_twd`, `price_myr` | 最初版，單一語系 |
| v2 | 移除 `price_myr` | MYR 匯率轉換延後由外部程式處理 |
| v3 | 移除 `product_id`, `folder_name` | `folder_name` 等於 `product_name`；無穩定英文 key |
| v4 | `product_name` → 3 語系物件 | `{ "zh-TW": "...", "en": "...", "ms": "..." }` |
| v4 | `tag` → 3 語系物件 | 同上，每個語系為字串陣列 |
| v4 | 新增 `nsfw` | boolean，由名稱文字不區分大小寫比對 |

### #field-removal-decisions

- **`price_myr`**：匯率浮動，由外部程式即時換算而非寫死
- **`currency_info`** / **`exchange_rate_date`**：同上
- **`product_id`**：英文名稱不一致，無穩定 ID
- **`folder_name`**：語意上等於 `product_name`

---

## 多語系翻譯

### #translation-approach

| 嘗試 | 方法 | 結果 |
|------|------|------|
| ❌ 片語取代 | `translateName()` 內建中→英/馬片語表 | 殘留中文字，品質差 |
| ✅ LLM 手動翻譯 | 由 LLM 逐項產出 en/ms | 品質佳，但批次檔索引需正確對應 |

### #index-mismatch-lesson

**關鍵教訓**：以索引（index）為基礎的批次翻譯容易出錯。

原始 `transform_prices.js` 的產出順序與手動撰寫翻譯批次檔時認知的順序不一致（過濾規則差異、檔案編碼問題），導致 patch1.js—patch4.js 自 index 148 起全部錯位。

**正確做法**：以 `product_name['zh-TW']` 為 key 進行比對 patch，而非索引。

```js
// ❌ 錯：依賴索引
patches[148] = ['AI Automatic Paper Reading Tool', ...];

// ✅ 對：以 zh-TW 名稱為 key 比對
if (item.product_name['zh-TW'] === '文字轉語音軟體VPot(免費下載)') {
    item.product_name.en = 'Text-to-Speech Software VPot (Free Download)';
}
```

後續使用 apply_batch1.js—apply_batch4.js 修正，採 `index + offset` 但**逐一確認 zh-TW 名稱順序後才寫入**。

### #tag-translation

標籤使用查詢表（tagMap）雙向翻譯，涵蓋約 50 組詞彙（如 `換臉 → FaceSwap → Tukar Wajah`）。所有 179 筆商品均有至少一組標籤，無空標籤。

---

## NSFW 標記

### #nsfw-detection

名稱不區分大小寫比對 `/nsfw/i`。若有則 `nsfw: true`，Shopee 上架時須啟用 NSFW 分類。

---

## 檔案結構

```text
docs/
├── data/
│   └── product-catalog.json         # 最終產出（179 筆，3 語系）
├── 總店（mazz68）價格一覽表.md      # 原始資料
├── scripts/
│   ├── transform_prices.js          # 主解析腳本（markdown → JSON）
│   ├── merge_tr.js                  # 合併翻譯批次檔
│   └── tr1.js—tr4.js               # 翻譯檔案（已淘汰）
├── spec/
│   ├── 001-plan-商品上架流程（shopee_listing_pipeline）.md
│   └── 011-guide-價格表資料轉換（price_list_transformation）.md   # 本文件
```

---

## 相關文件

- `docs/spec/001-plan-商品上架流程（shopee_listing_pipeline）.md` — 三階段上架計畫
- `docs/scripts/transform_prices.js` — 解析腳本
- `docs/data/product-catalog.json` — 最終產出
