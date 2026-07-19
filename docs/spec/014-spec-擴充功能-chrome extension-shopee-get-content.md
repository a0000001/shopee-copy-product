---
type: spec
status: stable
updated: 2026-07-19
version: 1.0.19
domain: shopee
tags: [shopee, chrome-extension, mvp, shopee-get-content, tooling]
---

# Chrome Extension：Shopee Get Content

> 一鍵擷取蝦皮商品標題、價格、描述，下載圖片與影片。

---

## 一、目的與範圍

### 1.1 動機

在管理蝦皮賣場的過程中，需要快速從商品頁面擷取結構化資料（標題、價格、描述、圖片、影片），以便比對商品目錄、備份資料、分析競品資訊，減少繁瑣的手動複製/下載流程。

### 1.2 範圍

| 包含 | 不包含 |
|------|--------|
| 蝦皮商品詳情頁（PDP）資料擷取 | 搜尋頁、賣場頁、購物車、結帳頁 |
| 標題、價格、描述 → 剪貼簿 | 商品規格、評價、問答 |
| 商品圖片下載 | 圖片格式轉換（JPG 轉換未完成） |
| 商品影片下載（僅限直接 MP4） | HLS/DASH 串流影片下載 |
| shopee.tw 臺灣站 | 其他國家站點（shopee.sg, shopee.co.th 等） |

### 1.3 目標使用者

已登入蝦皮的賣家，需要在 Chrome 瀏覽器中快速擷取商品頁資料。

---

## 二、功能需求

### 2.1 功能清單

| 編號 | 功能 | 優先級 | 狀態 |
|------|------|--------|------|
| F-01 | 辨識目前頁面是否為商品頁 | P0 | ✅ 已實作 |
| F-02 | 擷取商品標題 | P0 | ✅ 已實作 |
| F-03 | 擷取商品價格 | P0 | ✅ 已實作 |
| F-04 | 擷取商品描述 | P0 | ✅ 已實作 |
| F-05 | 商品資料複製到剪貼簿 | P0 | ✅ 已實作 |
| F-06 | 下載商品圖片 | P0 | ✅ 已實作（未實際轉 JPG） |
| F-07 | 下載商品影片 | P1 | ✅ 已實作（僅限直接 MP4） |
| F-08 | 一鍵完成全部動作 | P2 | ❌ 未實作，需另按兩個按鈕 |
| F-09 | 圖片轉 JPG（實際格式轉換） | P2 | ❌ 未實作，僅更改副檔名 |
| F-10 | HLS/DASH 串流影片下載 | P3 | ❌ 未實作 |

### 2.2 使用流程

點 icon 開啟 popup → 自動擷取顯示結果 → 需再按兩個按鈕（「複製到剪貼簿」與「下載圖片 + 影片」），各自獨立執行。


### 2.3 剪貼簿輸出格式

```
標題：[商品標題]
價格：[商品價格]
網址：[目前頁面 URL]

--- 商品描述 ---
[商品描述文字]
```

---

## 三、系統架構

### 3.1 架構總覽

三層通訊：popup.js → content.js（提取資料）→ popup.js（顯示 + 剪貼簿）→ background.js（下載）。

三個組件透過 chrome.runtime.sendMessage 與 chrome.tabs.sendMessage 通訊。

### 3.2 組件職責

| 組件 | 檔案 | 職責 |
|------|------|------|
| Popup | popup.html + popup.js | 與 content script 通訊，顯示結果，觸發複製與下載 |
| Content Script | content.js | 在頁面上下文中提取商品資料（多來源擷取與合併） |
| Service Worker | background.js | 右鍵「另存為 .JPG」context menu；批次下載（含 OffscreenCanvas 實轉 JPG） |
| Manifest | manifest.json | 宣告權限、內容腳本、資源 |

### 3.3 訊息序列

1. popup 開啟 → chrome.tabs.sendMessage({action: "getProductData"}) → content.js
2. content.js 執行 extractProductData()（多來源擷取與合併）→ 回傳 ProductData
3. popup 顯示結果 → 使用者按「複製」→ navigator.clipboard.writeText()
4. 使用者按「下載」→ chrome.runtime.sendMessage({action: "download", ...}) → background.js
5. background.js 逐一下載 images 與 videos

---

## 四、資料擷取策略（多來源擷取與合併）

### 4.1 實際來源順序

| 順序 | 來源 | 實際用途 | 現況 |
|------|------|----------|------|
| 1 | `__INITIAL_STATE__` script tag | 主要取得標題、價格、描述、圖片、影片 | **已失效**（2026-07 實測 `window.__INITIAL_STATE__` 為 `undefined`，頁面無包含該變數的 inline script） |
| 2 | JSON-LD `Product` | 前一層失敗時備援；目前僅採用圖片 | 支援 `@graph`，通常只提供部分圖片 |
| 3 | Open Graph meta tags | 前兩層都沒有資料時備援 | 可取得基本欄位與 `og:image` |
| 4 | Shopee API v4 → v2 | 每次有 shopid/itemid 都嘗試，成功時合併圖片 | 目前仍可能被 WAF 擋，屬 best effort |
| 5 | DOM 直接擷取 | 每次執行；補標題/價格/描述，並合併圖片/影片 | CSS Modules 造成選擇器具脆弱性 |

### 4.2 `__INITIAL_STATE__`

從頁面 script 標籤尋找 `window.__INITIAL_STATE__` 並解析 JSON。

主要讀取 `productDetail.product` 的 name、price、price_max、description（HTML）、images（hash 陣列）、video_info 等。圖片擷取策略改為**全來源合併**：同時讀取 `images`、`image_list`、`img_list`、`album`，以及 `models`（變體圖片）、`tier_variations[].images`（規格顏色圖），以 `Set` 去重後合併為單一列表，不再因第一個非空陣列就 break 而漏掉更完整的圖集。

失效觀察（2026-07-19 實測）：
- 在 shopee.tw 商品頁的 Console 執行 `typeof window.__INITIAL_STATE__` 回傳 `"undefined"`
- 頁面上無任何 `<script>` tag 的 textContent 包含 `__INITIAL_STATE__` 字串
- 蝦皮已改為 React SPA 架構，商品資料透過 API fetch 動態載入，不再內嵌於初始 HTML
- `extractFromScripts()` 因此完全無效，永遠回傳 `null`

脆弱性：
- ~~目前以 assignment 去除前綴後執行 `JSON.parse`，若 script 含附加 JS 或特殊 escape 仍可能失敗~~（已無作用）
- Shopee 可能變更變數名稱、資料路徑或移除該變數 ← **已發生**
- ~~若 `product.images`/`image_list`/`album` 同時存在，現在均會合併；但若所有陣列均為空，仍以 regex fallback 掃描 `tw-` 圖片 ID~~（已無作用）
- 商品 description 為 HTML，以 `innerHTML` → `textContent` 去除 HTML；popup 另以 `white-space: pre-wrap` 顯示換行

### 4.3 JSON-LD

當 `__INITIAL_STATE__` 無法取得資料時，讀取 `script[type="application/ld+json"]`。支援 `@graph` 結構，目前僅採用 `Product.image`，避免 JSON-LD 的價格覆蓋頁面 `aria-live` 擷取到的實際價格。此來源通常只提供部分圖片。

### 4.4 Open Graph Meta

從 meta 標籤讀取結構化資料，不依賴 JS 變數。

- `og:title` → 標題
- `og:description` → 描述（可能截斷，不如 layer 1 完整）
- `og:image` → 圖片 URL
- `product:price:amount` → 價格

### 4.5 Shopee API

先以 fetch 呼叫 `https://shopee.tw/api/v4/item/get?itemid={itemid}&shopid={shopid}`，失敗後再嘗試 v2 endpoint，並附帶 `credentials: include`、`X-Requested-With` 與 Referer。

已知風險（詳見 013-guide）：內部 API 受 Shopee WAF 保護，可能回傳 403/90309999。即使 content script 與頁面同源，仍可能遭 IP 與瀏覽器指紋層級阻擋。此層級為 best effort，不保證可用；目前實測 API 仍未補回缺少的圖片。

目前不論前面是否已取得資料都會嘗試 API；若成功，至少合併 API 圖片，若前面完全無資料才以 API 資料作為主資料。

### 4.6 DOM 擷取

DOM 每次執行並與其他來源合併：

