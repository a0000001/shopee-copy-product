---
type: plan
status: draft
updated: 2026-07-21
domain: listing
tags: [shopee, mass-upload, excel, xlsx, product-catalog, dedup]
---

# 大量上傳 Excel 轉換

> 將本地目錄 `product-catalog-tw.json` 轉換為蝦皮官方大量上傳 Excel（xlsx），一鍵上架所有商品，並解決商品重複問題。

---

## 背景

目前已收集約 181 筆商品資料於 `docs/data/product-catalog-tw.json`，欄位格式為 `ps_*` 前綴的自訂 JSON 結構。蝦皮官方提供「大量上傳商品」功能，使用指定 xlsx 模板，可批次新增/更新商品。

目標：寫一個 Python 轉換腳本，從 JSON 讀取商品、對應到蝦皮模板欄位、輸出可直接上傳的 xlsx 檔案。

---

## 核心問題與解答

### Q1: 蝦皮官方上傳會自動排除重複商品嗎？

**不會。** 蝦皮大量上傳是「新增」操作，若同一主商品貨號（`ps_sku_parent_short`）已經存在於賣場，上傳後會形成**重複商品**，蝦皮不會自動比對或跳過。

### Q2: 解決重複的最佳方案是什麼？

**上傳前先拉取已上架商品列表，排除已存在的商品，再寫入 Excel。**

分析三種方案：

| 方案 | 作法 | 優點 | 缺點 |
|------|------|------|------|
| **A: 上傳前拉取+排除（推薦）** | 從 `seller.shopee.tw/portal/product` 的 DOM 抓取已上架商品 SKU 列表，比對 `ps_sku_short`，排除已存在的商品後再產出 Excel | 精準避免重複；不需 API 權限；extension 已有 seller.shopee.tw 權限 | 需實作 content script 爬取「我的商品」頁面 |
| B: 上傳後蝦皮自動去重 | 依賴蝦皮平台行為 | 不用開發 | 蝦皮不做去重，會產生重複商品 |
| C: 本地目錄標記已上傳 | 在 JSON 中加 `uploaded: true` 欄位，只輸出未上傳的 | 簡單獨立 | 手動維護；若在蝦皮後台刪除/修改商品，本地狀態會不同步 |

**結論：方案 A 是最優解**，且**不需要蝦皮 API**。我們已有 `seller.shopee.tw` 的 content script 權限，可從「我的商品」列表頁 DOM 直接抓取已上架商品的主商品貨號（`ps_sku_parent_short`）。

### Q3: 轉換腳本能做到什麼程度？

JSON 的 `ps_*` 欄位與蝦皮模板欄位對應關係：

| JSON 欄位 | 蝦皮模板欄位 | 備註 |
|-----------|-------------|------|
| `ps_category` | `ps_category`（分類 ID） | 需從蝦皮分類表查找對應 ID |
| `ps_product_name` | `ps_product_name`（商品名稱） | 直接對應 |
| `ps_product_description` | `ps_product_description`（商品描述） | 直接對應 |
| `ps_sku_short` | `ps_sku_parent_short`（主商品貨號） | 自動產生 PROD-ID-NNNNNN |
| `ps_price` | `ps_price`（價格） | 直接對應 |
| `ps_stock` | `ps_stock`（庫存） | 直接對應 |
| `ps_length` / `ps_width` / `ps_height` | `ps_length` / `ps_width` / `ps_height` | 直接對應 |
| `ps_item_cover_image` + `ps_item_image_1..8` | `ps_item_cover_image` + `ps_item_image_1..8` | 圖片 URL |
| `ps_brand` | `ps_brand`（品牌） | 直接對應 |
| `ps_weight` | `ps_weight`（重量） | 預設 0.5 kg |
| `videos` | 無對應欄位 | 蝦皮大量上傳不支援影片 |
| `tag` / `nsfw` / `category` | 無對應欄位 | 僅供參考 |

**限制**：
- 每件商品視為「無規格」商品（每筆一列）
- 圖片 URL 需為公開可存取的網址（目前 JSON 中圖片為空字串，需先上傳圖片取得 URL）
- 蝦皮模板的部分欄位（配送方式、較長備貨天數、規格等）使用預設值

---

## 實作計畫

### Phase 1: 轉換腳本（測試通過）

檔案：`scripts/test-convert-catalog-to-xlsx.py`

功能：
1. 讀取 `product-catalog-tw.json`
2. 讀取 `sample-existing-products.json`（模擬從 seller.shopee.tw 抓取的已上架 SKU）
3. 比對 `ps_sku_short` 排除已上架商品
4. 複製蝦皮模板，填入對應欄位
5. 輸出 `product-catalog-upload_{YYYY-MM-DD}.xlsx`

**測試結果**：196 筆商品，0.16 MB，全部 PASS。

**注意**：蝦皮模板的 `bottom_left` 屬性值不符合 openpyxl 規範，需先修正為 `bottomLeft` 才能用 openpyxl 載入。已產生 `_fixed.xlsx` 版本。

### Phase 2: 去重（爬取已上架商品列表）

從 `seller.shopee.tw/portal/product/list/live/all`（「我的商品」頁面）DOM 抓取已上架 SKU：

