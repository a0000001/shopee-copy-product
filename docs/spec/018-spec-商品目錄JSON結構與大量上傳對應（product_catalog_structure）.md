---
type: spec
status: implemented
updated: 2026-07-20
domain: shopee
tags: [product-catalog, json, excel, mass-upload, multi-store]
---

# 商品目錄 JSON 結構與 Shopee 大量上傳對應

> 定義 product-catalog-{lang}.json 的欄位規範，確保 JSON 可一鍵轉換為 Shopee 官方大量上傳 Excel 格式，實現「一次維護、多店通用」。

---

## 背景 / 為什麼需要這份文件

目前在新建**台南店**。若每次開店都手動搬商品，效率低落且易出錯。

### #workflow-overview
完整流程

```
手動上架階段（台南店）
  使用者開啟 seller.shopee.tw 商品頁
        │
        ▼
  extension 蒐集商品資料 → 彈出 UI 讓使用者確認 / 編輯
  （stock 預設 999 可改、category 可選、dimension 固定 10x10x4）
        │
        ▼
  使用者按「複製 JSON」→ 貼入 product-catalog-tw.json
        │
        ▼
  重複 N 次 → JSON 目錄累積完成 ✅

自動上傳階段（高雄店）
  product-catalog-tw.json
        │
        ▼
  json-to-shopee-excel.py（尚不存在）
  套用欄位對應規則 → 補預設值
        │
        ▼
  shopee-mass-upload-kaohsiung.xlsx
        │
        ▼
  Shopee 賣家後台 → 大量上傳 → 高雄店上架完成 ✅
```

JSON 目錄的優勢：
- **一鍵開店**：JSON → Excel → 大量上傳，不需逐個手動建立
- **多語言**：同一份資料結構可輸出 TW / EN / MS 等不同語言版本
- **跨店鋪複用**：台南店做完，高雄店可一鍵開店

### #shopee-mass-upload-columns
官方 Excel 欄位（取自 `Shopee_mass_upload_2026-07-18_basic_template.xlsx`）

**Sheet：上傳模式（37 欄）**

> JSON 欄位名 = Excel 欄位名，同名直接填入。以下僅標註 JSON 與 Excel 行為不一致的欄位。

| 欄位名稱 | 必填 | 說明 | 備註 |
|---------|------|------|------|
| `ps_category` | ✅ | 商品類別 | UI 下拉選單，選後填入 ID |
| `ps_product_name` | ✅ | 商品名稱 | |
| `ps_product_description` | | 商品描述 | |
| `ps_minimum_purchase_quantity` | | 最低購買數量 | |
| `ps_sku_parent_short` | | 父 SKU | |
| `ps_dangerous_goods` | | 危險品標示 | |
| `et_title_variation_integration_no` | | 規格整合編號 | |
| `et_title_variation_1` | | 規格一 | |
| `et_title_option_for_variation_1` | | 規格一選項 | |
| `et_title_image_per_variation` | | 規格圖片 | |
| `et_title_variation_2` | | 規格二 | |
| `et_title_option_for_variation_2` | | 規格二選項 | |
| `ps_price` | ✅ | 價格 | |
| `ps_stock` | ✅ | 庫存 | UI 預設 `999`，可編輯 |
| `ps_sku_short` | | SKU 編號 | |
| `ps_new_size_chart` | | 尺寸表 | |
| `et_title_size_chart` | | 尺寸表圖片 | |
| `ps_gtin_code` | | GTIN 條碼 | |
| `ps_item_cover_image` | | 商品封面圖 | |
| `ps_item_image_1` ~ `ps_item_image_8` | | 商品圖片 1-8 | |
| `ps_weight` | | 重量（kg） | |
| `ps_length` | | 長度（cm） | |
| `ps_width` | | 寬度（cm） | |
| `ps_height` | | 高度（cm） | |
| `channel_id.30005` | | 銷售通路 | |
| `channel_id.30015` | | 銷售通路 | |
| `channel_id.30017` | | 銷售通路 | |
| `channel_id.30019` | | 銷售通路 | |
| `ps_product_pre_order_dts` | | 預購天數 | |
| `et_title_reason` | | 備註原因 | |