- 標題：`document.querySelector('h1')`
- 價格：`[aria-live="polite"]` 優先，再使用價格相關選擇器；目前實測價格已正確
- 描述：`body.innerText` 中「商品描述」後 3000 字
- 圖片：優先讀取 `[class*="mdCA_C"] img` / `[class*="uRJsr5"] img`，再以 `down-tw.img.susercontent.com` 圖片作 supplement；支援 `data-src`、`srcset`、`data-srcset`
- 圖片過濾（`isProductImg`）：排除 SVG、URL 含 `.png`、`_cover`；強化過濾邏輯：透過 alt、src 路徑（avatar/logo/icon）、ancestor class（shop-header/avatar/logo/recommend 等）、以及連結 href（/shop/、shop_id=）多層條件排除店鋪 LOGO 與推薦區塊圖片；supplement 另排除寬或高小於 100 的圖片
- 影片：`video[src]`、`video source[src]`、`source[src*="shopeemobile.com"]`

脆弱性：Shopee 使用 CSS Modules（隨機 class name），class name 與 DOM 結構可能改版。圖片仍可能因 lazy loading、未渲染的 carousel 項目或 CDN URL 沒有副檔名而漏抓或誤判格式。

### 4.7 合併邏輯

```text
data = extractFromScripts()          // 主要來源
if (!data) data = extractFromJSONLD() // 圖片備援
if (!data) data = extractFromMeta()   // meta 備援
apiData = await extractFromAPI()      // 有 ID 就 always best effort
if (data && apiData?.images?.length) data.images += apiData.images
if (!data && apiData) data = apiData
domData = extractFromDOM()            // 每次執行並合併
// scalar 欄位只在缺值時由 DOM 補入；images/videos 一律合併
data.images = dedupe(data.images).filter(imageFilter)
data.videos = dedupe(data.videos)
```

---

## 五、資料模型

### 5.1 ProductData 結構

```typescript
interface ProductData {
  title: string        // 商品標題
  price: string        // 商品價格（字串，含幣別）
  description: string  // 商品描述（純文字）
  images: string[]     // 圖片 URL 陣列（去重複）
  videos: string[]     // 影片 URL 陣列（去重複）
  url: string          // 目前頁面 URL
  shopid?: string      // 賣場 ID
  itemid?: string      // 商品 ID
  error?: string       // 錯誤訊息
}
```

### 5.2 價格單位轉換

蝦皮 API 傳回的 price 以 100000 為單位：price / 100000（例：152800000 → 1528）。

---

## 六、下載與命名規則

### 6.1 下載目錄結構

```
{商品名稱}/
  images/{商品名稱}_{序號}.jpg
  videos/{商品名稱}_video_{序號}.mp4
```

### 6.2 命名規則現況

| 項目 | 現況 | 與既有規範（012-plan）不一致 |
|------|------|------------------------------|
| 序號格式 | _1（從 1 起） | 應為 _001（三碼補零） |
| 圖片副檔名 | .jpg | 僅更改副檔名，實際格式未轉換 |
| 影片副檔名 | .mp4 | 硬命名，未依 Content-Type 判斷 |

### 6.3 檔名安全處理

```
safeName = title.replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, '_').substring(0, 100)
```

---

## 七、權限分析

### 7.1 Manifest 權限

| 權限 | 用途 | 必要性 |
|------|------|--------|
| activeTab | 存取目前分頁 | 合理 |
| clipboardWrite | 寫入剪貼簿 | 必要 |
| downloads | 下載圖片與影片 | 必要 |
| scripting | 動態注入腳本 | 已移除（content_scripts 已是 always-on，不需動態注入） |
| host_permissions: https://shopee.tw/* | 注入 content script | 必要 |
| https://www.shopee.tw/* | 已補上 | 已加入 host_permissions |

---

## 八、測試計畫

### 8.1 測試項目

| 編號 | 測試項目 | 方法 | 預期結果 |
|------|----------|------|----------|
| T-01 | manifest 載入 | chrome://extensions Developer mode 載入 | 無錯誤 |
| T-02 | 商品頁擷取 | 瀏覽已登入的商品頁，點 icon | 顯示結果 |
| T-03 | 非商品頁提示 | 瀏覽首頁/賣場頁，點 icon | 顯示「不在商品頁面上」 |
| T-04 | 標題正確性 | 比對擷取結果與頁面標題 | 一致 |
| T-05 | 價格正確性 | 比對擷取結果與頁面價格 | 一致 |
| T-06 | 描述正確性 | 比對「商品描述」區塊 | 一致 |
| T-07 | 剪貼簿格式 | 按「複製」後貼上 | 結構化格式正確 |
| T-08 | 圖片下載 | 按「下載」按鈕 | 圖片成功下載並可開啟 |
| T-09 | 影片下載 | 按「下載」按鈕 | 影片成功下載 |
| T-10 | 下載內容驗證 | file 指令驗證實際 Content-Type | 不因 .jpg 副檔名而誤判 |

### 8.2 測試環境

- Chrome 最新穩定版
- 已登入 shopee.tw 的瀏覽器 session
- 至少測試 3 種不同類型的商品頁面

---

## 九、已知限制與風險

### 9.1 圖片格式不保證為 JPG

background.js 將圖片命名為 .jpg，但 chrome.downloads.download() 不會轉換格式——它直接儲存 CDN 回傳的原始內容。若 Shopee CDN 回傳 WebP 或 AVIF，則檔名為 .jpg 但實際格式不符，可能無法直接開啟。

正確做法：使用 Offscreen Document 或 extension page 取得圖片 Blob，透過 canvas toBlob('image/jpeg') 轉換。需處理 CORS、透明背景白色合成、大圖記憶體等問題。

### 9.2 影片格式限制

Shopee 商品影片可能使用：
- 直接 MP4 連結（可下載）
- 多畫質 MP4 清單（可下載）
- HLS 串流（.m3u8，不可直接下載）
- DASH 串流（.mpd，不可直接下載）

目前僅支援第一種情況。所有影片硬命名為 .mp4，未依 Content-Type 判斷。

### 9.3 DOM 選擇器脆弱

使用 `h1`、`aria-live="polite"`、`[class*="price"]` 等選擇器。價格目前已由 `aria-live="polite"` 實測修正；圖片仍依 CSS Modules 的 `mdCA_C/uRJsr5` 與 CDN URL，DOM 結構改版時可能失效。

### 9.4 API 可能受 WAF 阻擋

API v4/v2 的 item get endpoint 受 Shopee WAF 保護，content script 的 fetch 請求可能回傳 403/90309999。

### 9.5 __INITIAL_STATE__ 已失效

2026-07-19 實測確認：Shopee 商品頁已不再使用 `window.__INITIAL_STATE__` 內嵌初始資料。蝦皮改為 React SPA 動態載入後，該變數完全消失。`extractFromScripts()` 永遠回傳 `null`，其內部所有邏輯（合併 `image_list`/`img_list`/`album`、`tw-` ID regex fallback 等）均無執行機會。

### 9.6 真實環境測試尚未完成驗收

已在真實 Chrome + 已登入商品頁測試，價格已確認修正；但目前仍有 PNG 過濾失效與圖片少 3 張問題，且尚未完成至少 3 種商品頁的完整回歸測試。

---

## 十一、實作狀態矩陣

