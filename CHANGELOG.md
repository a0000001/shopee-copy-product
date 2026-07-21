# Changelog

> 本文件記錄 Shopee Copy Product 所有歷史變更。2026-07-19 前之紀錄由原 repo (`S:\projects\shopee`) git history 遷移整理，commit hash 保留供交叉參考。

## 2026-07-21

### 新增功能：019 本地目錄伺服器 — Extension 一鍵寫入商品目錄

- `scripts/convert-old-catalog.py` — 一次性轉換腳本：181 筆舊格式（`product_name`、`price_twd`）轉為新格式（`ps_product_name`、`ps_price`），自動備份 `.bak`，支援重複執行保護，查無類別對照時留空並印警告清單
- `scripts/local-catalog-server.py` — 本地 HTTP 伺服器（Python http.server，零依賴），接收 extension POST 的商品資料，三層去重比對（`ps_sku_short`→`url`→`ps_product_name`）後自動附加至目錄 JSON；支援 `--catalog-path` 參數指向測試檔案；CORS 跨源、原子寫入（先寫 `.tmp` 再 `os.replace`）、`ensure_ascii=False` 中文不逃逸
- `extension/popup.js` — 新增 `submitToCatalog()` 按鈕邏輯，從 `chrome.storage.sync` 讀取伺服器位址，POST 後顯示對應 toast（已寫入 / 已存在跳過 / 無法連線）
- `extension/popup.html` — 新增「送出至目錄」按鈕
- `extension/options.html` + `options.js` — 選項頁面，可修改目錄伺服器位址（預設 `http://localhost:9801`），存入 `chrome.storage.sync`
- `extension/manifest.json` — 註冊 `options_page`、`http://localhost/*` host_permissions、`storage` 權限
- `docs/data/product-catalog-tw.json` — 181 筆已轉換為新格式
- `docs/spec/019-plan-本地目錄伺服器（local_catalog_server）.md` — 完整實作計畫含測試流程
- `docs/spec/018-spec-商品目錄JSON結構與大量上傳對應（product_catalog_structure）.md` — 補充 `#architectural-limitations` 架構限制段落 + Test A~E 驗證步驟

### 修正

- `019-plan` — 去重規則補上空字串陷阱防護（兩側皆空時不比對）；server 路徑不一致修正；CORS + OPTIONS preflight 處理；manifest host_permissions 改為 `http://localhost/*`（配合 options page 可修改 port）；類別查無對照時留空 + 印警告；JSON 寫入指定 `ensure_ascii=False`；轉換腳本加入重複執行保護；寫入原子性（暫存檔 + rename）；reason 回應動態產生
- `popup.html` — 類別下拉預設選中「電腦與周邊配件 &gt; 軟體」（`selected` 屬性），避免每次手動選擇；價格、庫存、尺寸改為同一行水平排列節省版面；移除「用AI更新JSON」按鈕（與「複製到剪貼簿」功能重複）；影片與圖片合併為同一區塊，影片縮圖（▶ 標記）排在圖片之前，數字動態顯示總項目數
- `background.js` — `serverStart` 改為非同步等待 Native Host 回應，不再立即回 `{ok: true}`，避免啟動失敗沒被發現
- `popup.js` — `onServerStart()` 檢查 `serverStart` 的回應，若 `ok: false` 直接顯示錯誤訊息，不等到 3 秒後才發現
- `install-native-host.ps1` — 重寫為純 ASCII 解決 PowerShell 編碼錯誤；改為 `ConvertTo-Json` 物件建構，避免字串取代產生無效 JSON（單反斜線）；新增 `-ExtensionId` 改為選填，可從 `.env` 讀取 `EXTENSION_ID`
- `.gitignore` — 加入 `__pycache__/`、`*.pyc` 避免 Python 快取檔被追蹤

### 修復：POST /append 連線失敗（根因：Native Host 行程樹被殺）

第一次推測 CORS/PNA header 不足（commit `905aea2`）→ 無效
第二次推測 popup 跨來源問題，改為 background 發送（commit `7f00186`）→ 仍無效
第三次加入診斷 log（commit `ec34f08`）→ 確認 `ERR_EMPTY_RESPONSE`，伺服器端斷線
第四次 `do_POST` 加入 try/except 防 crash（commit `d6eb5c3`）→ 仍無效

