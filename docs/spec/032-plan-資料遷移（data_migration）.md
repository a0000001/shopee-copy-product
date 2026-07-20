---
type: plan
status: draft
updated: 2026-07-19
domain: meta
tags: [migration, data, shopee-copy-product, catalog]
---

# 資料遷移計畫：原 repo docs/data/ → shopee-copy-product

> 本文件沿用 099-plan 的脈絡，處理原 repo `S:\projects\shopee\docs\data\` 的資料檔案遷移。所有檔案已由 099-plan 歸類清楚，此處只處理資料層。

---

## 一、現狀

### 1.1 原 repo docs/data/ 完整清單

**子目錄：**

| 目錄 | 內容 |
|------|------|
| `mcp devtools/` | DOM 結構分析工具（與 013 爬取相關） |
| `蝦皮商品圖稿/` | 1423 個檔案、97 個子資料夾，合計 **2.7 GB** 的商品圖片/影片 |

**根目錄檔案：**

| 檔案 | 大小 | 分類 |
|------|------|------|
| `product-catalog-tw.json` | 127 KB | 011 產出：中文商品目錄 |
| `product-catalog-en.json` | 10 KB | 011 產出：英文商品目錄 |
| `product-catalog-ms.json` | 120 KB | 011 產出：馬來文商品目錄 |
| `product-catalog_原始檔.md` | 48 KB | 011 輸入：賣場頁面抓取原文 |
| `product-catalog_mazz.txt` | 20 KB | 011 輸入：對話記錄中的商品清單 |
| `shopee-api-capture.json` | 768 KB | 013 產出：Shopee API 回傳快取 |
| `shopee-item-ids.json` | 20 KB | 013 產出：商品 ID 清單 |
| `audit-report.csv` | 8 KB | 001 產出：Phase 1 盤點報表 |
| `missing-report-商品缺失盤點.md` | 9 KB | 001 產出：缺圖/缺描述報告 |
| `README.md` | 5 KB | 資料目錄說明文件 |
| `從mazz68收錄並拆分商品描述.md` | 3 KB | ✅ 已遷移（新 repo docs/data/） |
| `從mazz68收錄...145205.zip` | 2 KB | ✅ 已遷移（新 repo docs/data/） |
| `product-catalog-tw_*.zip`（5 個） | 各 10-23 KB | 歷史備份版本 |

### 1.2 新 repo docs/data/ 現有狀態

```
docs/data/
├── 從mazz68收錄並拆分商品描述.md
├── 從mazz68收錄並拆分商品描述_2026.07.18_145205.zip
└── mcp devtools/           （已搬入？需確認）
```

---

## 二、遷移判定

### 2.1 應遷移至新 repo（共 9 項）

| 檔案 | 對應 spec | 新 repo 目標路徑 | 原因 |
|------|-----------|-----------------|------|
| `product-catalog-tw.json` | 011 | `docs/data/product-catalog-tw.json` | 一鍵開店核心資料 |
| `product-catalog-en.json` | 011 | `docs/data/product-catalog-en.json` | 一鍵開店核心資料 |
| `product-catalog-ms.json` | 011 | `docs/data/product-catalog-ms.json` | 一鍵開店核心資料 |
| `product-catalog_原始檔.md` | 011 | `docs/data/product-catalog_原始檔.md` | 原始輸入，保留脈絡 |
| `product-catalog_mazz.txt` | 011 | `docs/data/product-catalog_mazz.txt` | 歷史記錄，保留脈絡 |
| `shopee-api-capture.json` | 013 | `docs/data/shopee-api-capture.json` | 爬取參考（WAF 封鎖前的最後 API 快取） |
| `shopee-item-ids.json` | 013 | `docs/data/shopee-item-ids.json` | 商品 ID 清單 |
| `audit-report.csv` | 001 | `docs/data/audit-report.csv` | Phase 1 盤點報表 |
| `missing-report-商品缺失盤點.md` | 001 | `docs/data/missing-report-商品缺失盤點.md` | 缺圖/缺描述報告 |

### 2.2 不遷移（共 6 項）

| 檔案 | 原因 |
|------|------|
| `product-catalog-tw_*.zip`（5 個歷史版本） | 僅為備份，新 repo 已有最新版 .json |
| `蝦皮商品圖稿/`（2.7 GB） | 太大，且 git 不適合管理大量二進位檔 |
| `mcp devtools/` | 已在某處？需確認是否已存在於新 repo |

### 2.3 影像資產處理選項（蝦皮商品圖稿/）

2.7 GB、1423 個檔案，不建議進 git。選項：

| 選項 | 作法 | 優點 | 缺點 |
|------|------|------|------|
| A. 留原 repo | 不遷移，當作原始素材庫 | 不佔新 repo 空間 | 需要時得到原 repo 找 |
| B. 放外部儲存 | 上傳雲端硬碟，docs/ 放連結 | 不佔 git 空間 | 多一個維護點 |
| C. git LFS | 用 Git Large File Storage 管理 | 保留在版控中 | 需設定 LFS，且免費額度有限 |

**建議：選 A，留原 repo。** 等一鍵開店系統實際需要圖片批量處理時再決定。

---

## 三、執行步驟

### 步驟 1：遷移 9 項資料檔案

```powershell
# 複製 JSON 目錄（核心資料）
Copy-Item "S:\projects\shopee\docs\data\product-catalog-tw.json" -Destination "S:\projects\shopee-copy-product\docs\data\" -Force
Copy-Item "S:\projects\shopee\docs\data\product-catalog-en.json" -Destination "S:\projects\shopee-copy-product\docs\data\" -Force
Copy-Item "S:\projects\shopee\docs\data\product-catalog-ms.json" -Destination "S:\projects\shopee-copy-product\docs\data\" -Force