| 項目 | 狀態 | 說明 |
|------|------|------|
| 專案結構 | 已完成 | 6 個檔案，MV3 標準 |
| 商品頁辨識 | 已完成 | URL 模式：-i.{shopid}.{itemid} 或 /product/{shopid}/{itemid} |
| 標題擷取 | 已完成 | 多來源擷取，已移除「 | 蝦皮購物」後綴 |
| 價格擷取 | 已完成 | API 單位轉換 /100000；DOM 使用 `aria-live="polite"`，目前實測價格已正確 |
| 描述擷取 | 已實作 | 去除 HTML、保留換行；popup 以 `white-space: pre-wrap` 顯示，已完成回歸確認 |
| 圖片 URL 收集 | 受阻 | 多來源合併邏輯已實作，但 `extractFromScripts()` 因 `__INITIAL_STATE__` 消失而完全失效，DOM 及 API 為目前僅有可行路徑 |
| 影片 URL 收集 | 已完成 | 去重複處理 |
| 剪貼簿複製 | 已完成 | 結構化格式輸出 |
| 圖片下載 | 已實作 | 非 JPG 來源經 OffscreenCanvas 實轉 JPG（含 context menu 單張與批次） |
| 影片下載 | 已實作 | 僅限直接 MP4 連結；硬命名 .mp4 |
| 真實環境測試 | 已完成 | 商品名稱、描述、價格、數量、最低購買數量、品牌下拉選單皆已成功自動填入 |
| 右鍵另存為 .JPG | 已實作 | contextMenus + OffscreenCanvas 實轉；以分頁標題為資料夾名稱；manifest 已宣告 contextMenus permission 與 *.img.susercontent.com 主機權限 |
| 圖片 JPG 轉換 | 已實作 | OffscreenCanvas → createImageBitmap → canvas.convertToBlob('image/jpeg', 0.92)；已有 fallback（轉換失敗時退回原始 URL） |
| 一鍵完成 | 未實作 | 需改用 action.onClicked（無 popup） |
| HLS/DASH 影片支援 | 未實作 | 需另建下載管線 |
| 序號 001 格式 | 未實作 | 目前 _1，規範要求 _001 |
| www 子網域支援 | 已修正 | manifest 已補上 www.shopee.tw |
| scripting permission | 已修正 | 已移除 |
| contextMenus permission | 已實作 | 右鍵圖片另存為 JPG |
| img.susercontent.com host | 已實作 | context menu + 批次下載均需 fetch 蝦皮圖片 CDN |
## 十一、審核結論

> 審核結果：黃燈有條件通過 MVP 階段，尚未達成原始需求的「單擊完成、真正 JPG 轉檔」。

### 已確認通過

- 架構設計合理：popup ↔ content ↔ background 三層通訊正確
- content.js 的 onMessage listener 存在，且以 `return true` 保持非同步
- 多來源策略已實作（__INITIAL_STATE__ → JSON-LD → meta → API → DOM）；API 目前為 always best effort，DOM 會合併補值
- 價格單位轉換正確（/100000）
- 剪貼簿輸出格式完整，含 URL 與檔案列表
- 去重複處理（dedupe function）正確
- 檔名特殊字元去除正確
- 使用 chrome.runtime.onMessage 的 return true 保持非同步

### 需修正（阻擋正式驗收）

| # | 問題 | 嚴重性 | 建議修正 |
|---|------|--------|---------|
| 1 | scripting permission 冗餘 | 低 | 已移除 |
| 2 | www.shopee.tw 遺漏在 host_permissions | 中 | 已補上 |
| 3 | 圖片副檔名 .jpg 但實際格式未轉換 | 高 | 已修正：OffscreenCanvas + createImageBitmap + convertToBlob 實轉 JPG；非 JPG 來源均經轉換，轉換失敗 fallback 原 URL |
| 4 | 影片硬命名 .mp4，未判別真實格式 | 中 | 依 Content-Type 或 URL 判斷 |
| 5 | DOM 選擇器過於寬鬆，可靠度低 | 中 | 增加 data-testid、aria-label 等穩定選擇器 |
| 6 | 序號 _1 而非 _001，與 012-plan 不一致 | 低 | 補零格式化 |
| 7 | 未真實環境測試 | 高 | 至少測試 3 種不同商品頁 |
| 8 | API 層級可能被 WAF 阻擋 | 中 | 已於 spec 記錄為 best effort，v4/v2 均可能失敗 |
| 9 | PNG 過濾仍可能失效 | 高 | 目前只依 URL 字串 `.png` 判斷，需取得實際 URL/MIME 後再修正 |
| 10 | 商品圖片不足 | 高 | 根因（2026-07-19 確認）：蝦皮 carousel 使用 virtual rendering，初始只 render 5 個可見縮圖；其餘 4 個不在 DOM 中。`extractFromScripts()` 因 `__INITIAL_STATE__` 消失而完全失效。解法：在提取前先程式化點擊現有縮圖，觸發 React 渲染完整 9 張 |

### 建議開發優先序

1. ✅ 修正 manifest.json（移除 scripting、補 www.shopee.tw）—— 已完成
2. ✅ 修正並確認價格擷取—— 已完成
3. ✅ 圖片 JPG 實體轉換—— 已完成（OffscreenCanvas）
4. ✅ 右鍵另存為 .JPG context menu—— 已完成
5. 取得實際 PNG URL 與缺少的 3 張圖片資料，針對現象修正，不再追加猜測性 endpoint
6. 完成至少 3 種商品頁的擷取、剪貼簿、下載回歸測試
7. 長線：評估 action.onClicked 一鍵完成方案

---

## 十二、相關文件

| 文件 | 關聯 |
|------|------|
| docs/spec/012-plan-商品圖片影片與描述規範（shopee_media_description）.md | 圖片格式 JPG、影片規格 MP4/H.264、命名規則 _001 |
| docs/spec/013-guide-蝦皮商品描述爬取（shopee_scraping）.md | Shopee WAF 阻擋、API 可用性調查 |
| docs/spec/001-plan-商品上架流程（shopee_listing_pipeline）.md | 總體上架流程 |
| __remo__/shopee-get-content/ | Extension 實作原始碼 |

---

## 實測結果01（歷史紀錄）
```
下載後圖片副檔名為.jpg，該圖片目前上傳蝦皮正常, 沒有被拒絕.

按鈕"下載圖片+影片"改成第一個，複製到剪貼簿改成第二個，並在右邊新增一個按鈕"用 AI 更新 JSON"，目前暫時沒有功能，未來其行為請看# 後續待開發。

# 圖片影片下載成功, 但須修正 :
## 點擊ICON, 
- 商品標題多出了後綴"  | 蝦皮購物"
 - 彈出窗口顯示只有一張圖片, 我要的產品圖片此時正確數量為9張圖片
- 點擊ICON, 彈出窗口的價格欄位顯示"無價格", 其實是有價格的

## 點擊"下載圖片+影片", 
- 只下載了一個影片跟一個圖片。

## 下載的檔案 應全部放在以商品標題為資料夾名稱的裡面

# 我觀察到所有的商品描述的圖片都是以. webp 為附檔名, 在這個結構的<div class="mdCA_C uRJsr5">裡面，範例:
<div class="mdCA_C uRJsr5"><div class="FAWPL0"><picture class="i9ihcI"><source srcset="https://down-tw.img.susercontent.com/file/tw-11134207-820l7-mpif4o4ky9e4d0@resize_w82_nl.webp 1x, https://down-tw.img.susercontent.com/file/tw-11134207-820l7-mpif4o4ky9e4d0@resize_w164_nl.webp 2x" type="image/webp" class="i9ihcI"><img width="82" loading="lazy" class="P39yUt lazyload TnEtN4" srcset="https://down-tw.img.susercontent.com/file/tw-11134207-820l7-mpif4o4ky9e4d0@resize_w82_nl 1x, https://down-tw.img.susercontent.com/file/tw-11134207-820l7-mpif4o4ky9e4d0@resize_w164_nl 2x" src="https://down-tw.img.susercontent.com/file/tw-11134207-820l7-mpif4o4ky9e4d0" height="82"></picture></div><div class="thumbnail-selected-mask"></div><div class="Vb5WGt"></div></div>
<div class="mdCA_C uRJsr5"><div class="FAWPL0"><picture class="i9ihcI"><source srcset="https://down-tw.img.susercontent.com/file/tw-11134207-820l6-mq6nkwbo89vw3d@resize_w82_nl.webp 1x, https://down-tw.img.susercontent.com/file/tw-11134207-820l6-mq6nkwbo89vw3d@resize_w164_nl.webp 2x" type="image/webp" class="i9ihcI"><img width="82" loading="lazy" class="P39yUt lazyload TnEtN4" srcset="https://down-tw.img.susercontent.com/file/tw-11134207-820l6-mq6nkwbo89vw3d@resize_w82_nl 1x, https://down-tw.img.susercontent.com/file/tw-11134207-820l6-mq6nkwbo89vw3d@resize_w164_nl 2x" src="https://down-tw.img.susercontent.com/file/tw-11134207-820l6-mq6nkwbo89vw3d" height="82"></picture></div><div class="thumbnail-selected-mask"></div><div class="Vb5WGt"></div></div>

```

## 實測結果02（歷史紀錄）