**最終根因**：Native Host 透過 `subprocess.Popen` 啟動伺服器，但 Chrome 殺掉 Service Worker 時會 kill 整個 Native Host 行程樹，**連同子行程的伺服器一起殺掉**。健康檢查走獨立 HTTP fetch 不受影響，所以 popup 顯示「運行中」但伺服器已死。

- `catalog-server-host.py` — 加入 `CREATE_NEW_PROCESS_GROUP`（Windows）／`start_new_session`（Unix）讓伺服器獨立於行程樹
- `docs/spec/020-fix-本地目錄伺服器連線與輪播圖觸發（catalog_connection_carousel）.md` — 建立根因分析與修復文件

### 修正：去重邏輯改為「完整資料才跳過，不完整則合併補齊」

`local-catalog-server.py` 的去重邏輯原先只要名稱/url 相同就跳過，不檢查既有資料是否完整。修正為：

- `check_duplicate()` — 加入 `_is_complete()` 檢查（`ps_price`、`ps_stock`、`ps_category` 三者皆非空才算完整）
- 完整資料吻合 → `skipped`（跳過不寫入）
- 不完整資料吻合 → `merged`（合併補齊既有資料中缺少的欄位）
- 新增 `merge_product()` 函數：逐一欄位檢查，既有資料為空才補入
- 新增 action `merged`，popup toast 顯示「📝 已更新既有資料」
- 測試擴大為 50 項（含 merged 驗證：確認 `ps_category` 與 `ps_product_description` 確實補齊）

### 修正：伺服器路徑傳遞與原生主機容錯 (`634af43`)

- `background.js` — `serverStart` 不再傳送空的 `catalog_path`，僅在使用者有設定時才加入 native message，確保原生主機使用預設路徑
- `catalog-server-host.py` — 改用 `msg.get('catalog_path') or CATALOG_PATH`，即使收到空字串也 fallback 到預設路徑，雙重保護

### 修正：錯誤訊息改為 Modal 對話框 (`c04591c`)

- `popup.html` — 新增 Modal 結構（`.modal-overlay`、`.modal-box`、`.modal-body`）與「複製錯誤訊息」按鈕
- `popup.js` — 新增 `showErrorModal()`、`hideErrorModal()`、`copyErrorToClipboard()`；`submitToCatalog`、`onServerStart`、`onServerStop` 的錯誤改為 Modal 顯示，可換行、可滾動、按 ✕ 才關閉，不再一閃即過

### 新增功能：複製時自動更新目錄（取代獨立「送出至目錄」按鈕）

- `popup.html` — 移除「送出至目錄」按鈕；「複製到剪貼簿」改為按鈕主色（`#ee4d2d`）；新增核選方塊「更新JSON」及 `.copy-option` 樣式
- `popup.js` — 新增 `loadAutoCatalogSetting`、`saveAutoCatalogSetting`、`initAutoCatalogCheckbox`；`btnCopy` 點擊後若 checkbox 勾選，複製完 JSON 自動呼叫 `submitToCatalog`；checkbox 狀態存入 `chrome.storage.sync`；反核選時彈出 `confirm` 確認
- `scripts/test-catalog-server.py` — 測試更新為檢查 `chkAutoCatalog` 取代 `btnCatalog`，增加 1 項測試（共 51 項）

### 修正：測試與 Extension 伺服器埠號衝突

- `local-catalog-server.py` — 新增 `--port` 參數，可指定埠號（預設 9801）
- `test-catalog-server.py` — 改用 port 9802 執行測試，與 Extension 的 9801 完全隔離；加入啟動前清理殘留伺服器、`finally` 同時清理 `old_server` 與 `server` 雙重保護

### 修正：複製+自動目錄只顯示單一合併提示，不重複彈出 (`8a97544`)

