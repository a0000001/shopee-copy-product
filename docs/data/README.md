# docs/data/ 資料目錄

本目錄存放 Shopee 商品上架流程（shopee_listing_pipeline）產生的各階段資料檔案。
涵蓋了：

資料流圖 — API capture → item-ids → catalog → descriptions 的上下游關係
8 個檔案的個別說明 — 為何建立、如何建立、內容格式、命名道理
命名規則表 — shopee-* vs product-* 的分界
依賴關係摘要
之後第三方或三個月後的回來看，不需要翻對話記錄就知道這些檔案是什麼、從哪來的。

## 資料流關係

```
Shopee 賣場頁面 HTML
    │
├──→ product-catalog_原始檔.md       （原始抓取：賣場頁面的純文字內容）
│
├──→ shopee-api-capture.json         （原始抓取：Shopee API 端點回傳的 JSON 快取）
│
├──→ shopee-item-ids.json            （從卡片文字解析出的商品 ID 清單）
│         │
│         ├──→ product-catalog-{tw,en,ms}.json（單語系目錄：名稱、價格、類別、NSFW、ProductId、電腦規格）
│         │
│         └──→ product-descriptions.json（OCR/AI 產出的商品描述，最終用於上架）
│
├──→ audit-report.csv                （圖片資料夾盤點：各產品有幾張圖、有無描述檔）
│
└──→ missing-report-商品缺失盤點.md   （盤點結論：哪些產品缺圖、缺描述）
```

---

## 檔案說明

### `shopee-api-capture.json`
- **建立原因**：用 Playwright 攔截 Shopee 頁面的 XHR/Fetch 請求，保存 API 原始回傳以供分析
- **建立方式**：Playwright 開啟賣場頁面，監聽 `response` 事件，過濾 Shopee API domain 的 JSON 回傳
- **內容**：`[{ url, data }, ...]` — 每個 entry 記錄一個 API 端點的完整回傳
- **狀態**：28,601 lines，已不再更新（API 路徑已被 WAF 封鎖）

### `shopee-item-ids.json`
- **建立原因**：從賣場頁面卡片中抽出所有商品 ID 與基本資訊，作為後續建立目錄的輸入
- **建立方式**：Playwright 解析 `.shopee-search-item-result__item` 卡片的 `href`、`imgAlt`、`cardText`
- **內容**：`{ itemid: { itemid, shopid, href, imgAlt, cardText } }` — 282 項商品
- **命名理由**：`shopee-` 前綴代表「原始來源端資料」，未經加工

### `product-catalog-{tw,en,ms}.json`
- **建立原因**：將商品 ID 清單轉換為結構化單語系目錄，每個檔案僅保留一種語言
- **建立方式**：從原始 `product-catalog.json` 拆出三個語系，扁平化多語言物件
- **內容**：`[{ product_name, price_twd, nsfw, tag, category, product_description, ProductId, computer_specs: { gpu, ram, cpu, storage, power } }]`
  - `ProductId`：格式 `PROD-ID-xxxxxx`，同索引跨語系對應同一商品
  - `computer_specs`：結構化物件，待 AI 依產品類型填入
- **命名理由**：`product-` 前綴代表「加工後的產出端資料」，`-{tw,en,ms}` 區分語系

### `product-catalog.json`（已棄用）
- **原用途**：結構化多語目錄，合併中/英/馬來文在同一檔案
- **狀態**：已拆分為 `product-catalog-{tw,en,ms}.json` 後刪除

### `product-descriptions.json`
- **建立原因**：存放從產品圖片 OCR 萃取的商品描述，最終用於上架
- **建立方式**：待 vision model（GPT-4o / Claude）逐張讀取產品圖片後填入
- **內容**：`{ "資料夾名稱": { ocr_raw, description_generated } }`
- **狀態**：僅有 Anydoor 一筆佔位符，其餘待補

### `product-catalog_原始檔.md`
- **建立原因**：第一個原始的賣場頁面抓取結果，保留 HTML 文字風貌
- **建立方式**：Playwright 直接擷取頁面可見文字
- **備註**：原始檔保留不用於程式處理，僅供人工比對

### `product-catalog_mazz.txt`
- **建立原因**：從對話紀錄中保存的商品清單（含價格），含聊天上下文
- **建立方式**：複製對話內容
- **備註**：歷史記錄，非主流程檔案

### `audit-report.csv`
- **建立原因**：盤點 95 個商品圖片資料夾，確認各產品有幾張圖、幾段影片、有無描述檔
- **建立方式**：Python 腳本掃描 `蝦皮商品圖稿/` 目錄，統計每資料夾的圖片/影片/描述檔數量
- **內容**：CSV，每列一個產品，欄位含 FolderName, ImageTotal, JpgCount, HasDesc, TotalSizeMB, ImagesNeeded 等

### `missing-report-商品缺失盤點.md`
- **建立原因**：統整 Phase 1 盤點結果，列出缺圖或缺描述的產品，作為後續補圖任務
- **建立方式**：AI 根據 audit-report.csv 生成階段報告
- **內容**：總覽統計 + 各產品缺圖數量 + task 格式可逐項處理

---

## 命名規則

| 前綴 | 意義 | 範例 |
|------|------|------|
| `shopee-*` | 原始來源端資料（未經加工或輕度加工） | `shopee-api-capture.json`, `shopee-item-ids.json` |
| `product-*` | 加工後的產出端資料（AI 轉換後） | `product-catalog.json`, `product-descriptions.json` |
| `product-*_原始檔` | 保留的原始抓取文字 | `product-catalog_原始檔.md` |
| `product-*_mazz` | 非程式產出的歷史記錄 | `product-catalog_mazz.txt` |

## 依賴關係摘要

- `product-catalog.json` ← `shopee-item-ids.json`
- `product-descriptions.json` ← vision OCR on `蝦皮商品圖稿/*/` images
- `missing-report-商品缺失盤點.md` ← `audit-report.csv`