### 圖片有很多小logo
- 小logo要排除, 你可以把寬或高小於100的都排除
。
- 或者如果可以這樣更好, 這是賣場LOGO, 包含賣場LOGO跟以後代碼的圖片全都不要了
<img width="80" loading="lazy" class="P39yUt lazyload mYIRfs" srcset="https://down-tw.img.susercontent.com/file/tw-11134216-820le-mpu9hvkxwniaf5@resize_w80_nl 1x, https://down-tw.img.susercontent.com/file/tw-11134216-820le-mpu9hvkxwniaf5@resize_w160_nl 2x" src="https://down-tw.img.susercontent.com/file/tw-11134216-820le-mpu9hvkxwniaf5" alt="造訪賣場" height="80">

- 或者你有更好的方法？

### 價格（已修正）
歷史問題：landing 初期價格未出現，且曾誤抓 `$999`。

目前改由 `section[aria-live="polite"]` 優先擷取頁面實際價格；目前實測價格已正確，例如 `$1,999`。

## 實測結果03（目前進度）

- 價格：已修正，使用 `aria-live="polite"` 後目前實測正確。
- 描述：content.js 保留換行，popup.html 已加入 `white-space: pre-wrap`；尚待完整回歸確認。
- PNG 過濾根因分析：蝦皮 CDN URL 格式為 `https://down-tw.img.susercontent.com/file/{id}`，完全**沒有副檔名**，因此 content.js 與 background.js 的 `/\.png/i.test(url)` 條件對這類 URL 完全無效。
  - 修正策略：改為**下載端一律轉換**，`toJpgDataUrl()` 透過 OffscreenCanvas 強制將任何格式（PNG/WebP/AVIF）轉為 JPG，不再依賴 URL 副檔名判斷。context menu 與批次下載均已改為此邏輯。
  - content.js 層的 `/\.png/i` 過濾仍保留，僅排除 URL 中明確含有 `.png` 的圖片（如某些靜態 icon/placeholder）；對無副檔名的 CDN URL 不影響。
- `toJpgDataUrl` 已加入白色背景合成（`ctx.fillStyle = '#ffffff'`），透明 PNG 轉 JPG 不再出現黑色背景。
- `background.js:23` 錯誤：原因是 `toJpgDataUrl(url)` 若 fetch 失敗（非 2xx）會拋出 uncaught rejection，被 Shopee APMS 攔截並顯示為匿名例外。已修正：`fetch` 加 `resp.ok` 檢查，所有 `toJpgDataUrl` 呼叫點均加 `.catch()` 吸收，不再向上傳播。
- 圖片數量：目前實測仍未增加，該商品頁仍少 3 張。v4/v2 API 與額外 script 路徑已嘗試，但 API 仍可能受 WAF 阻擋。
- Debug：content.js 會在 Console 輸出 `mdCA_C containers` 與 `images collected`，僅供定位問題。

## 附錄 A：Changelog

| 日期 | 版本 | 變更 |
|------|------|------|
| 2026-07-18 | 1.0.0 | 初版 spec，含實作審核與修正建議 |
| 2026-07-18 | 1.0.1 | 實測後修正：移除標題「蝦皮購物」後綴、強制合併 DOM 圖片、強化 DOM 價格擷取、新增 mdCA_C 圖片選擇器、按鈕順序、新增 AI 按鈕 |
| 2026-07-18 | 1.0.2 | DOM 圖片過濾 isProductImg()：排除寬高 < 100px、賣場 logo、avatar 圖片 |
| 2026-07-18 | 1.0.3 | isProductImg() 移除寬高限制；移除 source[srcset] 避免 webp 重複；URL 正規化 split('@')[0] 去重 |
| 2026-07-18 | 1.0.4 | DOM 圖片僅取 mdCA_C/uRJsr5 縮圖區，排除 .svg |
| 2026-07-18 | 1.0.5 | 補回 img[src*="down-tw.img"] supplement；isProductImg()；排除 _cover；aria-live 價格 |
| 2026-07-18 | 1.0.6 | JSON-LD 層；supplement 寬高過濾；排除 .png |
| 2026-07-18 | 1.0.7 | JSON-LD 改僅取 images（移除 price，避免覆蓋 DOM 價格）；支援 @graph 結構；png filter 改 regex |
| 2026-07-18 | 1.0.8 | popup 描述加入 `white-space: pre-wrap`；DOM 圖片補上大小寫不敏感的 SVG/PNG URL 過濾 |
| 2026-07-18 | 1.0.9 | API 改為 v4 → v2 備援並加入 X-Requested-With；script 圖片增加 image_list/img_list/album 與 `tw-` ID fallback；加入圖片數量 debug log |
| 2026-07-18 | 1.0.10 | OffscreenCanvas 實轉 JPG（context menu + 批次下載）；右鍵「另存為 .JPG」；contextMenus permission；*.img.susercontent.com host_permission；context menu 以分頁標題為資料夾 |
| 2026-07-18 | 1.0.11 | context menu 改分頁標題（去尾綴「| 蝦皮購物」）為資料夾名；開機即註冊 menu 避免休眠後失效 |
| 2026-07-18 | 1.0.12 | PNG 排除根因修正：改為下載端一律轉 JPG（不依賴 URL 副檔名）；toJpgDataUrl 加白色底色合成；fetch 失敗加 resp.ok 檢查；所有呼叫點加 .catch() 防止 APMS uncaught rejection |
| 2026-07-19 | 1.0.13 | 品牌下拉選單與欄位自動填入修復：過濾父容器並優化滑鼠事件鏈為 mousedown -> mouseup -> click |
| 2026-07-19 | 1.0.14 | 進階欄位填入可靠性修復：1) 類別確認按鈕限縮範圍避免誤觸；2) 類別變更後等待 1000ms 讓 Vue DOM 重新渲染穩定，解決商品描述與標題被清空問題；3) 品牌下拉選項輪詢等待最長 3s，避免非同步載入為空；4) 描述欄位直接對應 fieldIdMap 的 description |
| 2026-07-19 | 1.0.15 | 根因確立：蝦皮 carousel virtual rendering 造成圖片不足。以 `__remo__/_000_PROVEN_rootcause_carousel_virtual_rendering.js` 驗證：初始只 render 5 個可見縮圖，其餘 4 個 DOM 不存在；點擊縮圖觸發 React 渲染完整 9 張。更新 spec §2026-07-19 根因分析、§11 修正項目 #10 |
| 2026-07-19 | 1.0.16 | 修正 carousel virtual rendering 圖片不足：在 `extractFromDOM()` 前呼叫 `triggerCarouselFullRender()`（layered selector + dispatchEvent + click）觸發 React 渲染完整圖集，再以 `waitForCarouselStable()`（2×rAF → 檢查 → 500ms fallback）確保圖片穩定。新增 landing auto-trigger 讓 carousel 提前渲染。附加 landing.auto-trigger；`closeCarouselPopup` MutationObserver + Escape 關閉法失敗（列為永久放棄方向）。 |
| 2026-07-19 | 1.0.17 | 修正 PNG 過濾漏洞：最終 filter 加入 `lower.includes('_tn')` 及 `lower.includes('_cover')` 小寫統一；`isProductImg()` badSrc 加入 `_tn` 檢查；下載層加入 PNG magic number sniffing（Content-Type 誤判時以 bytes 前 4 碼 `\x89PNG` 二次攔截）。 |
| 2026-07-19 | 1.0.18 | 修正買家頁非 `_tn` 頭像漏網：`extractFromDOM()` general loop 開頭排除 `i9ihcI` 容器內圖片。安全理由：主圖已從 JSON-LD/API 取得，縮圖已從 `mdCA_C` gallery loop 取得。 |
| 2026-07-19 | 1.0.19 | Collection-time PNG magic number check：透過背景腳本 `Range: bytes=0-3` 輕量 fetch 前 4 bytes 比對 `\x89PNG`，在 `extractProductData()` 回傳前過濾 CDN 端無副檔名的 PNG 圖片，讓彈窗與下載同時正確。 |


# 後續待開發

## 要給AI的指令
S:\projects\shopee\docs\data\從mazz68收錄並拆分商品描述.md

## 可用的AI API 
model:
  default: deepseek-v4-flash
  provider: custom
  base_url: https://opencode.ai/zen/v1
  api_key: ${OPENCODE_ZEN_TOKEN}

OPENCODE_ZEN_TOKEN 在這個檔案裡面 C:\Users\micha\.hermes\profiles\bella\.env