1. 在 `content.js` 新增 `extractSellerProductList()`，爬取商品表格中的主商品貨號
2. 透過 `chrome.runtime.sendMessage` 回傳給 popup
3. 比對 `ps_sku_short`，濾除已存在的商品
4. 剩餘商品寫入 Excel

**實測發現**：目前該賣場 98 件商品中，僅 1 件有設定主商品貨號（`MPY-7501-AFAAG`），其餘皆為 `-`。因此去重以 `ps_sku_short` 比對為主，輔以商品名稱比對。

### Phase 3: 過渡方案（無需爬取時的本地去重）

在 JSON 中維護 `uploaded` 狀態：
- 每次產出 Excel 時，只輸出 `uploaded !== true` 的商品
- 使用者手動將 `uploaded` 設為 `true`（或寫入 Excel 後自動標記）

---

## 實作細節

### 開發指引

```python
# 建議依賴：openpyxl（僅此一個第三方套件）
# 安裝：pip install openpyxl
```

### 模板結構

蝦皮模板有 7 個工作表：

| 工作表名稱 | 用途 | 說明 |
|-----------|------|------|
| `功能概述` | 說明 | 操作說明、注意事項、定義（32 行） |
| `上傳模板` | **資料填寫** | 資料欄位入口，Row 1 為 API 欄位名（`ps_category|0|0` 格式），Row 3 為中文欄位名，**Row 7+ 為資料列** |
| `參考範例` | 範例 | 含範例資料（12 行，6 筆範例），47 欄 |
| `備貨天數範圍` | 分類對照 | 分類 ID 與備貨天數範圍（2094 行） |
| `尺寸表模板清單` | 尺寸表 | 尺寸表模板 ID 清單 |
| `HiddenShopBrand` | 品牌資料 | 隱藏工作表 |
| `HiddenTax` | 稅務資料 | 隱藏工作表 |

**資料要寫入 `上傳模板` 工作表**，Row 7 開始（Row 1-6 為標題/說明/格式）。

### 模板相容性

蝦皮提供的模板中，部分工作表的 `activePane` 屬性值為 `bottom_left`（底線），但 openpyxl 只接受 `bottomLeft`（駝峰）。需先修正：

```python
import zipfile
# 將所有 bottom_left 取代為 bottomLeft
```

### 欄位對應實作

```python
FIELD_MAP = {
    'ps_category': 'ps_category',
    'ps_product_name': 'ps_product_name',
    'ps_product_description': 'ps_product_description',
    'ps_sku_parent_short': 'ps_sku_short',
    'ps_price': 'ps_price',
    'ps_stock': 'ps_stock',
    'ps_length': 'ps_length',
    'ps_width': 'ps_width',
    'ps_height': 'ps_height',
    'ps_item_cover_image': 'ps_item_cover_image',
    'ps_item_image_1': 'ps_item_image_1',
    'ps_item_image_2': 'ps_item_image_2',
    'ps_item_image_3': 'ps_item_image_3',
    'ps_item_image_4': 'ps_item_image_4',
    'ps_item_image_5': 'ps_item_image_5',
    'ps_item_image_6': 'ps_item_image_6',
    'ps_item_image_7': 'ps_item_image_7',
    'ps_item_image_8': 'ps_item_image_8',
    'ps_brand': 'ps_brand',
    'ps_weight': 'ps_weight',
}
```

### 固定值

```python
DEFAULTS = {
    'ps_hs_code': '49019900',       # 書籍/印刷品（通用）
    'ps_tax_code': 'GEN_Zero',      # 零稅率
    'ps_weight': '0.5',             # 預設 0.5 kg
    'channel_id_': '開啟',           # 配送方式：開啟
    'ps_product_pre_order_dts_range': '',
    'ps_product_pre_order_dts': '',
}
```

---

## 檔案

| 檔案 | 用途 |
|------|------|
| `scripts/test-convert-catalog-to-xlsx.py` | 轉換測試腳本（已通過） |
| `docs/data/product-catalog-tw.json` | 商品目錄（來源） |
| `docs/data/sample-existing-products.json` | 已上架商品樣本（模擬資料） |
| `docs/shopee-official-tool/Shopee_mass_upload_2026-07-18_basic_template_fixed.xlsx` | 蝦皮官方模板（已修正 bottom_left 相容性） |
| `docs/data/product-catalog-upload_{YYYY-MM-DD}.xlsx` | 輸出檔案 |

---

## 相關文件

- `docs/spec/018-spec-商品目錄JSON結構與大量上傳對應（product_catalog_structure）.md`
- `docs/spec/019-plan-本地目錄伺服器（local_catalog_server）.md`
- 蝦皮大量上傳說明：`docs/shopee-official-tool/蝦皮賣家中心-批次新增商品-上傳檔案.url`
- 蝦皮大量上傳下載模板：`docs/shopee-official-tool/蝦皮賣家中心-批次新增商品-下載模板.url`
- 我的商品頁面：`https://seller.shopee.tw/portal/product/list/live/all`
- 新增商品頁面：`https://seller.shopee.tw/portal/product/new`