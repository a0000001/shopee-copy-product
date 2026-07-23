# 027 — Plan: 類別選取與 SPA 導航 Context 銷毀修復計畫

> 本文件記錄二刷診斷後的真實根因、修復方案及驗證計畫。
> 已將 Claude Web 的最新審核、程式碼事實校對與**Auto-Resume 導航自動續傳機制 (含 60s 時間預算硬邊界、連續導航上限、URL 權限檢查)** 完整對齊整合。

---

## 一、 黃金對照日誌 (Golden Reference DOM Diagnostic)

在 2026-07-23 測試中，單件測試腳本 `batch-upload-test.js` 23 項 DOM 斷言與媒體/按鈕檢查**全部通過**。以下為實測成功時擷取之賣家中心黃金 DOM 結構映射：

### 1.1 成功測試步驟與時間序列
- **12:56:21** 啟動 `fillProductData` (文字與屬性填寫)
- **12:56:34** `fillProductData` 填寫完成 (耗時約 13 秒)
- **12:56:34** 啟動 `uploadMedia` (圖片與影片上傳)
- **12:56:36** `uploadMedia` 上傳完成 (圖片=6, 影片=1，耗時 2 秒)
- **12:56:36** `checkSaveButton` 檢查回傳：`{"ready":true, "btnText":"儲存並上架", "reason":"OK"}`

### 1.2 驗證成功之 DOM uniqueId 欄位對應表
| 欄位名稱 | UniqueId Selector (`data-product-edit-field-unique-id`) | 成功填入/讀取值 |
|---|---|---|
| 商品名稱 | `name` | `"測試商品專用請勿下單購買（10字以上）"` |
| 商品價格 | `price` | `"1999"` |
| 商品庫存 | `stock` | `"999"` |
| 最低購買數量 | `minpq` | `"1"` |
| 重量 | `weight` | `"0.5"` |
| 尺寸 (長x寬x高) | `brandAndAttributes` | `"10x10x4"` |
| 禁運品 | `dangersGoods` | `"0"` / `"1"` |
| 較長備貨 | `preOrder` | `"false"` |
| 信用卡分期 | `productInstallmentStatus` | `"false"` / `"true"` |

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

### 根因 2 (硬傷)：ID 格式類別 (如 "100644,101937") 匹配機制與對照表

- **原設計漏洞**：
  - 蝦皮賣家中心選單 HTML 節點完全沒有 `data-id` 屬性，直接用數字 ID 搜尋會觸發 Error 中止流程。
- **正解規則**：
  - 引入 `categoryMap` 映射表（`100644,101937` -> `['電腦與周邊配件', '軟體']`）。
  - 當 ID 比對失敗時，顯式拋出 `throw new Error(...)` 錯誤，將狀況紀錄於報告中，不靜默選錯類別。

---

## 三、 擬定修復方案 (Proposed Changes)

### Component 1: `batch-upload.js` Auto-Resume 導航自動續傳 (修復點 A)

#### [MODIFY] [batch-upload.js](file:///S:/projects/shopee-copy-product/extension/batch-upload.js)
- 利用 `chrome.tabs.onUpdated` 監聽指定 `tabId` 的 `status === 'loading'`。
- 當在 `fillProductData` 執行期間（`sawRunning === true`）偵測到導航時：
  1. 累計 `navRetryCount`，若連續導航 > 2 次則主動中止抛錯。
  2. 使用 `OVERALL_DEADLINE_MS = 60000` (60s) 硬邊界控管整體填寫時間。
  3. `await waitForTabReady(tabId)` 等待新 document 的 content script 載入。
  4. 驗證 URL 包含 `/\/portal\/product\/(new|edit)/` 防範登入過期跳轉。
  5. 對新 Content Script 自動發送 `fillProductData` 進行 **Auto-Resume 自動續傳**！