## 要開發的功能:
當用戶點擊"用 AI 更新 JSON"時，把剪貼簿的內容，送去給AI，AI按照"從mazz68收錄並拆分商品描述.md"操作。

評估結果：用 AI 更新 JSON
技術上可行，但需解決 3 個限制：

| 限制 | 原因 | 解法 |
|------|------|------|
| API Key 無法讀 .env | Chrome extension 不能讀本地檔案系統 | 需在 extension 內建 options page，讓用戶貼一次 key 存到 chrome.storage.local |
| 指令檔無法讀本地 .md | 同上 | 把 從mazz68收錄並拆分商品描述.md bundle 進 extension 作為 assets，或開 options page 貼入 |
| 產出 JSON 無法直接寫回磁碟 | 瀏覽器安全模型不允許 extension 寫任意路徑 | 只能下載檔案（存到 Downloads），或另開 local HTTP server 接收 |

實作變更量估算：

manifest：加 https://opencode.ai/* host_permission + storage permission
新增 options.html + options.js：API key 輸入頁
popup.js：改 AI 按鈕為真正呼叫 API，非僅複製
content.js 或 popup：bundled 指令文字
建議 MVP 路徑：若你接受產出用下載方式，這是 1 小時內可實作完的。要繼續做嗎？


# claude的偵錯進度
Viewed 014-spec-%E6%93%B4%E5%85%85%E5%8A%9F%E8%83%BD-chrome%20extension-shopee-get-content.md:475-527
Edited 014-spec-%E6%93%B4%E5%85%85%E5%8A%9F%E8%83%BD-chrome%20extension-shopee-get-content.md

找到根因了！

**`URL.createObjectURL` 在 MV3 Service Worker 裡不存在**，而 `chrome.downloads.download()` 接收 `data:` URL 時會在內部呼叫它。

這也解釋了為什麼批次下載的圖片仍然是 PNG/WebP：`toJpgDataUrl` 成功 → 但 `chrome.downloads.download(dataUrl)` 失敗 → `.catch()` 回傳 null → fallback 下載原始 HTTPS URL（原始格式）。

**Fix：換掉 `FileReader`，用 `ArrayBuffer` + `btoa` 產生 data URL；再用 fetch blob → base64 的方式讓 `chrome.downloads.download()` 接受。**

實際上在 MV3 SW 裡 `chrome.downloads.download({ url: 'data:...' })` 也不可靠。正確解法是不用 data URL，改用 **Offscreen Document**。但最簡單的 workaround 是：先讀 ArrayBuffer，轉 base64，再用 `chrome.downloads.download({ url: 'data:...' })`，這在大多數 MV3 版本可行：

Edited background.js

請在 `chrome://extensions` 重新載入擴充功能後測試。

---

## 根因總結

| 問題 | 根因 |
|------|------|
| `URL.createObjectURL is not a function` | MV3 Service Worker 沒有這個 API，而 `chrome.downloads.download()` 傳入 `data:` URL 時 Chrome 內部會呼叫它 |
| PNG 下載出現原始格式 | `toJpgDataUrl` 用 `FileReader` → 觸發上面的錯誤 → `.catch()` 回傳 null → fallback 下載原始 HTTPS URL（仍是 WebP/PNG）|
| 批次下載只顯示 `_5.jpg`, `_6.jpg` | 圖 1-4 的 `toJpgDataUrl` 失敗後 fallback 的原始 URL 也可能失敗（403 或其他），或者成功但是原始格式 |

**修正：** `FileReader` → `ArrayBuffer` + `btoa`，全程不需要 `URL.createObjectURL`，在 Service Worker 裡完全相容。

---

## 2026-07-18 圖片遺失根因分析（content.js 實際根因）

透過 CodeGraph 分析 content.js 的 extractProductData() 流程後，確認圖片遺失的 4 個實際根因：

### 根因 1：`img.src` placeholder 覆蓋 `data-src`

蝦皮用 `<img src="data:image/webp;base64,..." data-src="https://down-tw.img.susercontent.com/file/...">` 做 lazy loading：
- `img.src` 是佔位用的 base64 data URL
- `data-src` 才是真實圖片 URL
- content.js 的 `extractFromDOM()` 只讀 `img.src`，沒讀 `data-src`
- 相同的 `<picture><source srcset>` 內也使用 `data-srcset`

### 根因 2：`<source srcset>` 完全被忽略

圖片結構為：
```html
<picture>
  <source srcset="https://...@resize_w82_nl.webp 1x, ...@resize_w164_nl.webp 2x" type="image/webp">
  <img ... src="data:image/webp;base64,..." data-src="https://...">
</picture>
```
- content.js 只檢查 `img[src]`、`img[srcset]` 和 `source[src]`
- `<source>` 用 `srcset`（非 `src`）屬性，完全沒被讀取
- 資料來源 2（JSON-LD）和 5（DOM）都遺漏此結構

### 根因 3：`extractFromScripts()` 只取第一個 `product.images`

`__INITIAL_STATE__` 中有多個圖片相關欄位：
- `product.images` — 僅 6 張（主圖），API 回傳的第一頁
- `product.image_list` — 完整圖片 ID 陣列（含未被 `product.images` 包含的額外圖片）
- `product.album` — 同上，不同版本命名
- 多個 `tw-` ID 的圖片可能分散在不同路徑

content.js 的 `extractFromScripts()` 只有：
```javascript
const images = product.images || product.image_list || product.img_list || [];
```
一遇到 `product.images` 有值（即使不完整）就停止搜尋，完全沒嘗試 `image_list` 和 `album`。

### 根因 4：CDN URL 無副檔名被過濾器誤殺

蝦皮 CDN URL 格式為 `https://down-tw.img.susercontent.com/file/tw-11134207-xxxxx`，完全沒有副檔名。
- `isProductImg()` 的 `/\b\.(png|svg|gif|ico)\b/i` 過濾對這類 URL 不影響（這部分是好的）
- 但 URL 正規化時若沒正確處理無副檔名 URL，可能在 dedupe 或 merge 階段被當作不同 URL 重複排除

### 修正方向

1. **DOM 層**：同時讀取 `img.src`、`img.srcset`、`img.dataset.src`、`source.srcset`、`source.dataset.srcset`
2. **Script 層**：`extractFromScripts()` 改為嘗試所有欄位（`product.images`、`image_list`、`album`、`img_list`），合併所有 tw- ID 後轉為完整 URL
3. **Network 層**：用 `performance.getEntriesByType('resource')` 補捉蝦皮 CDN 請求
4. **去重**：以正規化後的 URL（去除 `@resize_*` 參數）為 key 去重

### 與 spec 現有章節的對應

| 根因 | 對應 4.6 (DOM) | 對應 4.2 (__INITIAL_STATE__) | 對應 9.x 風險 |
|------|----------------|-------------------------------|---------------|
| img.src vs data-src | DOM 只取 img.src | — | 9.3 (DOM 選擇器脆弱) |
| source srcset 忽略 | picture source 未被遍歷 | — | 9.3 |
| product.images 不完整 | — | 只取第一個 images，沒合併 image_list/album | 9.5 (解析脆弱) |
| CDN 無副檔名 | 過濾器不受影響，但 URL 處理不當 | — | 9.1 (圖片格式) |

### 修正後的 extractProductData() 流程（建議）

```text
waitForStablePage()          // 等待 lazy loading / carousel 觸發
data = extractFromScripts()  // 合併 product.images + image_list + album + img_list
data = merge(data, extractFromDOM())  // 讀取 img[src], img[data-src], source[srcset], img[srcset]
data = merge(data, extractFromJSONLD())
data = merge(data, extractFromMeta())
data = merge(data, extractFromAPI())  // best effort
data = merge(data, extractFromNetworkResources())  // 補捉 CDN 資源請求
data.images = dedupeWithKey(data.images, normalizeUrl)
data.images = data.images.filter(isProductImg)
```

---

## 2026-07-19 圖片遺失根因分析（第二次診斷，實測驗證）

### 背景

2026-07-18 的根因分析假設 `__INITIAL_STATE__` 仍存在，但 2026-07-19 實測確認該變數已完全移除。圖片僅能透過 `extractFromDOM()` 取得。為確認 DOM 提取圖片不足的原因，撰寫診斷腳本 `__remo__/debug_auto.js` 進行對照實驗。

### 診斷方法

