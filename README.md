# Shopee Copy Product — Chrome Extension

一鍵擷取蝦皮商品標題、價格、描述，下載圖片 (JPG) 與影片，並支援自動寫入本地商品目錄及賣家中心批次上架。

## 專案結構

```
shopee-copy-product/
├── extension/              # 擴充功能原始碼（打包上傳時只 zip 這個資料夾）
│   ├── manifest.json       # MV3 宣告
│   ├── background.js       # Service Worker（右鍵選單、批次下載）
│   ├── content.js          # Content Script（頁面資料擷取與自動填入）
│   ├── popup.html          # 彈出視窗 UI
│   ├── popup.js            # 彈出視窗邏輯
│   └── icon.png            # 圖示
├── scripts/                # 本地服務與輔助工具
│   ├── local-catalog-server.py  # 本地目錄伺服器
│   └── convert-old-catalog.py   # 資料轉換工具
├── docs/
│   ├── data/               # 商品目錄資料 (product-catalog-tw.json)
│   ├── spec/               # 工程規格與計畫文件
│   └── privacy/            # 隱私權政策（GitHub Pages）
├── .env                    # GitHub Token（已加入 .gitignore）
├── .gitignore
└── README.md
```

---

## 開發與測試

1. 開啟 Chrome 瀏覽器 `chrome://extensions` → 啟用右上角「開發者模式」。
2. 點擊「載入未封裝擴充功能」 → 選取 `extension/` 資料夾。

---

## 打包上架

只打包 `extension/` 資料夾：

```bash
cd extension && Compress-Archive -Path * -DestinationPath ../shopee-copy-product.zip
```

---

## 自動拉取商品並寫入 `product-catalog-tw.json`

本功能透過 **Chrome 擴充功能 (Shopee Get Content)** 配合 **本地目錄伺服器 (local-catalog-server.py)** 運作。

### 操作步驟

#### 步驟 1：啟動本地目錄伺服器
外掛需透過伺服器進行檔案讀寫與去重，請在終端機執行：
```powershell
python scripts/local-catalog-server.py
```
*(亦可在外掛彈出視窗面板右上角點擊 `▶` 按鈕啟動伺服器)*

#### 步驟 2：開啟蝦皮商品頁面
在 Chrome 瀏覽器中開啟任一蝦皮商品頁面（例如：`https://shopee.tw/product/...`）。

#### 步驟 3：點擊外掛 UI 按鈕
1. 點擊瀏覽器右上角的 **Shopee Get Content 外掛圖示** 打開面板。
2. 面板自動載入商品標題、價格、描述及圖片預覽。
3. 勾選面板底部的 **`[x] 更新 JSON`** (`chkAutoCatalog`)。
4. 點擊 **`[ 複製到剪貼簿 ]`** 按鈕（或 **`[ 下載資料 ]`** 按鈕）。

> 💡 **自動處理流程**：點擊按鈕後，外掛會在複製剪貼簿的同時發送請求給 `local-catalog-server.py`，伺服器會自動比對去重並 append/merge 寫入 `docs/data/product-catalog-tw.json`。

---

## 相關技術文件

- **外掛功能與 UI 規格**：`docs/spec/014-spec-擴充功能-chrome extension-shopee-get-content.md`
- **本地目錄伺服器架構**：`docs/spec/019-plan-本地目錄伺服器.md`
- **連線與自動備份說明**：`docs/spec/020-fix-本地目錄伺服器連線與輪播圖觸發.md`
- **商店上架審查清單**：`docs/spec/091-guide-Chrome 線上應用程式商店- 擴充功能-上架審查工具與檢查清單（chrome_web_store_publish）.md`