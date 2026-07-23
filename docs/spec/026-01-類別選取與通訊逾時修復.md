# 026 — Plan: 類別選取與通訊逾時修復（二修校對版）

> 本文件為 Chrome Extension 批次上傳功能的技術實作計畫，專為直接提供給第三方 LLM（如 Claude Web）進行二刷審核與比對設計。已補充完整 `batch-upload.js` 與 `manifest.json` 現有程式碼。
> 注意：目前上架數量掃描已恢復正常，本計畫**絕對不得修改任何關於 `scanProducts` 爬蟲數量的代碼**。

---

## 一、 專案架構與關鍵檔案清單

| 檔案 | 說明 | 絕對路徑 |
|------|------|----------|
| `content.js` | 注入蝦皮賣家中心頁面的 Content Script，負責 DOM 操作（包含類別彈窗點擊）。 | `file:///S:/projects/shopee-copy-product/extension/content.js` |
| `batch-upload.js` | 批次上傳分頁的主邏輯，負責開啟新分頁並發送訊息。 | `file:///S:/projects/shopee-copy-product/extension/batch-upload.js` |
| `manifest.json` | 擴充功能設定檔，決定 `content_scripts` 注入時機與權限。 | `file:///S:/projects/shopee-copy-product/extension/manifest.json` |

---

## 二、 問題診斷與精確破口分析

### 1. 類別選取卡死（Claude Web 校對與精確定位）
- **原計畫書誤解**：以為「確定」按鈕找不到。
- **校對後事實**：`findCategoryConfirmButton()`（`content.js` 第 902~905 行）內部已使用 `.eds-modal, div[role="dialog"], [class*="modal"]` 等泛用選擇器，其實找得到按鈕。
- **真正破口**：
  1. **第 825 行**：`const modalList = await waitForElement('.category-list, [class*="category-list"], .category-dialog', 3000)` — 初次判斷彈窗是否出現。
  2. **第 939 行**：`const stillOpen = document.querySelector('.category-list, [class*="category-list"]')` — 判斷彈窗是否已關閉。
- **影響機制**：當蝦皮 Modal 外層容器改名時，第 939 行在點擊確定按鈕後的第一次迴圈（250ms）就會因為 `document.querySelector('.category-list...')` 回傳 `null`，而**誤判彈窗「已關閉」並提早 `break` 跳出迴圈**！這導致確定按鈕可能沒點成功，或 Vue 異步狀態未完成即進入後續填寫。

### 2. `Receiving end does not exist` 通訊錯誤
- **現狀問題**：`batch-upload.js` 呼叫 `chrome.tabs.create` 打開新分頁時，分頁狀態在最初瞬間網址為 `chrome://newtab/` 時即評估為 `'complete'`。
- **結果**：`waitForTabReady()` 誤判已載入完成，直接向 `chrome://newtab/` 發送訊息，被 Chrome 安全機制封鎖並拋出 `Receiving end does not exist` 錯誤。

---

## 三、 完整檔案比對與關鍵程式碼修改

### Task 1: `extension/manifest.json` (現有代碼與修改)

**現有代碼 (`file:///S:/projects/shopee-copy-product/extension/manifest.json` L32-L44)**:
```json
  "content_scripts": [
    {
      "matches": [
        "https://shopee.tw/*",
        "https://www.shopee.tw/*",
        "https://seller.shopee.tw/*"
      ],
      "js": [
        "content.js"
      ],
      "run_at": "document_idle"
    }
  ]
```

**擬修改內容**:
將第 42 行 `"run_at": "document_idle"` 改為 `"run_at": "document_end"`，確保 DOM 就緒時即刻注入 Content Script。

---

### Task 2: `extension/batch-upload.js` (現有代碼現狀與說明)

**現行程式碼已經存在的防禦機制 (`file:///S:/projects/shopee-copy-product/extension/batch-upload.js` L19-L52)**:
```javascript
async function waitForTabReady(tabId, timeout = 30000) {
  const startTime = Date.now()

  // 1. 等待頁面基本 status complete
  let isComplete = false
  while (Date.now() - startTime < timeout) {
    try {
      const t = await chrome.tabs.get(tabId)
      if (t && t.status === 'complete') {
        isComplete = true
        break
      }
    } catch { }
    await sleep(200)
  }

  if (!isComplete) throw new Error('分頁載入狀態逾時 (30s)')

  // 2. 主動 Ping Content Script 確保通訊已建立
  while (Date.now() - startTime < timeout) {
    try {
      const res = await chrome.tabs.sendMessage(tabId, { action: 'ping' })
      if (res && res.ok) {
        await sleep(500)
        return true
      }
    } catch (e) {
      // 忽略錯誤，繼續輪詢 (這就是過濾 Receiving end does not exist)
    }
    await sleep(400)
  }

  throw new Error('與蝦皮分頁通訊逾時 (Content Script 未啟動或遭阻擋)')
}
```