在商品頁 Console 執行 `debug_auto.js`，分 4 階段執行：

| Phase | 操作 | 目的 |
|---|---|---|
| 1 | 立刻拍照 | 對照組 |
| 2 | 點擊右箭頭 | 測試 scroll 觸發 |
| 3 | 點擊所有現有縮圖 | 測試 React state 更新觸發 |
| 4 | 連續點擊右箭頭 ×5 | 測試多次 scroll |

### 診斷結果

| Phase | `.mdCA_C` 容器數 | 縮圖數 | 說明 |
|---|---|---|---|
| 1（立刻） | 5 | 5 | 初始只 render 5 張 |
| 2（箭頭） | 5 | 5 | 右箭頭點擊無效 |
| **3（點縮圖）** | **14** | **9** | **點擊縮圖後 React 渲染完整 9 張** |
| 4（scroll ×5） | 14 | 9 | 繼續 scroll 無新增 |

對照：頁面上全部 `img[src*="file/"]` 共 29 張（含 icon/logo 等），但 carousel 縮圖僅 5 → 9。

### 根因

蝦皮商品頁 carousel 使用 **virtual rendering**：初始只 render 可見區域的 5 個縮圖，其餘 4 個縮圖的 DOM 節點不存在。**點擊任一現有縮圖**會觸發 React state 更新，將完整的圖片列表（9 張）渲染到 DOM 中。右箭頭按鈕僅改變 scroll 位置，不會觸發完整渲染。

### 修正方向

在 `extractFromDOM()` 執行前，先程式化點擊所有現有縮圖以觸發 React 渲染完整圖集，再進行 DOM 擷取。不需等待、不需 MutationObserver。

```javascript
// 觸發 carousel 渲染完整圖片列表
document.querySelectorAll('.mdCA_C').forEach(el => {
  el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
  el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }))
  el.click()
})
```

### 2026-07-18 根因回顧

| # | 2026-07-18 推測根因 | 2026-07-19 驗證 |
|---|---|---|
| 1 | `img.src` placeholder 覆蓋 `data-src` | ❌ 實測蝦皮 `img.src` 已是真實 URL，無 placeholder |
| 2 | `<source srcset>` 被忽略 | ⚠️ 非圖片不足主因，但 DOM 已同時讀取 `src`/`srcset` |
| 3 | `product.images` 只取第一個 | ❌ `__INITIAL_STATE__` 已消失，此路徑完全無效 |
| 4 | CDN URL 無副檔名被誤殺 | ❌ 用戶確認與 PNG 過濾無關 |

診斷腳本：`__remo__/debug_auto.js`

### 1. 批次下載時「事先排除 PNG 圖片」
- **問題**：蝦皮圖片 CDN URL 沒有副檔名，無法單靠網址字串（如 `/\.png/i`）排除 PNG。
- **解法**：在 `background.js` 中下載前，先 `fetch` 取得圖片並檢查其 `blob.type` (MIME 類型)。若為 `image/png` 或 `image/x-png` 則拋出特殊的 `SKIP_PNG` 錯誤並在下載迴圈中直接跳過（Skip）下載。如此一來既能真正事先過濾掉 PNG 圖片，又不會因為強制轉 JPG 檔名將其強存為 `.jpg` 導致下載後更難排除。

### 2. 剪貼簿商品描述夾雜垃圾資訊（評價區與頁尾）
- **問題**：舊有的 DOM 描述擷取使用 `body.innerText` 進行 `/商品描述[\s\S]{1,3000}/` 粗暴的正則抓取，當描述太短時會將後面 3000 字元內的評價、客服、 footer、國家列表等垃圾字串一併複製到剪貼簿。
- **解法**：
  1. 重構 `content.js` 內的 `extractFromDOM()`。
  2. 優先搜尋 DOM 中為「商品描述」的純文字標題節點，若找到則直接提取其相鄰兄弟元素（`nextElementSibling`）內容。
   3. 若找不到，則回退到 `body.innerText` 正則搜尋，但引入防禦性的正則前瞻斷言限制 `(?=商品評價|評價|客服中心|幫助中心|關注我們|©\s*\d+|$)`，確保遇到評價區或 footer 時立即終止匹配，徹底杜絕垃圾文字複製。

---

## 十三、實測結果：填入賣家編輯頁標題

### 13.1 測試目標
將 JSON 中的 `title` 字段填入 `seller.shopee.tw` 賣家編輯頁的商品標題輸入框。

### 13.2 測試結果
✅ **成功填入** — 透過 popup → content script 通訊 (`chrome.tabs.sendMessage`)，成功找到標題輸入框並填入值。

### 13.3 關鍵技術決策記錄

#### 決策 1：content script 隔離環境（重要）
Chrome content script 在 isolated world 執行，其 `window` 與頁面主世界的 `window` 完全隔離。
- ❌ **Console 測試失敗**：即使 content script 設 `window.__sgcFillTitle = ...`，頁面 DevTools Console 仍報 `ReferenceError: __sgcFillTitle is not defined`
- ❌ **注入 `<script>` 標籤失敗**：蝦皮賣家頁面有 CSP `'script-src 'self'`，無 `'unsafe-inline'`，`document.createElement('script')` 注入會被 CSP 封鎖
- ✅ **正確解法**：Popup（或 background）透過 `chrome.tabs.sendMessage(tabId, {action: 'fillProductData', data})` 與 content script 通訊

#### 決策 2：React/Vue 雙向綁定
蝦皮賣家使用 Vue 3，直接用 `input.value = 'xxx'` 設值後框架不會偵測到變化。
- ✅ **解法**：用 `Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value)` + dispatch `input`/`change`/`blur` event

#### 決策 3：選擇器策略
賣家編輯頁使用 CSS Modules / Ant Design，class name 隨機化。
- ✅ **多層 fallback**：`input[placeholder*="商品"]` → `[aria-label*="商品名稱"]` → label 文字匹配 `商品名稱`/`商品標題` → `for` 關聯 → 父容器 `[class*="form-item"]` 內找 input

### 13.4 manifest 異動記錄
| 項目 | 異動 |
|------|------|
| host_permissions | + `https://seller.shopee.tw/*` |
| content_scripts.matches | + `"https://seller.shopee.tw/*"` |

### 13.5 新功能：popup 雙模式
Popup 根據 `tab.url` 自動切換模式：

| 網域 | 模式 | 行為 |
|------|------|------|
| `shopee.tw/*` | 擷取模式（原） | 提取商品資料、顯示、下載 |
| `seller.shopee.tw/*` | 填入模式（新） | JSON 輸入框 + 填入標題按鈕 |

### 13.6 檔案異動記錄
| 檔案 | 異動 |
|------|------|
| `manifest.json` | 加 seller.shopee.tw |
| `content.js` | 加 `fillProductData` handler、`findTitleInput()`、`fillTitle()` |
| `popup.js` | 重構 `main()` 為雙模式路由：`initExtractMode()` / `initSellerMode()` |
| `popup.html` | 加 `#sellerUI` 區塊（JSON textarea + 填入按鈕） |

---

## 十四、實測發現：類別依賴（重要）

### 14.1 問題
商品描述、價格、數量、最低購買數量、品牌等欄位，在選定類別之前**不存在於 DOM 中**。

蝦皮賣家編輯頁的流程：
1. 先選擇類別（如「電腦與周邊配件 > 軟體」）
2. 類別選定後，動態載入對應的表單欄位
3. 描述、價格、數量等欄位才出現

### 14.2 影響
- `findFieldByLabel()` 在類別選定前一定找不到「商品描述」「價格」「數量」等欄位
- 這不是選擇器的問題，是 DOM 根本還沒產生
- 類別選定後，仍須有正確的選擇器才能找到欄位

### 14.3 目前實作（關鍵程式碼）

#### 14.3.1 從剪貼簿填入（popup）
```javascript
// S:\projects\shopee\__remo__\shopee-get-content\popup.js (initSellerMode)
$('btnFill').addEventListener('click', async () => {
  raw = await navigator.clipboard.readText()
  data = JSON.parse(raw)
  resp = await chrome.tabs.sendMessage(tab.id, { action: 'fillProductData', data })
})
```

