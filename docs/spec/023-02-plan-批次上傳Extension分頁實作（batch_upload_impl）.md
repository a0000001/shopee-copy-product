# 023-02 — 批次上傳 Extension 分頁（實作）

> 本文件為實作文件，包含檔案清單、關鍵程式碼與開發 Tasks。
> 流程規劃與設計決策請見 [023-01 規格文件](023-01-plan-批次上傳Extension分頁規格（batch_upload_spec）.md)

## 總覽

在賣家頁面點擊 extension icon 後可開啟獨立分頁 `batch-upload.html`，選取 `product-catalog-tw.json` 後自動逐筆上傳新商品至蝦皮，避免與已上架商品重複。

## 檔案清單

### 新增

| 檔案 | 說明 |
|------|------|
| `S:\projects\shopee-copy-product\extension\batch-upload.html` | 批次上傳分頁 UI |
| `S:\projects\shopee-copy-product\extension\batch-upload.js` | 批次上傳邏輯 |

### 修改

| 檔案 | 變更 |
|------|------|
| `S:\projects\shopee-copy-product\extension\popup.html` | 新增「批次上傳」按鈕（僅在 seller 頁面顯示） |
| `S:\projects\shopee-copy-product\extension\popup.js` | 按鈕 click → `chrome.tabs.create('batch-upload.html')` |
| `S:\projects\shopee-copy-product\extension\content.js` | 新增 `checkSaveButton`、`clickSaveButton`、`uploadMedia` handler |

## 流程

```
使用者點擊 ICON → popup 載入 → 偵測到在 seller.shopee.tw
  → 顯示「批次上傳」按鈕
  → 點擊後 chrome.tabs.create('batch-upload.html')

batch-upload 分頁：
  1. 選取 product-catalog-tw.json
  2. 遍歷當前視窗分頁找到 seller.shopee.tw，執行 extractSellerProductList()
  3. 比對排除已上架商品
  4. 逐筆：
     a. chrome.tabs.create 開新分頁到 product/new
     b. waitForTabReady() 等待 status === 'complete'
     c. chrome.tabs.sendMessage({ action: 'fillProductData', data: item })
        — 完全複製 popup.js「從剪貼簿填入」的單行流程
     d. 等待儲存按鈕啟用（輪詢 60 秒）
     e. 點擊儲存
     f. 關分頁
  5. 顯示結果
```

## 核心程式碼

### batch-upload.js

`S:\projects\shopee-copy-product\extension\batch-upload.js`

```javascript
// 開新分頁 → 等待載入 → 填入 → 儲存 → 關閉
let tab = null
try {
  tab = await chrome.tabs.create({
    url: 'https://seller.shopee.tw/portal/product/new?from=sidebar',
  })
  await waitForTabReady(tab.id)

  // 完全複製 popup.js「從剪貼簿填入」流程
  const result = await chrome.tabs.sendMessage(tabId, { action: 'fillProductData', data: item })

  if (!result || !result.ok) {
    throw new Error((result && result.error) || 'fillAll 失敗')
  }

  // 輪詢儲存按鈕（60 秒）
  for (let i = 0; i < 60; i++) {
    await sleep(1000)
    const checkResult = await chrome.tabs.sendMessage(tabId, { action: 'checkSaveButton' })
    if (checkResult && checkResult.ready) {
      await chrome.tabs.sendMessage(tabId, { action: 'clickSaveButton' })
      break
    }
  }

  state.results.push({ name: item.ps_product_name, ok: true })
  consecutiveFailures = 0
} catch (e) {
  state.results.push({ name: item.ps_product_name, ok: false, error: e.message })
  consecutiveFailures++
  if (consecutiveFailures >= 2) {
    state.shouldStop = true  // 連續 2 筆錯誤自動暫停
  }
} finally {
  if (tab && tab.id) { chrome.tabs.remove(tab.id) }
}

await sleep(3000)  // 避免 WAF
```

### waitForTabReady

```javascript
function waitForTabReady(tabId, timeout = 20000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('分頁載入超時')), timeout)
    function onUpdated(updatedTabId, changeInfo) {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(onUpdated)
        clearTimeout(timer)
        setTimeout(() => resolve(), 500)
      }
    }
    chrome.tabs.onUpdated.addListener(onUpdated)
  })
}
```

### 掃描已上架商品（遍歷視窗，不限 active）