**Sheet：參考欄位（追加）**

| 欄位名稱 | 說明 | 備註 |
|---------|------|------|
| `ps_hs_code` | HS 稅則編碼 | |
| `ps_tax_code` | 稅務代碼 | |
| `ps_brand` | 品牌 | |
| `ps_product_pre_order_dts_range` | 預購天數範圍 | |
| `ps_tool_mass_upload_sample_attr_country_origin` | 原產國 | |
| `ps_tool_mass_upload_sample_attr_manufacturer_details` | 製造商資訊 | |
| `ps_tool_mass_upload_sample_attr_packer_details` | 包裝者資訊 | |
| `ps_tool_mass_upload_sample_attr_importer_details` | 進口商資訊 | |

---

## 核心內容

### #current-json-structure
現有 `product-catalog-tw.json`

```json
{
  "product_name": "商品名稱",
  "price_twd": 999,
  "nsfw": true,
  "tag": ["AI", "NSFW"],
  "category": "圖片生成/編輯",
  "product_description": "",
  "ProductId": "PROD-ID-000001",
  "computer_specs": {
    "vram_min": 0,
    "vram_rec": 0,
    "ram_min": 0,
    "ram_rec": 0,
    "disk": 0,
    "cpu": "",
    "power": ""
  }
}
```

### #current-extension-clipboard
目前 extension `toJsonClipboard()` 輸出（舊版格式，待更新）

```json
{
  "title": "商品名稱",
  "price": "999",
  "description": "商品描述",
  "url": "https://shopee.tw/...",
  "images": ["https://..."],
  "videos": [],
  "dimension": "10x10x4",
  "installment": 24
}
```

新版將改為與 Excel 欄位名一致（見 #recommended-json-schema）。

### #recommended-json-schema
JSON 欄位名 = Excel 欄位名，一一對應。最外層為陣列，每筆商品一個物件。

```json
[
  {
    "ps_product_name": "AI 繪圖軟體",
    "ps_product_description": "商品描述內容",
    "ps_price": 999,
    "ps_stock": 999,
    "ps_category": "100644,101937",
    "ps_sku_short": "PROD-ID-000001",
    "ps_item_cover_image": "https://cf.shopee.tw/file/abc.jpg",
    "ps_item_image_1": "https://cf.shopee.tw/file/def.jpg",
    "ps_item_image_2": "https://cf.shopee.tw/file/ghi.jpg",
    "ps_length": 10,
    "ps_width": 10,
    "ps_height": 4,
    "ps_brand": "NoBrand",
    "installment": 24,
    "computer_specs": {
      "vram_min": 0, "vram_rec": 0,
      "ram_min": 0, "ram_rec": 0,
      "disk": 0, "cpu": "", "power": ""
    },
    "tag": ["AI", "NSFW"],
    "url": "https://shopee.tw/...",
    "videos": [],
    "nsfw": true,
    "category": "圖片生成/編輯"
  }
]
```

規則：
- 所有 `ps_` 開頭的欄位名 = 直接對應 Excel 欄位，同名填入
- `et_title_*`、`channel_id.*` 等也非常用欄位比照辦理，JSON 中有但可省略（有填就填，沒填為空）
- 非 `ps_` 開頭的欄位（`installment`、`computer_specs`、`tag`、`url`、`videos`、`nsfw`、`category`）為 extension 內部資料，轉換腳本 skip，不輸出到 Excel

### #json-to-excel-mapping
#### 原則：同名直接填入

轉換腳本的行為規則：

1. **JSON → Excel 同名填寫**：JSON 中的 `ps_*` 欄位，若 Excel 有同名欄位，直接填入該格
2. **無對應則留空**：Excel 欄位在 JSON 中找不到同名的 `ps_*` 欄位時，該格留空
3. **跳過內部欄位**：JSON 中非 `ps_` 前綴的欄位（`installment`、`computer_specs`、`tag`、`url`、`videos`、`nsfw`、`category`），不輸出到 Excel

#### 實際範例