**審核結論：不需修改。** Phase 2 的 ping 輪詢已經透過 `try/catch` 直接解決了 `Receiving end does not exist` — 分頁還在 `chrome://newtab/` 時 `sendMessage` 會拋錯，catch 後下個 iteration 重試，直到 Content Script 真正回應為止。這比 URL 字串檢查更強韌，因為它驗證的是「Content Script 確實活著」，而不只是「URL 看起來對」。

---

### Task 3: `extension/content.js` (現有代碼與精確修改)

**現有代碼位置 (`file:///S:/projects/shopee-copy-product/extension/content.js`)**:
- 第 825 行：`const modalList = await waitForElement('.category-list, [class*="category-list"], .category-dialog', 3000)`
- 第 939 行：`const stillOpen = document.querySelector('.category-list, [class*="category-list"]')`

**修改方向**：
擴充 825 與 939 行之選擇器，納入泛用 Modal 容器。但兩行的策略不同：

#### 第 825 行 (`waitForElement` — 等待彈窗出現)
加入 `.eds-modal, [class*="modal"]` 確保即使 `.category-list` 改名仍能抓到彈窗：
```javascript
// L825
const modalList = await waitForElement('.category-list, [class*="category-list"], .category-dialog, .eds-modal, [class*="modal"]', 3000)
```

#### 第 939 行 (`stillOpen` — 點擊確定後判斷彈窗是否已關)
改為檢查 **modal 整體是否仍 visible**，而非僅檢查內層 `.category-list`：
```javascript
// L939
const stillOpen = document.querySelector(
  '.eds-modal:not([style*="display: none"]), ' +
  '[class*="modal"]:not([style*="display: none"]), ' +
  '.category-list, [class*="category-list"]'
)
```
**理由**：點擊「確定」後 Vue 會先移除 `.category-list` 的 DOM 節點，但 modal overlay 可能尚未 hidden。舊程式僅檢查 `.category-list` 導致 `stillOpen = null` → `break` 過早跳出，錯過表單填入。新寫法追蹤 modal 整體狀態，即使 `.category-list` 已消失，只要 `.eds-modal` 還沒 hidden 就繼續等。

---

## 四、 真實 DOM 擷取指引 (DevTools F12 指令)

為避免憑空猜測 class 名稱，若需要確認當前蝦皮類別彈窗的真實 DOM，可在類別彈窗開啟時於 Console 執行：
```javascript
const modal = document.querySelector('.eds-modal, div[role="dialog"], [class*="modal"]')
console.log('彈窗最外層 Class:', modal ? modal.className : '未找到')
console.log('彈窗內 Body Class:', modal ? Array.from(modal.querySelectorAll('div')).map(d => d.className).filter(Boolean) : [])
```

---

## 五、 Tasks 與 Smoke Test

### Task 1: 修正 `manifest.json` 注入時機 → ❌ 保持 `document_idle` 不變

**審核結果：不建議修改。** `waitForTabReady` 已有 ping 輪詢機制處理 `Receiving end does not exist`，`document_end` 反而會在 Vue 掛載前就注入 Content Script，導致 `document.querySelector` 找不到 Vue 渲染元件而逾時。

### Task 2: `batch-upload.js` → ✅ 現有程式碼已解決，不需修改
- Ping 輪詢已在 Phase 2 中透過 `try/catch` 直接過濾 `Receiving end does not exist`，比 URL 字串檢查更強韌。

### Task 3: 修正 `content.js` 類別彈窗判斷破口
- 第 825 行：`waitForElement` 擴充 `.eds-modal, [class*="modal"]`，確保即使 `.category-list` 改名仍能抓到彈窗。
- 第 939 行：`stillOpen` 改為檢查 modal 整體 visibility（含 `:not([style*="display: none"])` 過濾），避免內層 DOM 移除過早 break。

### 🧪 Smoke Test (冒煙測試)
1. 點擊 `batch-upload.html` 的「開始上傳」。
2. 驗證新建立的分頁不會過早引發 `Receiving end does not exist`。
3. 驗證類別彈窗開啟後，正確點擊確定按鈕並等候彈窗真正關閉後，才開始填寫商品描述。
