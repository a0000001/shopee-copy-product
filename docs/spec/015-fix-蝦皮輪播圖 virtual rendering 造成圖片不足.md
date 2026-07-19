---
type: fix
status: draft
updated: 2026-07-19
domain: shopee
tags: [shopee, chrome-extension, shopee-get-content, carousel, virtual-rendering]
---

# Fix：蝦皮輪播圖 Virtual Rendering 造成圖片不足

> 根因診斷與修正方案

---

## 一、問題摘要

蝦皮商品頁 popup 擷取圖片只顯示 5 張，但該商品實際上傳了 9 張。之前歸因於 `__INITIAL_STATE__` 消失，但 DOM 擷取仍不足。

---

## 二、根因（已實驗驗證）

### 2.1 診斷方法

在 `__remo__/` 建立三支診斷腳本，逐步排除假設：

| 腳本 | 假設 | 結果 |
|---|---|---|
| `_001_diagnostic_dom_timing.js` | DOM 還沒載完 | ❌ 等 8 秒也沒增加 |
| `_002_diagnostic_dom_click.js` | 輪播需 scroll 觸發 | ⚠️ 右箭頭無效，點縮圖有效 |
| `_000_PROVEN_rootcause_carousel_virtual_rendering.js` | Virtual rendering | ✅ 點縮圖後 5→9 |

### 2.2 實驗數據

```
Phase 1 (immediate):     5 thumbs
Phase 2 (click arrow):   5 thumbs  ← 右箭頭無效
Phase 3 (click thumbs):  9 thumbs  ← 點縮圖後完整載入
Phase 4 (scroll ×5):     9 thumbs
```

`.mdCA_C` 容器從 **5 個暴增到 14 個**（含主圖區、popup）。

### 2.3 根因結論

蝦皮商品頁 carousel 使用 **virtual rendering**：
- 初始只 render **可見區域的 5 個縮圖**
- 其餘縮圖的 DOM 節點**根本不存在**
- **點擊任一現有縮圖** → 觸發 React state 更新 → 完整圖集（9 張）render 到 DOM
- 右箭頭僅改變 scroll 位置，不觸發完整渲染

這不是 timing 問題（等多久都沒用），不是 scroll 問題，是 React 渲染策略問題。

---

## 三、修正方案

### 3.1 核心邏輯

在 `extractFromDOM()` 執行前，先程式化點擊縮圖列的一個節點，觸發 React 渲染完整圖集。

**選擇器策略（Layered Selector）**：
1. 優先使用 `.o_Jpw2` 縮圖列容器（特定 container class，需 inspect 驗證）
2. 找不到才退回防禦性寫法：全文件搜尋 `.mdCA_C`，過濾掉在 dialog/popup 內的，且要求同一父層有 3+ 個兄弟節點

**等待策略（rAF-first）**：
1. 先等 2 個 `requestAnimationFrame`（同步渲染幾乎不花時間）
2. 檢查 `.mdCA_C` 數量是否已達 9
3. 不構才補 `setTimeout(500)` 安全網

關鍵程式碼路徑：`S:\projects\shopee\__remo__\shopee-get-content\content.js`

```javascript
function triggerCarouselFullRender() {
  const all = Array.from(document.querySelectorAll('.mdCA_C'))
  // Strategy 1: .o_Jpw2 container (CSS Modules hash for thumbnail strip)
  let target = null
  const strip = document.querySelector('.o_Jpw2')
  if (strip) {
    target = strip.querySelector('.mdCA_C')
  }
  // Strategy 2: first .mdCA_C outside dialog/popup
    if (!target) {
      const safe = all.filter(el => !el.closest('[role="dialog"], [class*="odal"], [class*="opup"]'))
      target = safe[1] || safe[0]  // 避開第一個避免觸發 video
    }
    if (!target) return false
    target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }))
    target.click()
    return true
}

async function waitForCarouselStable(target = 9) {
  await new Promise(r => requestAnimationFrame(r))
  await new Promise(r => requestAnimationFrame(r))
  if (document.querySelectorAll('.mdCA_C').length >= target) return
  await new Promise(r => setTimeout(r, 500))
}
```

### 3.2 修改位置

修改 `extractProductData()`（content.js:434）在呼叫 `extractFromDOM()` 之前插入觸發邏輯，且 gating 在 seller 頁面不執行：

```javascript
async function extractProductData() {
  if (!isProductPage()) return { error: '不在商品頁面上' }

  const ids = extractItemShopIds()
  let data = extractFromScripts()      // 已失效（__INITIAL_STATE__ 不存在）
  if (!data) data = extractFromJSONLD()
  if (!data) data = extractFromMeta()

  let apiData = null
  if (ids) {
    apiData = await extractFromAPI(ids.shopid, ids.itemid)
  }

  // ── 觸發 carousel 完整渲染（僅 shopee.tw 商品頁） ──
  if (!isSellerEditPage()) {
    triggerCarouselFullRender()
    await waitForCarouselStable()
  }

  const domData = extractFromDOM()
  // ... 後續合併邏輯不變
}
```

### 3.3 Auto-trigger on landing

除了在 `extractProductData()` 內觸發（點 icon 時），也在 content script 初始化時自動觸發一次（fire-and-forget），讓 carousel 渲染在 landing 時就完成，使用者第一次點 icon 即取得完整圖片。

```javascript
if (isProductPage() && !isSellerEditPage()) {
  setTimeout(() => {
    triggerCarouselFullRender()
  }, 0)
}
```