- `popup.js` — `submitToCatalog` 新增 `silent` 參數（靜默模式），自動目錄時不顯示獨立 toast，由 `btnCopy` 統一顯示單一合併提示
- `content.js` — `uploadMediaAsync` 新增 `images` 陣列重建邏輯，若 `data.images` 為空則從 `ps_item_cover_image` / `ps_item_image_1..8` 補回，相容舊版 JSON 格式

### 修正：伺服器面板改為圖示＋單一按鈕 (`9241a1f`)

- `popup.html` — 伺服器狀態改為純圖示（`⚠` 未啟動／`●` 運行中／`◌` 旋轉檢查中），所有文字移至 `title` 屬性（hover 顯示）；啟動/停止合併為單一按鈕
- `popup.js` — 新增 `onServerToggle` 取代 `onServerStart`/`onServerStop`；`updateServerStatus` 改為圖示 + CSS class 切換

### 修正：更新JSON核選方塊配色與按鈕區底部間距 (`23050f6`)

- `popup.html` — 核選方塊 `accent-color` 與核選後文字顏色改為 `#ee4d2d`（搭配按鈕主色）；移除按鈕樣式（無邊框、無背景、無 padding）；按鈕區底部 `margin-bottom: 8px`

## 2026-07-20

### 修正

- `信用卡分期設定填入` — 新增 `fillAll` 中填入「尺寸（長x寬x高）」屬性與「信用卡分期付款」（啟用 + 設為 24 期）
- `設定期數 Modal 互動修復` — 切換分期 radio 為「是」後，補上最多 3 秒 retry 等待 Vue re-render 「設定期數」按鈕；`waitForElement` 改為等待 `.tenure-slider-bubble`（目標節點）而非 modal 容器
- `017-fix` 規格文件完成，記錄根因分析（radio toggle → Vue re-render 時序）、隔離變因測試（排除 `isTrusted` 假說）、DOM 結構（installment modal）
- `14-seller-new-product-dom-analysis.md` 新增信用卡分期 DOM 結構與實戰教訓

### 新增檔案

- `extension/diagnose-installment.js` — 設定期數流程驗證診斷腳本
- `docs/spec/017-fix-新增賣家屬性填入與信用卡分期（seller_field_installment）.md`

### 新增功能：018-spec 商品目錄 JSON → Excel 大量上傳管線

- `scripts/json-to-shopee-excel.py` — 新增轉換腳本，將 `ps_*` 格式 JSON 輸出為蝦皮大量上傳 Excel（37 欄「上傳模式」sheet + 8 欄「參考欄位」sheet），支援 `--stock` 命令列覆寫（用 `is not None` 判斷，`--stock 0` 正確生效），非 `ps_*` 內部欄位跳過不輸出
- `extension/popup.js` — `toJsonClipboard()` 改為輸出 `ps_*` 欄位名並包裝為陣列格式（`ps_product_name`、`ps_price`、`ps_stock` 等），圖片第一張填 `ps_item_cover_image`，其餘填 `ps_item_image_1..8`；新增庫存輸入讀取與類別下拉讀取；seller mode 解析 JSON 支援陣列格式
- `extension/popup.html` — 擷取模式新增庫存 input（預設 999）、類別下拉選單（電腦>軟體）、固定尺寸說明
- `extension/content.js` — `fillAll()` 支援新舊兩種欄位名（優先讀 `ps_product_name`、`ps_price`、`ps_product_description`、`ps_stock`、`ps_brand`，無則 fallback 舊名）；尺寸支援 `ps_length`+`ps_width`+`ps_height` 組合；`data.price` 改用 `??` 避免 falsy 陷阱
- `018-spec` 狀態更新為 `implemented`

## 2026-07-19 (Day 1 開發尾聲)

### 專案獨立

- 從 `S:\projects\shopee` 拆分為獨立專案 `shopee-copy-product`
- 建立 GitHub repo：https://github.com/a0000001/shopee-copy-product
- 啟用 GitHub Pages（`docs/`），隱私權政策 URL：`/privacy/`
- 建立 CHANGELOG.md、ARCHITECTURE.md、REFERENCE.md 供獨立維護

### 修正