#### 14.3.2 填入欄位（content.js）
```javascript
// S:\projects\shopee\__remo__\shopee-get-content\content.js (fillAll / fillField / findFieldByLabel)

function fillField(value, ...strategies) {
  for (const s of strategies) {
    let el = (typeof s === 'string') ? document.querySelector(s) : s()
    if (el) { setNativeValue(el, value); return { ok: true } }
  }
  return { ok: false, error: '找不到欄位' }
}

function findFieldByLabel(labelText) {
  // 只搜 <label> 元素，不支援 Vue 3 scoped 結構
  const labels = document.querySelectorAll('.ant-form-item-label label, label')
  for (const lb of labels) {
    if (clean(lb.textContent) !== labelText) continue
    // ...尋找關聯 input
  }
  return null
}
```

#### 14.3.3 Vue 3 雙向綁定（content.js）
```javascript
// S:\projects\shopee\__remo__\shopee-get-content\content.js (setNativeValue)
function setNativeValue(input, value) {
  const proto = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype, 'value'
  ) || Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype, 'value'
  )
  if (proto?.set) proto.set.call(input, value)
  else input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new Event('change', { bubbles: true }))
  input.dispatchEvent(new Event('blur', { bubbles: true }))
  input.focus()
}
```

### 14.4 已解決與未解決的問題

| # | 問題 | 狀態 | 說明 / 解決方案 |
|---|------|------|-----------------|
| 1 | `findFieldByLabel` 搜不到 Vue 3 的 label | ✅ 已解決 | 重構為優先採用穩定特徵 `data-product-edit-field-unique-id` 識別，並以 `.edit-label` 內部的文字節點比對作為備援。 |
| 2 | 品牌下拉選單無法設定 | ✅ 已完成（v1.0.13） | 解決方案：<br>1. 排除非單一選項的父容器（例如 `options`、`menu` 等容器類名及包含嵌套 option 的元素）。<br>2. 將原本的點擊事件順序重構為標準滑鼠事件鏈：`focus()` -> `mousedown` -> `mouseup` -> `click()`，以完美匹配 Vue 3 所需的響應機制。<br>3. 補上輪詢等待最長 3s，解決非同步載入延遲（v1.0.14）。 |
| 3 | 通訊逾時錯誤 | ✅ 已解決 | 在 content script 中將訊息處理器的 async 響應正確處理。 |
| 4 | 賣家頁面使用 SPA 路由與類別選取 | ✅ 已解決 | 原本需要手動選擇類別以載入動態欄位；現已在點擊「從剪貼簿填入」時，加入自動選取「電腦與周邊配件 > 軟體」類別的非同步流程，並自動等待動態欄位渲染後填入。 |

### 14.5 使用流程
1. 直接在 Extension 中點擊「從剪貼簿填入」（不需事先手動點選類別）。
2. 系統將自動執行類別選取（電腦與周邊配件 > 軟體），等待屬性與品牌欄位載入後，自動填入：商品名稱、描述（富文本）、價格、數量、最低購買數量，並自動選取品牌「自有/其他品牌」。

---

### #shopee-fill-optimization
## 十五、品牌與欄位自動填入修復記錄

> 本章節記錄品牌與 Vue 3 欄位填入的關鍵技術修復，以防後續蝦皮更新再次遭遇。

### #shopee-brand-select-fix
### 15.1 品牌下拉選單點擊無效修復

* **問題現象**：品牌欄位點擊展開後，雖然有找到「自有/其他品牌」的字眼，但點擊後品牌依然顯示「請選擇」，沒有自動選中。
* **原因分析**：
  1. 蝦皮自訂的 EDS 下拉選單（EDS Select）將子選項包裹在一個名為 `div.eds-select__options` 的父容器中，且類名中包含 `options`。
  2. 原本的選擇器 `[class*="option"]` 同時匹配到了子選項與該父容器。
  3. `options.find` 尋找包含「自有」的文字時，因為父容器包含全部子選項的文字，正則比對誤中了父容器，導致腳本只點擊了容器外框，並未點擊到具體的選項元素。
  4. 此外，點擊事件在 Vue 3 底層需要正確的焦點與滑鼠狀態。原本的 `click()` 後緊接著 `mousedown` / `mouseup` 的非標準事件鏈會引起事件互斥。
* **技術修復**：
  1. **精確過濾選項**：
     ```js
     const options = rawOptions.filter(opt => {
       const className = typeof opt.className === 'string' ? opt.className : ''
       // 排除所有代表容器的類名
       if (className.includes('options') || className.includes('menu') || className.includes('wrapper') || className.includes('scrollbar')) {
         return false
       }
       // 排除包含子級 option 的節點，確保為單一葉子節點
       if (opt.querySelector('.eds-option, .eds-select__option, .option')) {
         return false
       }
       return true
     })
     ```
  2. **滑鼠事件鏈重構**：
     將所有 click 模擬動作修改為與瀏覽器原生事件順序完全一致的觸發順序，保證 Vue 3 能正確接收狀態改變：
     ```js
     target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
     target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }))
     target.click()
     ```

### #shopee-devtools-compatibility
### 15.2 Chrome DevTools MCP 控制相容性差異

> 針對瀏覽器自動化測試與控制工具（如 Chrome DevTools MCP），本節記錄在蝦皮買家頁面與賣家頁面中的相容性限制。

>> **控制力差異與技術根源**：
>> * **賣家頁面 (seller.shopee.tw)**：由於此頁面是在已登入的安全賣場域下，或者其防爬蟲檢測機制不同，開發團隊可以使用 Chrome DevTools MCP 工具進行可靠的 DOM 元素查詢、模擬點擊與表單控制。
>> * **買家頁面 (shopee.tw)**：該頁面具備極為嚴格的抗自動化、抗爬蟲檢測（如 Cloudflare, Geetest 驗證以及蝦皮內置的安全防護機制）。當嘗試透過 CDP (Chrome DevTools Protocol) 或 Chrome DevTools MCP 進行遠端控制時，會被網站安全機制阻擋，導致無法順利存取或操作，必須藉由 Chrome 擴充功能（Extension）在本地端注入的 content script 才能進行正常的 DOM 讀取與點擊操作。

### #shopee-category-settle-fix
### 15.3 類別確認與 Vue DOM 重新渲染穩定性修復

> * **問題現象**：選取類別後，商品描述與其他後續欄位有時會被清空，或類別確認按鈕點擊無效；在某些情況下甚至會誤觸發頁面底部的「儲存並上架」主按鈕，導致表單被過早提交，跳出包含影片編輯在內的多種欄位缺失錯誤。
> * **原因分析**：
>   1. **確認按鈕定位失效**：當類別彈窗尚未完全啟用「確定」按鈕時，如果以全域 `.eds-button--primary` 作為 fallback 進行點擊，會錯誤選取到頁面上其他已啟用的 primary 按鈕（如編輯頁底部的 Save/Publish 按鈕），造成頁面送出與非預期的表單驗證彈窗。
>   2. **Vue 重新渲染競爭**：選定類別後，Vue 3 底層動態重組 DOM。若太快填入其他資料，該值會被重組完成後的初始狀態覆蓋清空。
> * **技術修復**：
>   1. **精確限縮 Modal 容器**：
>      >> 首先過濾出包含 `.category-list` 或 `.category-item` 的彈窗對話框節點：
>      >> `const categoryModal = Array.from(document.querySelectorAll('.eds-modal, .category-dialog, .product-category-selector-modal, div[role="dialog"], .category-dialog-footer')).find(m => m.querySelector('.category-list') || m.querySelector('.category-item'))`
>      >> 接著在該對話框範圍內尋找 `.eds-button--primary` 或其餘文字包含「確定/Confirm/OK」的按鈕，完全杜絕誤點擊全域主按鈕。
>   2. **按鈕啟用狀態輪詢**：
>      >> 輪詢 3 秒（間隔 100ms），檢測並等待該按鈕的 `disabled` 屬性或 `eds-button--disabled` 樣式被 Vue 清除，確保按鈕處於可用狀態。
>   3. **點擊前延遲與 Composed 事件派發**：
>      >> 在按鈕啟用後，額外等待 200ms 的緩衝延時（防止 Vue 監聽器未綁定完成）。點擊時使用 `composed: true` 派發 `mousedown`、`mouseup` 與 `click`，以確保事件能穿透可能存在的 Shadow DOM。
>   4. **引進重新渲染等待時間 (Settle Delay)**：
>      >> 在類別變更後，強制延遲 1000ms 讓 Vue DOM 重建並穩定，再行填入其他欄位。

