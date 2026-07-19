---
type: fix
status: draft
updated: 2026-07-19
domain: shopee
tags: [shopee, chrome-extension, shopee-get-content, png, dedup, image-filter]
---

# Fix：商品圖片 PNG 過濾漏洞與重複來源修補

> 根因診斷與修正方案

---

## 一、問題摘要

### 1.1 使用者回報

1. **「之前成功去掉的 PNG 又出現了」** — LOGO 那張 PNG 圖片在下載結果中再次出現
2. **「部分圖似乎有重複」** — 下載的圖片集合中有重複的檔案

### 1.2 已知背景

先前已實作 `/\.png/i` URL 過濾 (`content.js:512`) 與 `skipPng` 下載層防禦。但使用者回報問題仍然存在，表示防禦機制有漏洞。

---

## 二、根因（已實驗驗證）

### 2.1 診斷方法

透過 Chrome DevTools Protocol 對買家頁 (`shopee.tw/product/…`) 與賣家頁 (`seller.shopee.tw`) 進行完整圖片審計：
- **資料夾**：`docs/data/mcp devtools 蒐集的蝦皮資料/`
- **原始數據**：
  - `15-png-dup-analysis.md` — 賣家頁面 56 張圖片的 `isProductImg` 審計、重複 file ID、PNG URL
  - `16-buyer-page-inspection.md` — 買家頁面 30 張 `img[src*=file]` DOM 結構

### 2.2 根因一：`/\.png/i` URL 正則對 CDN 圖永遠不命中

蝦皮所有商品圖的 CDN URL 格式：

```
https://down-tw.img.susercontent.com/file/tw-11134207-820l6-mqst930825fmf1
```

**完全沒有副檔名**。`/\.png/i` 正則只比對 `.png` 字面是否存在於 URL 字串中，對這些 extensionless URL **永遠回傳 false**。

兩頁面掃描結果：唯一含有 `.png` 的 URL 是星星評分圖示 (`shoprating/3215f6ba1a0e877fa06e.png`)，已被 `isProductImg()` 正確過濾。

### 2.3 根因二：`_tn` 結尾的 URL 不在最終 filter 中

`_tn`（thumbnail variant）圖片：

```
tw-11134216-820l7-mqor51b0nf2m61_tn
```

當前最終 filter (`content.js:509-513`) 只檢查：
- `.svg` ✅
- `.png` ✅（對 CDN URL 無效）
- `_cover` ✅

**不檢查 `_tn`**。雖然 `extractFromDOM()` 的 `isProductImg()` 會透過 `badContainer`（class=shopee-avatar）排除 `_tn`，但若 `_tn` 經由 script/API 路徑進入 `data.images`（這些路徑不呼叫 `isProductImg()`），就會繞過過濾。

### 2.4 根因三：Script/API 路徑無 `isProductImg()` 過濾

`extractProductData()` 的圖片合併流程：

```
extractFromScripts() → data.images  (無過濾, line 479)
extractFromJSONLD()  → data.images  (無過濾, line 480)
extractFromMeta()    → data.images  (無過濾, line 481)
合併 apiData.images  → data.images  (無過濾, line 489)
extractFromDOM()     → domData.images  (有 isProductImg 過濾, line 499)
合併 domData.images  → data.images  (line 505)
最終 filter (.svg/.png/_cover)  → data.images  (line 509-513)
```

DOM 路徑有 `isProductImg()`，但 script/API/meta 路徑**完全沒有**。非商品圖片若從 script/API 進入，在最終 filter 只檢查 `.svg`、`.png`、`_cover`，**不檢查 `_tn`、`logo`、`avatar` 等特徵**。

### 2.5 重複原因：跨來源 merge + 相同 file ID 在不同元素類型

CDP 掃描確認每頁只有 **1 組**重複 file ID：

| 頁面 | 重複 file ID | 原因 |
|------|-------------|------|
| seller | `820lg-mqst92zx68zle8` | 同一檔案在 `<img>` 和 `<source>` 各出現一次 |
| buyer | `820l6-mqst930825fmf1` | 同一檔案在主圖區和縮圖區各出現一次 |

`extractFromDOM()` 的 `seen` Set 已正確去重。JSON-LD 也只提供 1 張圖（第一張），`dedupe()` 在 `Set` 層會消除重複。

目前的跨來源 merge (`content.js:505`) 沒有中間的 `isProductImg()` 或 `_tn` 過濾，若 script/API 資料包含非商品圖，會繞過 DOM 層的過濾直接進入 `data.images`。加上最終 filter 不檢查 `_tn`/`_cover` 以外的非商品特徵，這是漏網的主因。

---

## 三、修正方案

### 3.1 強化最終 filter：加入 `_tn` 排除

**檔案**：`content.js:509-513`

```javascript
data.images = dedupe(data.images).filter(u => {
  if (!u) return false
  const lower = u.toLowerCase()
  return !lower.endsWith('.svg') && !/\.png/i.test(u) && !lower.includes('_tn') && !lower.includes('_cover')
})
```

**影響**：封堵所有含 `_tn` 的 URL（賣場頭像縮圖變體）。成本極低，防禦多一層。

### 3.2 強化 skipPng 下載層：加入 magic number sniffing

**檔案**：`content.js:924-956`

目前 `skipPng` 只依賴 `Content-Type` header：

```javascript
if (skipPng && (type === 'image/png' || type === 'image/x-png')) {
  reject(new Error('SKIP_PNG'))
  return
}
```

若 CDN 對 PNG 格式回傳錯誤的 Content-Type（如 `application/octet-stream` 或 `image/webp`），此檢查會失效。

**改進**：在 Content-Type 檢查之後，加入 magic number sniffing，讀取 blob 前 4 bytes 檢查是否為 PNG 魔數（`\x89PNG`）：