- `collection-time PNG magic number check` — 背景腳本透過 `Range: bytes=0-3` 輕量 fetch 前 4 bytes 比對 `\x89PNG`，在 extractProductData 回傳前過濾 CDN 端無副檔名的 PNG 圖片 (`03e36d6`)
- `買家頁 non-_tn 頭像漏網` — extractFromDOM() general loop 開頭排除 i9ihcI 容器內圖片 (`a2e290b`)
- `移除失敗的 closeCarouselPopup` — MutationObserver + Escape 關閉法失敗，列為永久放棄方向 (`0d17f7b`)
- `closeCarouselPopup 改 rAF 後再 dispatch Escape + focus` (`af8b032`)
- `用 MutationObserver 等 popup 出現再關閉` (`e631edf`)
- `修正 triggerCarouselFullRender 選擇器 + 新增 landing auto-trigger` — 讓 carousel 提前渲染 (`2f59cbe`)
- `修正蝦皮輪播圖 virtual rendering 造成圖片不足` — 在 extractFromDOM 前呼叫 triggerCarouselFullRender 觸發 React 渲染完整圖集 (`ecef0c9`)
- `merge all image sources; strengthen shop logo filter` — 全圖片來源合併 + 多層店鋪 LOGO 過濾 (`5efbdb4`)
- icon 改為一整套：16/32/48/128 PNG

### [-- checkpoint --] `d783d41`

> 優化商品類別與品牌自動選取可靠性，排除影片上傳，修復圖片遺漏與 PNG 覆蓋問題

- content.js/popup.js：自動選取商品類別「電腦與周邊配件 > 軟體」
- 類別確認後 1000ms Settle Delay 防止 Vue 清空欄位
- 精確限縮確認按鈕至 Modal 容器，避免誤點全域「儲存並上架」
- 排除影片自動上傳，避免跳出影片裁剪對話框
- 品牌下拉加入最長 3s 輪詢等待非同步載入
- 商品描述精確對應 fieldIdMap description
- 價格清洗（區間取前半、移除非數字）
- 媒體自動下載與上傳（限圖片）：background.js 跨域 fetch → Base64 → content.js DataTransfer 寫入 file input
- DOM 圖片支援 `<picture>` `source` 及 `srcset`/`data-srcset`
- while 迴圈動態下載佇列，確保至多 9 張有效非 PNG 的 JPG

### 修復：重構蝦皮賣家中心商品編輯頁自動填入功能 (`1716b5c`)

- 重構 fillAll 改用 `data-product-edit-field-unique-id` 定位
- 引入 `waitForElement` 機制等待動態 DOM
- Quill 編輯器描述欄位填入
- EDS Select 品牌下拉自動選取（NoBrand）

### Revert 系列

- `5cf6086` Revert TreeWalker label 搜尋
- `0d704f5` Revert fire-and-forget 品牌下拉
- `4dd9afe` Revert eds-selector
- `703b918` Revert 強化欄位搜尋
- `543043e` Revert 診斷 log

### 修正

- 改用 TreeWalker 搜尋 label 文字節點 (`6f246a2`)
- 品牌下拉 fire-and-forget 避免 async 逾時 (`a669032`)
- 類別依賴發現與提示更新 (`77aeffa`)
- 強化欄位搜尋邏輯，支援 Vue 3 scoped label (`2c9a899`)
- 品牌下拉選單 eds-selector (`5c213e9`)
- 改為從剪貼簿直接填入 (`c68a51d`)
- 一鍵填入所有欄位，剪貼簿改 JSON 格式 (`18c3e54`)
- 新增賣家編輯頁標題填入功能 (`2971c67`)

### [-- checkpoint --] `8aec0e0`

> 解決圖片下載與剪貼簿垃圾文字問題，並修正 SW 的 URL.createObjectURL 缺失

- 批次下載時偵測 blob.type，若為 PNG 主動跳過
- 重構 DOM 描述擷取（DOM 兄弟節點 + 正則 lookahead 排除評價/footer）
- 移除剪貼簿複製格式中的圖片與影片 URL 列表
- 改用 ArrayBuffer + btoa 解決 MV3 Service Worker 缺少 URL.createObjectURL