# 複製原始輸入
Copy-Item "S:\projects\shopee\docs\data\product-catalog_原始檔.md" -Destination "S:\projects\shopee-copy-product\docs\data\" -Force
Copy-Item "S:\projects\shopee\docs\data\product-catalog_mazz.txt" -Destination "S:\projects\shopee-copy-product\docs\data\" -Force

# 複製爬取參考
Copy-Item "S:\projects\shopee\docs\data\shopee-api-capture.json" -Destination "S:\projects\shopee-copy-product\docs\data\" -Force
Copy-Item "S:\projects\shopee\docs\data\shopee-item-ids.json" -Destination "S:\projects\shopee-copy-product\docs\data\" -Force

# 複製盤點報表
Copy-Item "S:\projects\shopee\docs\data\audit-report.csv" -Destination "S:\projects\shopee-copy-product\docs\data\" -Force
Copy-Item "S:\projects\shopee\docs\data\missing-report-商品缺失盤點.md" -Destination "S:\projects\shopee-copy-product\docs\data\" -Force

# 複製 README（整合後再決定是否合併）
Copy-Item "S:\projects\shopee\docs\data\README.md" -Destination "S:\projects\shopee-copy-product\docs\data\README-原repo.md" -Force
```

### 步驟 2：驗證

```powershell
Get-ChildItem "S:\projects\shopee-copy-product\docs\data" -File | Select-Object Name
# 預期：product-catalog-*.json ×3, shopee-*.json ×2, product-catalog_* ×2, audit-report.csv, missing-report-*.md, 從mazz68*.md, 從mazz68*.zip
```

### 步驟 3：原 repo 刪除已遷移檔案

```powershell
# 等用戶確認後執行
Remove-Item "S:\projects\shopee\docs\data\product-catalog-tw.json" -Force
Remove-Item "S:\projects\shopee\docs\data\product-catalog-en.json" -Force
Remove-Item "S:\projects\shopee\docs\data\product-catalog-ms.json" -Force
Remove-Item "S:\projects\shopee\docs\data\product-catalog_原始檔.md" -Force
Remove-Item "S:\projects\shopee\docs\data\product-catalog_mazz.txt" -Force
Remove-Item "S:\projects\shopee\docs\data\shopee-api-capture.json" -Force
Remove-Item "S:\projects\shopee\docs\data\shopee-item-ids.json" -Force
Remove-Item "S:\projects\shopee\docs\data\audit-report.csv" -Force
Remove-Item "S:\projects\shopee\docs\data\missing-report-商品缺失盤點.md" -Force
```

### 步驟 4：兩個 repo 分別 commit

```powershell
# 新 repo
Set-Location "S:\projects\shopee-copy-product"
git add -A
git commit -m "migration: 搬入 product-catalog JSON、API 快取、盤點報表至 docs/data/"
git push

# 原 repo
Set-Location "S:\projects\shopee"
git add -A
git commit -m "chore: 遷移 docs/data/ 中 9 項資料檔案至 shopee-copy-product"
```

---

## 四、執行後的新 repo docs/data/ 預期結構

```
docs/data/
├── product-catalog-tw.json              ← 011 產出
├── product-catalog-en.json              ← 011 產出
├── product-catalog-ms.json              ← 011 產出
├── product-catalog_原始檔.md             ← 011 輸入
├── product-catalog_mazz.txt             ← 011 輸入
├── shopee-api-capture.json              ← 013 產出
├── shopee-item-ids.json                 ← 013 產出
├── audit-report.csv                     ← 001 產出
├── missing-report-商品缺失盤點.md         ← 001 產出
├── 從mazz68收錄並拆分商品描述.md          ← ✅ 已遷移
├── 從mazz68收錄並拆分商品描述_*.zip       ← ✅ 已遷移
├── README-原repo.md                     ← 原 repo 的資料說明（待整合）
└── mcp devtools/                        ← 位置待確認
```

---

## 五、尚未決定的事項

| 項目 | 狀態 |
|------|------|
| `mcp devtools/` 是否已存在於新 repo？ | 待確認 |
| `蝦皮商品圖稿/` 2.7 GB 的處理方式 | 暫定留原 repo（選項 A） |
| 原 repo `README.md` 與新 repo 的整合 | 先另存，後續決定是否合併 |
