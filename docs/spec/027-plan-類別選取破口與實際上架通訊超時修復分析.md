# 027 — Plan: 類別選取與 SPA 導航 Context 銷毀修復計畫

> 本文件記錄二刷診斷後的真實根因、修復方案及驗證計畫。
> 已將 Claude Web 的審核與程式碼事實校對完畢並整合入本計畫中。

---

## 一、 專案架構與關鍵檔案清單

| 檔案 | 說明 | 絕對路徑 |
|------|------|----------|
| `content.js` | 注入蝦皮賣家中心頁面的 Content Script，負責 DOM 操作與狀態維護。 | `file:///S:/projects/shopee-copy-product/extension/content.js` |
| `batch-upload.js` | 批次上傳 UI / 分頁控制邏輯，負責 Tab 建立、狀態輪詢與導航監聽。 | `file:///S:/projects/shopee-copy-product/extension/batch-upload.js` |
| `batch-upload.html` | 批次上傳 UI 介面與錯誤 Log 顯示區。 | `file:///S:/projects/shopee-copy-product/extension/batch-upload.html` |
| `product-catalog-tw.json` | 實際商品目錄資料檔（包含多筆商品）。 | `file:///S:/projects/shopee-copy-product/docs/data/product-catalog-tw.json` |

---

## 二、 確切根因與破口分析 (Root Cause Analysis)

### 根因 1 (主因)：`window._sgcFillState` 在 Vue SPA 導航後遺失

- **問題機制**：
  1. `fillProductData` 觸發 `fillAll()` 後，第一步執行 `fillCategoryAsync`。
  2. 蝦皮賣家中心在類別確定後，會發動 SPA 頁面導航（重新載入對應類別的動態屬性表單）。
  3. 頁面導航導致舊 Document 及掛在 Content Script `window` 上的 `_sgcFillState` 變數被銷毀。
  4. 新頁面重新注入新的 Content Script 實例，但新實例的 `window._sgcFillState` 為 `undefined` (`status: 'idle'`)。
  5. `batch-upload.js` 的 `checkFillStatus` 輪詢不斷存取到新實例的回傳 `{ status: 'idle' }`，導致耗滿 45 秒超時。舊頁面的 `fillAll()` 執行鏈已死亡，新頁面無人重新呼叫 `fillAll()`，故後續文字欄位完全空白。

---

### 根因 2 (硬傷)：ID 格式類別 (如 "100644,101937") 無法比對與 Fallback 澄清

- **程式碼事實澄清**：
  - [content.js L893-L903](file:///s:/projects/shopee-copy-product/extension/content.js#L893-L903) 內部的 fallback 邏輯分別為：
    - Col 0：選取包含 `電腦與周邊配件` / `電腦` / `3C` 之選項。
    - Col 1：選取包含 `軟體` / `Software` 之選項。
    - Col 2 以上：若有第 3 層選單才尋找 `其他`。
- **問題**：當 `ps_category` 是 `"100644,101937"` 數字 ID 時，因為不含 `>` 符號，`categoryPath` 變為空陣列，直接走上述 fallback，導致非電腦軟體類商品被選錯類別，致使後續屬性欄位比對失敗。

---

## 三、 擬定修復方案 (Proposed Changes)

### Component 1: `batch-upload.js` 加入 Tab 導航監聽 (修復點 A)

#### [MODIFY] [batch-upload.js](file:///S:/projects/shopee-copy-product/extension/batch-upload.js)
- 利用 `chrome.tabs.onUpdated` 監聽指定 `tabId` 的 `status === 'loading'`。
- 當在 `fillProductData` 執行期間（`sawRunning === true`）偵測到導航時，立即拋出 `偵測到分頁於文字填寫期間發生導航，content script 狀態已遺失`，避免死等 45 秒。

```javascript
// 修改 extension/batch-upload.js fillAndSaveSingle
async function fillAndSaveSingle(item, tabId) {
  let sawRunning = false
  let navigationDetected = false

  const onUpdated = (updatedTabId, info) => {
    if (updatedTabId === tabId && info.status === 'loading' && sawRunning) {
      navigationDetected = true
    }
  }
  chrome.tabs.onUpdated.addListener(onUpdated)

  try {
    const fillStart = await chrome.tabs.sendMessage(tabId, { action: 'fillProductData', data: { ...item, skipMedia: true } })
    if (!fillStart || !fillStart.ok) throw new Error('無法啟動文字填寫')

    let fillDone = false
    for (let i = 0; i < 150; i++) {
      await sleep(300)
      if (navigationDetected) {
        throw new Error('偵測到分頁於文字填寫期間發生導航，content script 狀態已遺失')
      }
      try {
        const st = await chrome.tabs.sendMessage(tabId, { action: 'checkFillStatus' })
        if (st && st.status === 'running') sawRunning = true
        if (st && st.status === 'done') {
          if (st.result && st.result.ok) { fillDone = true; break }
          else throw new Error((st.result && st.result.error) || '文字填寫失敗')
        }
      } catch (e) {
        if (e.message.includes('文字填寫失敗') || e.message.includes('偵測到分頁')) throw e
      }
    }
    if (!fillDone) throw new Error('文字填寫超時 (45s)')
  } finally {
    chrome.tabs.onUpdated.removeListener(onUpdated)
  }
  // 後續邏輯保持不變...
}
```

---

### Component 2: `content.js` 類別 ID 相容處理與選取優化 (修復點 B)

#### [MODIFY] [content.js](file:///S:/projects/shopee-copy-product/extension/content.js)
- 在 `fillCategoryAsync` 解析 `categoryRaw` 時，加入 ID 識別模式。
- 當為純數字/逗號格式時，優先尋找包含對應 `data-id` / `data-category-id` 的 DOM 選項；若 DOM 未暴露 ID 屬性，則安全 fallback 至文字比對。

```javascript
// 修改 extension/content.js fillCategoryAsync (L841+)
let categoryPath = []
const categoryRaw = data.category || data.ps_category || ''
if (categoryRaw && typeof categoryRaw === 'string') {
  if (categoryRaw.includes('>')) {
    categoryPath = categoryRaw.split('>').map(s => s.trim())
  } else if (/^[\d,]+$/.test(categoryRaw.trim())) {
    const ids = categoryRaw.split(',').map(s => s.trim())
    console.log('[SGC] ps_category is ID format, target IDs:', ids)
    categoryPath = { mode: 'id', ids }
  }
}
```

---

### Component 3: `batch-upload.html` 複製診斷紀錄增強 (體驗優化)

#### [MODIFY] [batch-upload.html](file:///S:/projects/shopee-copy-product/extension/batch-upload.html)
- 確保按下「複製錯誤訊息」時，包含時間戳記與詳細錯誤 stack。

---

## 四、 執行任務與驗證計畫 (Tasks & Verification Plan)

### Tasks
- [ ] **Task 1**: 修改 `batch-upload.js` 加入 `chrome.tabs.onUpdated` 導航偵測 (修復點 A)。
- [ ] **Task 2**: 修改 `content.js` 擴充 `fillCategoryAsync` 之 ID 格式類別相容機制 (修復點 B)。
- [ ] **Task 3**: 增強 `batch-upload.html` / `batch-upload.js` 之錯誤複製細節。

### Automated & Manual Verification
- **Smoke Test 1**: 執行 `batch-upload-test.js` 單件測試，確認 23 項斷言仍然全部通過。
- **Smoke Test 2**: 觸發 `batch-upload.js` 批次上傳，驗證若發生導航時能於數百毫秒內捕捉到明確錯誤，且不再耗滿 45 秒。