### 修正

- safeName 改用 safeFolderName 確保資料夾名一致 (`60b3388`)
- context menu 資料夾名去除尾綴「| 蝦皮購物」(`3a0eaf8`)
- URL.createObjectURL 改用 FileReader + data URL (`e6839e6`)
- context menu 無反應 + 缺資料夾名；啟動即註冊 menu (`7910ae1`)
- 右鍵另存為 .JPG + OffscreenCanvas 實轉 JPG（context menu + 批次下載）(`b83ac1b`)
- API 加 X-Requested-With+v2 備援、scripts 增加 album/img_list (`4c83e69`)
- 描述 CSS pre-wrap、DOM loop .png 過濾 (`395d147`)
- API 總是呼叫補圖、描述保留斷行 (`5c373b4`)
- JSON-LD 僅取 images、支援 @graph (`9e15688`)
- JSON-LD 層補抓懶載入圖片、排除 .png (`d15f875`)
- 價格 aria-live 選擇器、圖片 supplement (`5ce4247`)
- DOM 圖片僅取 mdCA_C/uRJsr5 (`8778638`)
- isProductImg() 改語意過濾 (`cf0ba1a`)
- isProductImg() 過濾 DOM 小圖與賣場 logo (`05a5fdb`)

## 2026-07-18 (Day 1)

### feat: Chrome Extension Shopee Get Content（Spec 014）(`52f8839`)

- 新增 Chrome Extension：四層備援擷取商品資料（__INITIAL_STATE__ → OG meta → API → DOM）
- 新增 Spec 014 架構文件與實作審核
- 修正 manifest.json：移除未使用的 scripting，補上 www.shopee.tw/*
- 更新 .gitignore 排除 *.zip *.mp4

### 實測後修正 5 項 bug + 新增 AI 按鈕 (`58f873b`)

- 移除標題「 | 蝦皮購物」後綴
- 強制合併 DOM 圖片（不限空陣列才合併）
- 強化 DOM 價格擷取（多重選擇器）
- 新增 mdCA_C/uRJsr5 圖片選擇器
- 按鈕順序調整、新增「用AI更新JSON」按鈕

### Spec 文件演進

| Commit | 變更 |
|--------|------|
| `5b0441b` | 更新 spec 014 狀態矩陣與 changelog |
| `1c5d152` | 評估表格改為 MD 表格格式 |
| `cdfbe28` | spec 014 對齊實際進度（多來源、價格修正、風險更新） |
| `a1662b6` | 更新第十四節，附關鍵程式碼路徑與未解決問題 |
| `34cbcdc` | 確認 __INITIAL_STATE__ 不存在 |
| `fc938df` | 根因確立：蝦皮 carousel virtual rendering |
| `9b6ea5d` | 016-fix 加入 Task 6 collection-time PNG 魔數檢查 + v1.0.19 |

## 功能狀態

| 功能 | 狀態 | 說明 |
|------|------|------|
| 商品頁辨識 | ✅ | URL 模式：-i.{shopid}.{itemid} 或 /product/{shopid}/{itemid} |
| 標題擷取 | ✅ | 多來源擷取，已移除後綴 |
| 價格擷取 | ✅ | aria-live="polite"，目前正確 |
| 描述擷取 | ✅ | 保留換行、防禦性垃圾文字排除 |
| 圖片收集 | ✅ | 多來源合併 + DOM 完整觸發 |
| 影片收集 | ✅ | 去重處理 |
| 剪貼簿複製 | ✅ | 結構化格式 |
| 圖片下載 | ✅ | OffscreenCanvas 實轉 JPG |
| 影片下載 | ✅ | 僅限直接 MP4 |
| 賣家頁填入 | ✅ | 類別/品牌/標題/描述/價格/數量/最低購買 |
| 圖片自動上傳 | ✅ | DataTransfer 寫入 file input |
| 一鍵完成 | ❌ | 需改用 action.onClicked |
| HLS/DASH 影片 | ❌ | 需另建下載管線 |
| AI 更新 JSON | ❌ | 需 options page + API key 設定 |