```javascript
// 修改 extension/batch-upload.js fillAndSaveSingle
async function fillAndSaveSingle(item, tabId) {
  const OVERALL_DEADLINE_MS = 60000
  const MAX_NAV_RETRIES = 2
  const startedAt = Date.now()
  let navRetryCount = 0
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
    sawRunning = true

    let fillDone = false
    for (let i = 0; i < 150; i++) {
      const elapsed = Date.now() - startedAt
      if (elapsed > OVERALL_DEADLINE_MS) {
        throw new Error(`文字填寫總耗時超過 ${(elapsed / 1000).toFixed(1)}s，判定異常超時`)
      }
      await sleep(300)

      if (navigationDetected) {
        navRetryCount++
        if (navRetryCount > MAX_NAV_RETRIES) {
          throw new Error(`連續偵測到 ${navRetryCount} 次導航，判定為異常頁面狀態（可能登入過期或環境異常），停止續傳`)
        }
        console.warn(`[SGC] 偵測到真實導航（第 ${navRetryCount} 次），等待新頁面穩定後自動續傳`)
        await waitForTabReady(tabId)
        
        const tabInfo = await chrome.tabs.get(tabId)
        if (!/\/portal\/product\/(new|edit)/.test(tabInfo.url || '')) {
          throw new Error(`導航後分頁不在預期的商品編輯頁（實際: ${tabInfo.url}），可能登入已過期`)
        }

        await sleep(800)
        navigationDetected = false
        sawRunning = false

        const retryStart = await chrome.tabs.sendMessage(tabId, { action: 'fillProductData', data: { ...item, skipMedia: true } })
        if (!retryStart || !retryStart.ok) throw new Error('導航後重新啟動文字填寫失敗')
        sawRunning = true
        continue
      }

      try {
        const st = await chrome.tabs.sendMessage(tabId, { action: 'checkFillStatus' })
        if (st && st.status === 'done') {
          if (st.result && st.result.ok) { fillDone = true; break }
          else throw new Error((st.result && st.result.error) || '文字填寫失敗')
        }
      } catch (e) {
        if (e.message.includes('文字填寫失敗')) throw e
      }
    }
    if (!fillDone) throw new Error(`文字填寫超時 (${((Date.now() - startedAt) / 1000).toFixed(1)}s)`)
  } finally {
    chrome.tabs.onUpdated.removeListener(onUpdated)
  }
}
```

---

### Component 2: `content.js` 類別 ID 對照表與顯式報錯 (修復點 B)

#### [MODIFY] [content.js](file:///S:/projects/shopee-copy-product/extension/content.js)
- 在 `fillCategoryAsync` 中新增 `categoryMap` 對照表，精確將 `100644,101937` 解析為 `['電腦與周邊配件', '軟體']`。

---

### Component 3: `batch-upload.html` 複製診斷紀錄增強 (體驗優化)

#### [MODIFY] [batch-upload.js](file:///S:/projects/shopee-copy-product/extension/batch-upload.js)
- 按下「複製錯誤訊息」時，複製完整時間戳記、統計與 `logContainer` 文字。

---

## 四、 執行任務與驗證計畫 (Tasks & Verification Plan)

### Tasks
- [x] **Task 1**: 更新 `docs/spec/027-plan-類別選取破口與實際上架通訊超時修復分析.md`。
- [ ] **Task 2**: 修改 `batch-upload.js` 套用 Auto-Resume 自動續傳與全域時間邊界機制。
- [ ] **Task 3**: 修改 `content.js` 補強 `categoryMap`。
- [ ] **Task 4**: 執行批次上傳實測並觀察 4 大診斷重點（導航觸發、單筆耗時、連續導航次數、URL 正則放行）。

### Real-world Batch Test Verification
1. 觀察 Log 視窗是否有出現 `[SGC] 偵測到真實導航` 與 Auto-Resume 續傳日誌。
2. 檢查文字填寫完成時顯示之實際秒數。