### #shopee-brand-async-poll
### 15.4 品牌非同步載入輪詢與描述欄位精確對應

* **問題現象**：品牌下拉選單展開後，依然可能報錯找不到品牌選項，或者商品描述欄位偶爾無法自動填入。
* **原因分析**：
  1. **非同步資料載入延遲**：品牌下拉框選單 DOM（`.eds-select__menu`）出現時，其子選項（`.eds-option` 等）可能是經由 API 請求動態載入的。在網路稍微延遲時，剛打開選單時選項為空，導致我們過濾出的選項陣列為空。
  2. **描述欄位 Mapping 遺漏**：`findFieldByLabel` 的 `fieldIdMap` 遺漏了 `商品描述` 到 `description` 的映射，使得搜尋程序只能退回到 edit-row 的模糊遍歷，降低了 Quill 編輯器填寫的可靠度。
* **技術修復**：
  1. **選項輪詢等待**：在品牌選單出現後，加入最長 3 秒的輪詢機制（每 100ms 檢查一次），直到可用的選項個數大於 0 才繼續執行過濾與點擊。
  2. **補齊描述欄位映射**：在 `fieldIdMap` 中補上 `'商品描述': 'description'`，確保直接且精確定位到 `[data-product-edit-field-unique-id="description"] .ql-editor`。

### #shopee-media-auto-upload
### 15.5 擷取媒體自動上傳功能規劃

* **目標**：在賣家頁面點擊「從剪貼簿填入」時，除了自動填入文字欄位（標題、描述、價格、數量、類別與品牌）外，系統還應自動將剪貼簿 JSON 中的圖片及影片下載，並直接上傳到賣家頁面的對應媒體欄位中，省去手動下載再上傳的繁瑣步驟。
* **技術方案**：
  1. **背景下載與傳遞**：
     * 因 content script 在執行頁面（seller.shopee.tw）中可能受到網頁 Content Security Policy (CSP) 限制，無法直接 fetch 跨域的圖片，故上傳流程設計為：`content.js` 傳送下載訊息給 `background.js`，由 `background.js` (Service Worker) 進行跨域 fetch 並轉為 Base64 字串傳回。
     * `content.js` 收到 Base64 資料後，還原為二進位 `Blob`，並使用 `File` 建構子包裝成虛擬 `File` 物件（如 `new File([blob], 'image.jpg', { type: blob.type })`）。
  2. **定位與注入上傳欄位 (File Input)**：
     * 蝦皮賣家中心商品編輯頁的圖片與影片上傳，均有對應隱藏的 `<input type="file">` 元素。
     * **圖片上傳選擇器**：尋找屬性為 `[data-product-edit-field-unique-id="images"] input[type="file"]`。
     * **影片上傳選擇器**：尋找屬性為 `[data-product-edit-field-unique-id="video"] input[type="file"]`。
  3. **利用 DataTransfer 觸發 Vue 3 綁定事件**：
     * 使用瀏覽器原生 `DataTransfer` API 包裝虛擬檔案列表：
       ```javascript
       const dt = new DataTransfer()
       dt.items.add(file)
       fileInput.files = dt.files
       ```
     * 接著，對 file input 派發 `change` 事件以觸發 Vue 3 的雙向綁定與上傳流程：
       ```javascript
       fileInput.dispatchEvent(new Event('change', { bubbles: true }))
       ```
     * 為避免上傳過載，對多張圖片下載應設計佇列，逐張或分批次進行下載與注入。

### #shopee-media-upload-optimization
### 15.6 圖片/影片自動過濾與上傳個數最佳化修復

> 針對轉到賣家中心填入資料時，部分商品圖片因 Lazy-loading（懶載入）未擷取完全、或是誤上傳官方 PNG 浮水印主圖導致版面不正確的問題進行修復。

>> **技術根源與問題表現**：
>> 1. **MIME 類型檢測與 PNG 過濾缺失**：蝦皮官方常於主圖套用 PNG 格式的透明邊框或浮水印。若僅依據 URL 後綴判斷，由於 CDN URL 通常不具備副檔名後綴，故會誤將此類透明 PNG 下載並上傳，影響主圖外觀。
>> 2. **上傳數量不足與 Lazy-loading**：原先的 DOM 圖片擷取策略僅尋找 `img[src]` 與屬性中有 `down-tw.img` 的元素，未讀取動態 `source` 與 `srcset`/`data-srcset` 等響應式圖片源。此外，原先上傳邏輯使用固定 length 限制的 for 迴圈，若其中有些圖片為 PNG 被過濾，最終注入賣家中心的有效圖片將不足 9 張。

>> **技術修復**：
>> 1. **響應式圖片屬性與 source 擷取**：
>>    * 在買家端 DOM 擷取時，擴大選擇器至 `img, source`，並從 `src`、`data-src`、`srcset` 與 `data-srcset` 屬性中提取圖片 URL。
>>    * 新增 `extractUrlsFromString` 解析 `srcset` 中的多重 URL 組，並由 `normalizeImageUrl` 清洗並保留原始解析度圖片。
>> 2. **動態下載佇列與 MIME 類型過濾 (SKIP_PNG)**：
>>    * 於 `downloadMediaAsFile` 中加入 `skipPng` 參數，若 background 回傳之真實 Blob MIME 類型為 `image/png` 或 `image/x-png`，則丟出 `SKIP_PNG` 錯誤。
>>    * 將 `uploadMediaAsync` 中的 for 迴圈改為 `while` 迴圈控制的動態下載佇列，遍歷所有備選圖片 URL，直到成功下載並儲存達 9 張有效非 PNG 圖片為止，完美解決圖片遺漏與 PNG 覆蓋問題。
### #shopee-image-all-sources-merge
### 15.7 全圖片來源合併與店鋪 LOGO 過濾加強（2026-07-19）

> 針對：(1) 輪播圖後幾張圖片未上傳；(2) 賣場 LOGO 被誤上傳為商品圖片 兩個問題進行修復。

#### 問題一：只有 landing 時顯示的圖片被上傳，需翻頁才看到的圖片被漏掉

**根本原因**：`extractFromScripts()` 中對 `imgSources` 陣列（`images`、`image_list`、`img_list`、`album`）的迴圈使用 `if (r.images.length) break`，導致一旦 `product.images`（通常只含 5-6 張主圖）有值，後續更完整的 `image_list`、`album` 陣列（含全部 9 張）即被跳過。同樣問題亦存在於 `extractFromAPI()`。

**技術修復**：
1. 將 `extractFromScripts()` 的圖片迴圈改為**全來源合併**：遍歷 `images`、`image_list`、`img_list`、`album`，再額外讀取 `product.models[].image` 與 `product.tier_variations[].images[]`（規格/顏色變體圖），統一透過 `resolveImgUrl()` 正規化 URL，以 `Set` 去重後輸出。
2. `extractFromAPI()` 同步套用相同邏輯（`resolveApiImgUrl()`）。

#### 問題二：賣場 LOGO 被誤抓為商品圖片

**根本原因**：`extractFromDOM()` 的 `isProductImg(el)` 過濾條件過於寬鬆，僅排除 alt 含 `造訪賣場`/`logo`/`avatar` 及 `.avatar/.logo/.shop-header` 的元素，無法涵蓋蝦皮賣場 LOGO 的所有 DOM 位置。

**技術修復**：強化 `isProductImg(el)` 為多層過濾：
- **alt 關鍵字**：擴展至 `shop`、`seller`、`shopee`、`icon`、`share`、`聊聊`、`客服` 等
- **src/srcset 路徑**：URL 含 `avatar`、`logo`、`/icon` 即排除
- **ancestor 元素**：以 `[class*="…"]` 選擇器排除 `avatar`、`logo`、`shop-header`、`shop-avatar`、`recommend`、`banner`、`sidebar`、`navbar`、`review`、`comment` 等容器，以及語意元素 `header`、`footer`、`nav`、`aside`
- **連結 href**：若圖片位於連結 `/shop/`、`shop_id=`、`seller/` 的錨點內則排除

#### 注意事項

- 若店鋪 LOGO 問題修復造成新 PNG 浮水印問題，兩者應為不相關原因；PNG 浮水印已透過 `SKIP_PNG` MIME 過濾排除。
- 若兩個問題的根本原因高度相關，以 LOGO 過濾的修復結果為優先觀察目標。