若 JSON 只有以下欄位（有資料的才列）：

```json
{
  "ps_product_name": "AI 繪圖軟體",
  "ps_product_description": "AI 繪圖工具",
  "ps_price": 999,
  "ps_stock": 999,
  "ps_category": "100644,101937",
  "ps_sku_short": "PROD-ID-000001",
  "ps_item_cover_image": "https://cf.shopee.tw/file/abc.jpg",
  "ps_length": 10,
  "ps_width": 10,
  "ps_height": 4,
  "ps_brand": "NoBrand",
  "installment": 24,
  "computer_specs": { "vram_min": 4 }
}
```

則轉換腳本：
- `ps_*` 欄位 → 同名填入 Excel
- 其餘 27+ 個 Excel 欄位（`ps_weight`、`ps_dangerous_goods`、`ps_hs_code`、`channel_id.*` 等）→ 全部留空
- `installment`、`computer_specs`、`nsfw`、`category` → 跳過不輸出

### #category-id-strategy
Shopee 類別 ID 處理策略

1. Shopee Open Platform 有 `v2.product.get_category` API 可回傳完整類別樹，但**需要 Partner ID + API Key**（開發者帳號），我們沒有
2. seller.shopee.tw 內部也有 API，但無法登入（帳號驗證問題）→ 無法抓取
3. **結論**：無法一次取得所有類別 ID，只能逐筆記錄

### #category-mapping
類別中文名 → Shopee 類別 ID 對照

| 中文類別路徑 | Shopee 類別 ID | 來源 |
|-------------|---------------|------|
| 電腦與周邊配件 > 軟體 | `100644,101937` | 取自 seller 頁面「品牌+屬性」區塊 DOM element 的 `category-ids` 屬性 |
| （待補） | | 每次開新類別時手動記錄 |

> 類別 ID 採「扁平雙層 ID」格式（`父category_id,子category_id`），對應 Excel `ps_category` 欄位。
>
> **補充方式**：在 seller.shopee.tw 新增商品 → 選類別 → 檢視頁面 element → 在 `brandAndAttributes` 區塊找 `category-ids` 屬性

### #category-id-in-ui
UI 設計：popup 新增類別選取器

```
┌─────────────────────────────┐
│ 庫存： [999        ] 個     │
│ 類別： [電腦>軟體    ▾]     │
│ 尺寸： 10x10x4（固定）      │
│ 圖片： 5 張                 │
│                              │
│  [複製 JSON]  [下載檔案]    │
└─────────────────────────────┘
```

- 類別選單：對照 #category-mapping 表的下拉清單
- 目前僅「電腦>軟體」一項，日後新增類別時加為選項
- **優先順序**：自動從 DOM 抓到的 `category-ids` 優先，手動下拉可覆寫（未自動抓到時才需手動選）

### #shared-fields-across-stores
跨店共用 vs 分店差異欄位

| 欄位 | 跨店共用 | 分店自訂 |
|------|---------|---------|
| `ps_product_name` | ✅ | |
| `ps_price` | ✅ | |
| `ps_category` | ✅ | |
| `ps_product_description` | ✅ | |
| `ps_sku_short` | ✅ | |
| `ps_length` / `ps_width` / `ps_height` | ✅ | |
| `ps_brand` | ✅ | |
| `ps_stock` | | ✅ 每店庫存不同 |
| `ps_item_cover_image` / `ps_item_image_1..8` | ✅ 圖片 URL 跨店共用 | |

### #cross-store-override
跨店轉換時，部分欄位可能需要覆寫。圖片 URL 直接照抄即可，無須替換。

| 欄位 | 覆寫方式 |
|------|---------|
| `ps_stock` | 命令列參數 `--stock 50`（可選，有下才蓋、沒下沿用；須用 `is not None` 判斷，避免 `--stock 0` 被誤判為未給） |

**使用範例（高雄店）：**
```
python json-to-shopee-excel.py product-catalog-tw.json --stock 50 -o shopee-mass-upload-kaohsiung.xlsx
```

若省略 `--stock`，則完全沿用 JSON 原始值。

