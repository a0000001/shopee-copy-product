# Architecture — Shopee Copy Product

## 專案概覽

Chrome Extension (MV3)，從蝦皮商品頁(PDP)擷取標題/價格/描述/圖片/影片，並填入賣家中心編輯頁。

## 目錄結構

```
```
shopee-copy-product/
├── extension/                    # 打包上架用（zip 這個資料夾）
│   ├── manifest.json             # MV3 宣告、權限、content script 設定
│   ├── background.js             # Service Worker
│   ├── content.js                # Content Script（頁面資料擷取 + 賣家頁填入）
│   ├── popup.html                # 彈出視窗 UI
│   ├── popup.js                  # 彈出視窗邏輯
│   └── icon{16,32,48,128}.png   # 圖示一整套
├── docs/
│   ├── spec/                     # 工程文件
│   │   ├── 001-plan-*            # 商品上架流程（AI 按鈕依賴）
│   │   ├── 012-plan-*            # 商品圖片影片與描述規範（AI 按鈕依賴）
│   │   ├── 013-guide-*           # 蝦皮商品描述爬取（AI 按鈕依賴）
│   │   ├── 014-spec-*            # 主 spec（功能、架構、權限分析）
│   │   ├── 015-fix-*             # 輪播圖 virtual rendering 修正紀錄
│   │   ├── 016-fix-*             # PNG 過濾修正紀錄
│   │   └── 021-guide-*           # 上架審查工具與檢查清單
│   ├── privacy/index.html        # 隱私權政策（GitHub Pages）
│   ├── data/                     # 工程資料
│   │   ├── 從mazz68收錄並拆分商品描述.md  # AI 指令檔（給「用AI更新JSON」按鈕用）
│   │   └── mcp devtools/         # DOM 結構分析檔案
│   └── scripts/                  # debug 腳本
│       ├── _000_PROVEN_rootcause_carousel_virtual_rendering.js
│       ├── _001_diagnostic_dom_timing.js
│       ├── _002_diagnostic_dom_click.js
│       └── DIAGNOSTIC_JOURNEY.md
├── tests/                        # 測試檔案（選填）
├── CHANGELOG.md                  # 完整變更歷史
├── ARCHITECTURE.md               # 本文件
├── REFERENCE.md                  # 原 repo 歷史對照
├── README.md                     # 快速入門
├── .env                          # GitHub Token（已 .gitignore）
└── .gitignore
├── tests/                        # 測試檔案（選填）
├── CHANGELOG.md                  # 完整變更歷史
├── ARCHITECTURE.md               # 本文件
├── REFERENCE.md                  # 原 repo 歷史對照
├── README.md                     # 快速入門
├── .env                          # GitHub Token（已 .gitignore）
└── .gitignore
```

## 三層通訊架構

```
┌──────────────┐     chrome.tabs.sendMessage     ┌──────────────┐
│   popup.js   │ ──────────────────────────────>  │  content.js  │
│  (popup UI)  │ <──────────────────────────────  │ (頁面上下文) │
└──────┬───────┘    回傳 ProductData               └──────┬───────┘
       │                                                  │
       │ chrome.runtime.sendMessage                       │
       ▼                                                  │
┌──────────────┐                                          │
│ background.js │  <───────────────────────────────────────┘
│ (SW)          │  chrome.runtime.onMessage (download)
└──────────────┘
```

### 各組件職責

| 組件 | 檔案 | 職責 |
|------|------|------|
| Popup | popup.html + popup.js | 顯示擷取結果、觸發複製與下載、雙模式路由（shopee.tw=擷取 / seller.shopee.tw=填入） |
| Content Script | content.js | 注入商品頁(PDP)：多來源擷取商品資料；注入賣家頁(seller)：填入表單欄位 |
| Service Worker | background.js | 右鍵 context menu、批次下載（OffscreenCanvas JPG 轉換） |
| Manifest | manifest.json | MV3 宣告、權限、content_scripts matches |

## 資料擷取策略（五來源多層備援）

```
waitForStablePage()
  │
  ├── extractFromScripts()     // __INITIAL_STATE__（已失效，保留相容）
  ├── extractFromJSONLD()      // JSON-LD Product schema（僅取 images）
  ├── extractFromMeta()        // Open Graph meta tags
  ├── extractFromAPI()         // Shopee API v4 → v2（best effort，可能被 WAF 擋）
  └── extractFromDOM()         // DOM 直接擷取（每次執行、合併）
       └── triggerCarouselFullRender()  // 先點擊縮圖觸發 React 渲染完整圖集
       └── isProductImg()               // 多層過濾排除 LOGO/頭像/推薦區