`extractProductData()` 內仍保留觸發作為 safety net，確保即使 landing 時 auto-trigger 沒成功，點 icon 時仍會觸發。

**已決定的問題**（原「不確定」經 CLAUDE review 後定案）：
- **等待策略**：不用固定 setTimeout，改為「2× rAF → 檢查是否到 9 → 不構才補 500ms」，兼顧速度與可靠度。
- **選擇器範圍**：不全域掃 `.mdCA_C`，優先鎖定 `.o_Jpw2` 縮圖列容器，找不到才退回防禦性寫法（過濾 popup + siblings ≥ 3）。
- **點擊次數**：只點 1 個縮圖即可（virtual rendering 元件本身邏輯是點任一縮圖觸發完整渲染）。
- **額外網路請求**：觸發渲染後原本不存在的 `<img>` 節點會出現並 lazy load，這是預期行為，`waitForCarouselStable` 的設計也涵蓋這段時間。
- **`.mdCA_C` 未來改版失效**：Task 4 已記錄這個風險及穩定特徵，Task 1 的 layered selector 也設計了兩個防線。

---

## 四、診斷工具（保留供日後驗證）

| 檔案 | 用途 |
|---|---|
| `S:\projects\shopee\__remo__\_000_PROVEN_rootcause_carousel_virtual_rendering.js` | 根因驗證腳本（標明不可刪） |
| `S:\projects\shopee\__remo__\_001_diagnostic_dom_timing.js` | DOM timing 排除 |
| `S:\projects\shopee\__remo__\_002_diagnostic_dom_click.js` | 輪播互動探索 |
| `S:\projects\shopee\__remo__\README.md` | 診斷歷程總覽 |

---

## 五、Tasks

### Task 1：實作修正

- 在 content.js 新增 `triggerCarouselFullRender()`（layered selector：`.o_Jpw2` 優先 → 退防 siblings + popup 排除）
- 在 content.js 新增 `waitForCarouselStable()`（2× rAF → 檢查 → 500ms fallback）
- 在 `extractProductData()` 中 `extractFromDOM()` 前呼叫，並 gate 在 `!isSellerEditPage()`
- 對應程式碼：CLAUDE review 後定案的兩段函數 + 修改 extractProductData

### Task 2：Smoke Test

在真實蝦皮商品頁手動驗證：

1. 打開一個有 ≥9 張圖的蝦皮商品頁
2. 點 extension icon → popup 顯示 **9 張以上圖片**
3. 點「下載圖片+影片」→ 下載 9 個圖片檔案
4. 打開一個只有 3 張圖的商品頁 → popup 顯示 3 張（無副作用）
5. 打開非商品頁（首頁/賣場頁）→ 顯示「不在商品頁面上」

測試商品頁範例：
- `https://shopee.tw/product/987022693/52564235595/`（已確認為 9 張）

### Task 3：回歸 Seller 頁面

確認賣家編輯頁（seller.shopee.tw）的填入功能不受影響——`triggerCarouselFullRender` 不該在 seller 頁面執行。

### Task 4：監控 class name 變更

蝦皮 CSS Modules 的 class name（`.mdCA_C`）可能隨改版變更。記錄目前觀察到的穩定特徵：
- 縮圖容器：`.mdCA_C.uRJsr5`（兩個 class 並存）
- 內部結構：`<picture> → <source srcset> + <img src>`
- 圖片網域：`down-tw.img.susercontent.com`

若未來 carousel 改版導致 `.mdCA_C` 選擇器失效，應先更新 class name。

---

## 六、已嘗試但失敗的方向

記錄以下方法皆無法關閉點擊縮圖後跳出的 fullscreen popup，未來遇到類似問題不應重試：

### 6.1 MouseEvent 只 dispatch mousedown（不 mouseup / click）

**假設**：React virtual rendering 綁在 `onMouseDown`，popup 綁在 `onClick`，拆開可只觸發 render。

**結果**：渲染也失敗（圖片回到 5/7 張）。popup 確實沒出現，但完整圖片也沒 render。確認 `click` event 是 React carousel 觸發完整渲染的必要條件。

### 6.2 popup 出現後程式化 dispatch Escape（硬等 50ms）

**假設**：點擊後 50ms popup 已在 DOM，dispatch Escape 可關閉。

**結果**：50ms 太早，popup DOM node 可能剛插入但 React 尚未 attach keydown listener。

### 6.3 MutationObserver 偵測 popup → rAF → focus → Escape

**假設**：等 React commit phase 完成再 dispatch Escape，確保 listener 就緒。

**結果**：仍無法關閉。推測 Shopee popup 的 keydown handler 綁在 `window` 而非 popup element，或使用了 `e.stopPropagation()` 擋掉程式化事件。聚焦問題也無法透過 `popup.focus()` 解決。

**結論**：此路不通。跳出的 fullscreen popup 是 `click()` 的副作用，無法在 content script 內可靠關閉。改為接受 popup 存在（使用者介面上可見），但功能不受影響。

---

## 附錄：參考資料

- Spec 文件：`S:\projects\shopee\docs\spec\014-spec-擴充功能-chrome extension-shopee-get-content.md`
- 診斷歷程：`S:\projects\shopee\__remo__\README.md`
- 根因驗證腳本：`S:\projects\shopee\__remo__\_000_PROVEN_rootcause_carousel_virtual_rendering.js`