### #conversion-script
JSON → Excel 轉換腳本（未來實作）

```
scripts/json-to-shopee-excel.py
```

功能：
1. 讀取 `product-catalog-tw.json`
2. 同名欄位直接填入 Excel
3. 依 `--stock` 參數選擇性覆寫庫存（有下才蓋、沒下沿用）
4. 跳過 `installment`、`computer_specs`、`tag`、`url`、`videos`、`nsfw`、`category`（extension 內部用）
5. 輸出完整 37 欄「上傳模式」sheet + 追加欄位「參考欄位」sheet，缺欄位留空

輸入範例（product-catalog-tw.json）：
```json
[
  {
    "ps_product_name": "AI 繪圖軟體",
    "ps_product_description": "AI 繪圖工具，支援多種模型",
    "ps_price": 999,
    "ps_stock": 999,
    "ps_category": "100644,101937",
    "ps_sku_short": "PROD-ID-000001",
    "ps_item_cover_image": "https://cf.shopee.tw/file/abc.jpg",
    "ps_item_image_1": "https://cf.shopee.tw/file/def.jpg",
    "ps_length": 10,
    "ps_width": 10,
    "ps_height": 4,
    "ps_brand": "NoBrand",
    "installment": 24,
    "computer_specs": { "vram_min": 4 }
  }
]
```

腳本將上述 JSON 的 `ps_*` 欄位同名填入 Excel，其餘 25+ 欄留空，`installment` / `computer_specs` 不輸出。

---

## Extension 修改計畫（Phase 2 — 待實作）

### popup.js — `toJsonClipboard()` 改為新欄位名

輸出欄位從舊名改為 `ps_*` 名：

| 舊欄位 | 新欄位 |
|--------|--------|
| `title` | `ps_product_name` |
| `price` | `ps_price` |
| `description` | `ps_product_description` |
| `images[]` | `ps_item_cover_image` + `ps_item_image_1..N` |
| `dimension`（字串） | `ps_length` + `ps_width` + `ps_height` |
| `stock`（新增） | `ps_stock`，預設 999 |
| `url` | 保留（不輸出 Excel） |
| `videos` | 保留（不輸出 Excel） |
| `installment` | 保留（不輸出 Excel） |

### popup.js — UI 新增 controls

- `ps_stock` input：數字欄位，預設 999，可編輯
- `ps_category` select：下拉選單，對照 #category-mapping 表
- 顯示圖片張數

### content.js（無需修改）

已有邏輯不受影響：`stock=999`（line 1106）、dimension 從 `data.dimension` 讀入（line 1126-1143）、`brand=NoBrand`（line 1119）、`category-ids` 由頁面自帶。

---

## 實際應用 / 範例

### 開店流程
```
手動上架台南店（逐筆）
  開啟 seller.shopee.tw 商品頁
        │
        ▼
  extension popup → 確認資料
  （編輯 stock、選 category）
        │
        ▼
  按「複製 JSON」→ 貼入 product-catalog-tw.json
        │
  重複 N 次，累積目錄
        │
        ▼

自動上架高雄店（大量）
  product-catalog-tw.json
        │（json-to-shopee-excel.py）
  shopee-mass-upload-kaohsiung.xlsx
        │（Shopee 大量上傳）
  高雄店上架完成 ✅
```

### 多語言支援
```
product-catalog-en.json → shopee-mass-upload-en.xlsx（英文站）
product-catalog-ms.json → shopee-mass-upload-ms.xlsx（馬來站）
product-catalog-tw.json → shopee-mass-upload-tw.xlsx（台灣站）
```

---

## 相關文件

- 官方大量上傳範本：`docs/shopee-official-tool/Shopee_mass_upload_2026-07-18_basic_template.xlsx`
- 台灣商品目錄：`docs/data/product-catalog-tw.json`
- DOM 分析：`docs/analysis/14-seller-new-product-dom-analysis.md`
- 舊版命名規則：`docs/spec/001-rule-SSOT-文件命名與撰寫規範.md`
- 類別 ID：目前僅知 `電腦與周邊配件 > 軟體 = 100644,101937`，其餘隨使用補上