```javascript
const tabs = await chrome.tabs.query({ currentWindow: true })
const sellerTab = tabs.find(t => t.url && t.url.includes('seller.shopee.tw'))
if (!sellerTab) throw new Error('請先在賣家頁面開啟此功能')
const resp = await chrome.tabs.sendMessage(sellerTab.id, { action: 'extractSellerProductList' })
```

### content.js 新增 handler

`S:\projects\shopee-copy-product\extension\content.js`

```javascript
if (msg.action === 'checkSaveButton') {
  const btns = document.querySelectorAll('button')
  const btn = Array.from(btns).find(b => /儲存|保存|確認/.test(b.textContent))
  sendResponse({ ready: !!btn && !btn.disabled })
  return true
}
if (msg.action === 'clickSaveButton') {
  const btns = document.querySelectorAll('button')
  const btn = Array.from(btns).find(b => /儲存|保存|確認/.test(b.textContent))
  if (btn) { btn.click(); sendResponse({ ok: true }) }
  else sendResponse({ ok: false, error: '找不到儲存按鈕' })
  return true
}
```

## 診斷紀錄

### 錯誤：Illegal invocation

`chrome.tabs.sendMessage(tabId, { action: 'fillProductData', data: item })` 在 batch-upload 流程中拋出 `Illegal invocation`。

**對比（相同程式碼，不同結果）：**

| 情境 | 呼叫方式 | 結果 |
|------|---------|------|
| popup「從剪貼簿填入」 | `chrome.tabs.sendMessage(tab.id, ...)` 對已開啟的分頁 | ✅ 成功 |
| batch-upload | `chrome.tabs.sendMessage(tabId, ...)` 對 `chrome.tabs.create` 新開的分頁 | ❌ Illegal invocation |

**診斷 log 發現：**
- `tab.id` 是有效數字（如 `1830144430`）
- `tab.url` 為 `undefined`（`chrome.tabs.create` 回傳時 navigation 尚未開始）
- `waitForTabReady` 有等到 `status === 'complete'`

**Claude 分析（2026-07-22）：**
- `chrome.tabs.sendMessage(tabId, {...})` 本身的呼叫方式正確，沒有解綁 this
- 問題極可能出在 **content.js 內部**，而非 batch-upload.js
- 常見成因：
  1. `content.js` 裡有類似 `const send = chrome.runtime.sendMessage; send(...)` 抽出方法單獨呼叫
  2. `waitForTabReady` 判斷 `status === 'complete'` 太早，SPA 導向後 content script context 被清空
  3. `content_scripts.matches` 對 `product/new?from=sidebar` 沒有完全匹配
- 需確認：console 完整 stack trace、content.js message listener 區塊、manifest content_scripts 設定

## 尚未確定的問題

1. **Illegal invocation 根因** — `chrome.tabs.sendMessage` 對新開分頁失敗，但對已開啟分頁正常。`tab.url` 為 `undefined` 但 `tab.id` 有效。  
   Claude 分析：問題可能在 content.js 內部（如解綁 this 的 Chrome API 呼叫、SPA 重導向時 content script context 被清空），而非 batch-upload.js。  
   **需確認：** console 完整 stack trace、content.js message listener 區塊、manifest content_scripts 設定。

2. **儲存按鈕的 selector** — `Array.from(btns).find(b => /儲存|保存|確認/.test(b.textContent))` 需確認蝦皮 seller 頁面實際按鈕文字。

3. **WAF 頻率限制** — 3 秒間隔是否足夠？需實際測試。可考慮加入指數退避與 429 偵測。

## Tasks

### Task 1: 診斷 Illegal invocation

**目標：** 找出 `chrome.tabs.sendMessage` 對新開分頁拋出 `Illegal invocation` 的原因。

**Smoke test：**
1. 開啟 `batch-upload.html`，選取 catalog JSON
2. 點「開始上傳」→ 觀察 console 輸出的 `tabId`、`url`、`status`
3. 對比：手動開一個 seller 新商品分頁，從 popup 按「從剪貼簿填入」確認正常
4. 確認 `batch-upload.html` 的 `chrome` 物件是否完整（`console.log(Object.keys(chrome))`）

### Task 2: 完成批次上傳流程

**先決條件：** Task 1 解決後。

**目標：** 讓 `fillAndSave` 正常運作，完成逐筆上傳。

**Smoke test：**
1. 選取 `product-catalog-tw.json`
2. 掃描已上架商品
3. 開始上傳 → 確認逐筆開分頁、填入、儲存、關分頁
4. 確認完成頁顯示成功/失敗筆數
5. 按「重試失敗項目」確認只重試失敗的
6. 手動中斷後重新掃描，確認已上傳的筆數被排除