```

詳細合併邏輯見 014-spec §4.7。

## 關鍵技術決策

### 1. Virtual Rendering 圖片不足

蝦皮 carousel 使用 virtual rendering，初始只 render 5 張縮圖。修正：`triggerCarouselFullRender()` 在提取前程式化點擊現有縮圖觸發 React 渲染完整 9 張。

```
document.querySelectorAll('.mdCA_C').forEach(el => {
  el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
  el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
  el.click()
})
```

### 2. PNG 過濾（無副檔名 CDN URL）

蝦皮 CDN URL 格式為 `https://down-tw.img.susercontent.com/file/{id}`，完全無副檔名。三層防禦：
1. URL 字串過濾：`_tn`（縮圖）、`_cover`（封面）
2. MIME 類型檢測：下載前 fetch 檢查 `blob.type`
3. Magic Number sniffing：`Range: bytes=0-3` 比對 `\x89PNG`

### 3. JPG 實體轉換

MV3 Service Worker 不支援 `URL.createObjectURL`。改用 `ArrayBuffer` + `btoa` 產生 data URL。OffscreenCanvas → createImageBitmap → canvas.convertToBlob('image/jpeg', 0.92) 實轉 JPG。

### 4. Vue 3 雙向綁定

蝦皮賣家中心使用 Vue 3。單純 `input.value = 'xxx'` 框架不會偵測。修正：
- `Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value)`
- dispatch `input` / `change` / `blur` event
- 品牌下拉：完整滑鼠事件鏈 `mousedown → mouseup → click`

## 權限分析

| 權限 | 用途 | 必要性 |
|------|------|--------|
| activeTab | 存取目前分頁 | 合理 |
| clipboardWrite | 複製商品資料到剪貼簿 | 必要 |
| clipboardRead | 從剪貼簿讀取 JSON 填入賣家頁 | 必要（需在商店說明解釋） |
| contextMenus | 右鍵另存為 JPG | 必要 |
| downloads | 下載圖片與影片 | 必要 |
| host: shopee.tw/* | 注入 content script | 必要 |
| host: seller.shopee.tw/* | 賣家頁填入功能 | 必要 |
| host: *.img.susercontent.com | background.js 跨域 fetch 圖片 | 必要（context menu + 批次下載） |

## 修改指引

### 要改圖片/影片擷取邏輯

→ 改 `extension/content.js` 的 `extractFromDOM()` / `extractProductData()`

### 要改下載邏輯

→ 改 `extension/background.js` 的 `toJpgDataUrl()` / `downloadBatch()`

### 要改賣家頁填入邏輯

→ 改 `extension/content.js` 的 `fillProductData()` / `fillAll()` / `findFieldByLabel()`

### 要改 popup UI

→ 改 `extension/popup.html` + `extension/popup.js`

### 要改 manifest 權限

→ 改 `extension/manifest.json`（注意 `host_permissions` 要與 `content_scripts.matches` 一致）

### 想新增 AI 功能

→ 實作路徑已規劃：`options.html` + `chrome.storage.local` 存 API key → `docs/data/從mazz68收錄並拆分商品描述.md` 作為指令

## 開發流程

```bash
# 1. 在 chrome://extensions 載入 extension/ 資料夾
# 2. 修改程式碼後按 ↻ 重新載入
# 3. 前往 shopee.tw 商品頁測試
# 4. Console 看 debug log（mdCA_C containers / images collected）
```

### 打包上架

```bash
cd extension && Compress-Archive -Path * -DestinationPath ../shopee-copy-product.zip
```

只 zip `extension/` 資料夾，不包含 `docs/`、`tests/`、`.env` 等工程文件。

### Chrome Web Store 資訊

- 開發者帳號：https://chrome.google.com/webstore/devconsole
- 隱私權政策：https://a0000001.github.io/shopee-copy-product/privacy/
- 審查清單：`docs/spec/021-guide-上架審查工具與檢查清單（chrome_web_store_publish）.md`