```javascript
// 先檢查 Content-Type
if (skipPng && (type === 'image/png' || type === 'image/x-png')) {
  reject(new Error('SKIP_PNG'))
  return
}
// 再檢查 PNG magic number（攔截 Content-Type 誤判的情況）
if (skipPng) {
  const pngMagic = [0x89, 0x50, 0x4E, 0x47]  // \x89PNG
  if (bytes.length >= 4 && pngMagic.every((b, i) => bytes[i] === b)) {
    reject(new Error('SKIP_PNG'))
    return
  }
}
```

### 3.3 同步強化 `isProductImg()` 的 `_tn` 過濾

**檔案**：`content.js:211`

在 badSrc 檢查中加入 `_tn`：

```javascript
for (const attr of ['src', 'srcset', 'data-src', 'data-srcset']) {
  const val = (el.getAttribute(attr) || '').toLowerCase()
  if (val.includes('_tn') || val.includes('avatar') || val.includes('logo') || val.includes('/icon')) return false
}
```

---

## 四、Tasks

### Task 1：實作最終 filter 加入 `_tn` ✅

- [x] `content.js:512`：`!u.includes('_cover')` → `!lower.includes('_tn') && !lower.includes('_cover')`

### Task 2：加入 PNG magic number sniffing ✅

- [x] `content.js:942-948`：在 `bytes` 陣列填入完成後（line 947 之後）、`Blob` 建立前（line 948 之前），插入魔數檢查
  - `bytes` 來源：`atob()` → `charCodeAt` loop（lines 942-947），line 947 時已完全填入
  - 不需額外 `arrayBuffer()`，`bytes` 已是 `Uint8Array`
  - 魔數：`[0x89, 0x50, 0x4E, 0x47]`（`\x89PNG`），bytes length ≥ 4 時可比對前 4 碼

### Task 3：同步更新 `isProductImg()` 的 `_tn` 檢查 ✅

- [x] `content.js:211`：在 badSrc 檢查加入 `val.includes('_tn')`

### Task 4：繞過 `i9ihcI` 容器（防止非 `_tn` 頭像漏網）✅

- [x] `content.js:297`：general loop 開頭加入 `el.closest('[class*="i9ihcI"]')` 提早 return
  - 根因：賣場頭像在買家頁出現兩次——`_tn` 版（shopee-avatar container，被 `isProductImg` 抓到）＋無 `_tn` 版（80×80 在 i9ihcI 內，`isProductImg` 理論上該用 badAlt 抓到但實際環境繞過）
  - 安全：`i9ihcI` 內的商品圖（450×450 主圖、82×82 縮圖）已分別從 JSON-LD / API 及 `mdCA_C` gallery loop 取得，跳過 i9ihcI 不會丟失任何商品圖

### Task 6：Collection-time PNG 魔數檢查 ✅

- [x] `content.js:515-526`：`extractProductData()` 中，URL 字串 filter 完成後，以 `Promise.all` 並行送出 `chrome.runtime.sendMessage({ action: 'checkPngMagic' })` 給 background.js
- [x] `background.js:52-56, 167-173`：新增 `checkPngMagic` 訊息處理器，用 `Range: bytes=0-3` 輕量 fetch 前 4 bytes，比對 `\x89PNG` 魔數回傳結果
  - 必要性：CDN URL 無副檔名 → URL 字串 filter 無法辨識 PNG
  - 下載層的魔數檢查（Task 2）只作用於實際下載，不影響彈窗顯示
  - Task 6 在資料收集當下就過濾 PNG，讓彈窗與下載同時正確

### Task 7：Smoke Test

在真實蝦皮商品頁驗證：

1. 開啟一個有賣場 LOGO/頭像的商品頁
2. 點 extension icon → popup 顯示 N 張圖片（不包含 `_tn` 圖）
3. 點「下載圖片+影片」→ 下載的檔案中無 PNG 格式
4. 開啟一個有 9 張圖的商品頁 → 下載 9 個不同圖片檔案（無重複）
5. 找一張**確定是 WebP 或 JPEG**（非 PNG）的商品圖跑一次下載，確認 magic number 檢查不會誤判成 PNG 而錯殺

### Task 5：回歸 Seller 頁面

確認賣家編輯頁填入功能不受影響。

---

## 五、風險與注意事項

1. **`triggerCarouselFullRender()` 對少圖商品無害** — 對於只有 5 張圖的商品，所有縮圖已在 DOM，`waitForCarouselStable(9)` 檢查 `.mdCA_C ≥ 9` 不成立，500ms timeout fallback 後結束。無任何點擊副作用。
2. **Class hash 跨頁面不一致** — `016-fix` 不依賴特定 hash class，不受影響
3. **PNG magic number sniffing** 會增加少量處理時間（讀取前 4 bytes），但非同步進行，對 UX 無影響
4. **優先級**：Task 1 最簡單且風險最低，應優先實作。Task 2（magic number sniffing）需改動 download layer，排在第二位。

---

## 附錄：參考資料

- Spec 文件：`docs/spec/014-spec-擴充功能-chrome extension-shopee-get-content.md`
- Carousel fix 文件：`docs/spec/015-fix-蝦皮輪播圖 virtual rendering 造成圖片不足.md`
- 原始數據（PNG / 重複 / 審計）：`docs/data/mcp devtools 蒐集的蝦皮資料/15-png-dup-analysis.md`
- 原始數據（買家頁 DOM）：`docs/data/mcp devtools 蒐集的蝦皮資料/16-buyer-page-inspection.md`
- 賣家頁 DOM 分析：`docs/data/mcp devtools 蒐集的蝦皮資料/14-seller-new-product-dom-analysis.md`
