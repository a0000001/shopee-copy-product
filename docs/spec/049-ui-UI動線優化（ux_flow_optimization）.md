---
type: spec
status: draft
updated: 2026-07-25
domain: extension-ui
tags: [ux, ui, user-flow, onboarding, popup, batch-upload, first-run, affordance]
---

# UI 動線優化：不用看手冊就能自然會用

## 背景

本專案的核心操作動線是「商品頁擷取 → 賣家頁填入」，使用者橫跨兩個完全不同的網域（shopee.tw ↔ seller.shopee.tw），再加上批次上傳、目錄伺服器、剪貼簿等環節，新使用者首次接觸時容易困惑：

1. **不知道先後順序** — 不知道該先去商品頁還是賣家頁
2. **不知道當前處於哪個步驟** — popup 的自動切換模式（擷取/賣家）沒有視覺提示
3. **不知道下一步該做什麼** — 功能按鈕缺乏引導性文字
4. **初次見面零引導** — 沒有 first-run onboarding，安裝後就直接看到空白面板

---

## 核心問題診斷

### #problem-no-flow-vision

**缺少全流程的可視化視角**

目前 popup 只有「當前頁面能做什麼」，沒有告訴使用者「整體流程長怎樣」。使用者像在迷宮裡只看得到腳下三步。

### #problem-mode-switch-silent

**兩種模式切換無感**

popup 自動偵測 `seller.shopee.tw` 來切換擷取/賣家模式，但切換時沒有動畫、沒有模式名稱大標、兩者 UI 差異只有一行小字 "📝 賣家編輯頁 — 填入模式"，視覺上幾乎相同。

### #problem-no-empty-state

**缺少空白狀態引導**

首次安裝後在商品頁點開 popup，看到的是「擷取中...」→ 瞬間變「標題、價格、描述」資料面板。如果 content script 沒回應，則顯示錯誤訊息。沒有任何「歡迎」「這是什麼」「如何使用」的訊息。

### #problem-clipboard-gap

**剪貼簿步驟是中斷點**

「商品頁複製 → 賣家頁貼上」依賴剪貼簿，但：
- 使用者可能忘了先複製
- 剪貼簿被其他軟體汙染時不會有警告
- 沒有「你上次複製了什麼」的暫存記憶

### #problem-server-status-obscure

**伺服器狀態不夠直覺**

popup 右上角的小圓點 + ▶/⏹ 按鈕，新使用者看不懂這是什麼。而且伺服器是批次上傳、下載資料、更新目錄的前置條件，失敗了才跳出錯誤訊息。

### #problem-batch-upload-hidden

**批次上傳入口隱藏**

批次上傳是獨立的 HTML 頁面，入口藏在賣家模式的按鈕列中。使用者不知道它存在，也不知道什麼時候該用。

### #problem-options-buried

**設定頁難找**

伺服器位址、Native Host 安裝說明放在 `options.html`，但沒有從 popup 引導使用者前往。如果伺服器連不上，使用者不知道要去哪裡修。

---

## 優化方案

### #solution-flow-header

**全流程可視化導航列**

在 popup 頂部加入一個 3 步驟的視覺化流程指示器：

```
[Step 1: 擷取]  →  [Step 2: 複製]  →  [Step 3: 填入]
    ◉                    ○                     ○
```

- 目前位於哪一步驟就亮哪個圓點
- 非當前步驟可點擊跳轉（例：在賣家頁可點 Step 1 開啟新分頁去商品頁；注意：點擊開新分頁時會因 Chrome Extension 既定特性自動關閉 Popup 視窗，UI 上應註記「(開啟商品頁 ↗)」提示）
- 步驟之間有箭頭連線，視覺化順序

### #solution-mode-badge

**兩種模式的視覺差異化**

| 元素 | 商品頁模式 | 賣家頁模式 |
|------|-----------|-----------|
| 背景色 | 白色 / 淺灰 | 淡綠色背景 #f0faf8 |
| 頂部標題 | 「🛒 商品資料擷取」 | 「📝 賣家編輯填入」 |
| 圖示徽章 | 瀏覽器動作 badge 顯示 SGC | 瀏覽器動作 badge 顯示 ✏️ |
| 按鈕主色 | 橘色 #ee4d2d (依據 #solution-color-hierarchy 統一層級) | 橘色 #ee4d2d |

### #solution-first-run

**首次安裝歡迎流程（獨立全頁引導）**

在 Extension 安裝時（`background.js` 監聽 `chrome.runtime.onInstalled` 且 `reason === 'install'`），自動在新分頁開啟專屬的獨立全頁引導 `welcome.html`：

1. **獨立全頁優勢**: 不受 Popup `420px` 寬度限制與「點擊視窗外自動關閉」干擾，可完整展示視覺圖解與動畫示範。
2. **步驟引導內容**:
   - **Step 1**: 「去商品頁 → 點外掛圖示 → 自動擷取商品資料」
   - **Step 2**: 「按「複製到剪貼簿」→ 資料自動寫入剪貼簿與本地備份」
   - **Step 3**: 「到賣家編輯頁 → 點外掛 → 一鍵填入商品資料」
3. 結束導覽或點擊「開始使用」後，自動設定 `chrome.storage.local` 中 `firstRunDone = true`。

### #solution-empty-state

**空白狀態代替錯誤狀態**

- 當 content script 無回應 → 不顯示錯誤，而是顯示幫助提示：
  - 「目前頁面不是蝦皮商品頁」→ 附按鈕「去蝦皮逛逛」
  - 「商品資料載入中...」→ 旋轉動畫
  - 「請先重新整理頁面」→ 附按鈕「重新整理」

### #solution-clipboard-memory

**剪貼簿狀態提示與暫存**

- 賣家模式下，如果剪貼簿有 `[` 或 `{` 開頭的內容 → 顯示「📋 偵測到剪貼簿有 JSON 資料」
- 賣家模式下，如果剪貼簿空白 → 顯示「⚠️ 剪貼簿空白，請先去商品頁複製」
- 提供「從上次複製再次填入」功能（存最後一筆在 `chrome.storage.local`）
- 增加批次填入可選項：單件填入 vs 批次填入

### #solution-server-integration

**伺服器狀態整合進主流程**

- popup 底部加入常駐的伺服器狀態列（非右上角小點）
- 未啟動時顯示：「⚡ 目錄伺服器未啟動 — 下載資料與批次上傳需要它」
- 附按鈕「啟動伺服器」＋「設定（⚙️ 齒輪圖示連到 options.html）」
- 啟動中／已啟動的動畫回饋

### #solution-batch-upload-entry

**批次上傳的明確入口**

- 在 popup 商品頁模式也顯示批次上傳入口（不僅限賣家模式）
- 入口按鈕改為明顯的卡片式：「📦 批次上傳多筆商品 →」
- 描述文字：「從商品目錄 JSON 一次上傳多筆商品到賣家中心」

### #solution-batch-upload-steps

**批次上傳頁面的逐步可視化**

目前 batch-upload.html 的四步驟是對的，但可以優化：

- 步驟編號變成視覺化的進度條（已完成/進行中/未完成）
- 步驟 1 掃描完成後自動展開步驟 2（減少點擊）
- 步驟 2 選擇檔案後自動展開步驟 3（減少點擊）
- 步驟 4 完成後顯示建議下一步：「回到賣家中心檢查上架狀態」

### #solution-button-labels

**按鈕文字加入行動導向**

| 目前 | 優化後 |
|------|--------|
| 從剪貼簿填入 | 一鍵填入商品資料 |
| 下載資料 | 下載原始資料到目錄 |
| 複製到剪貼簿 | 複製 JSON（貼到賣家頁用） |
| 掃描已上架商品 | ① 掃描已上架商品 |
| 開始上傳 | ② 開始上傳 |
| 批次上傳 | 📦 批次上傳多筆商品 |
| 重試失敗項目 | 重新上傳失敗項目 |

### #solution-color-hierarchy

**色彩 hierarchy 強化**

定義四層按鈕重要性，用顏色區分：

| 層級 | 用途 | 顏色 |
|------|------|------|
| Primary | 主要行動（填入、複製、開始上傳） | 橘色 #ee4d2d |
| Success | 完成、確認（下載、儲存） | 綠色 #26aa99 |
| Secondary | 次要行動（設定、測試） | 灰色 #e0e0e0 |
| Danger | 危險、停止 | 紅色 #e74c3c |

以 popup 目前設計為例：`btnFill`（Primary）、`btnBatchUpload`（Primary）、`btnBatchTest`（Secondary）的顏色分配需要調整。

### #solution-toast-unification

**統一通知系統**

- 所有回饋訊息統一使用底部 Toast（目前已實作 `showToast`，但有部分操作使用 error modal）
- 沒有緊急性的錯誤使用 inline error，不彈 modal
- Modal 只留給需要使用者採取行動的錯誤（如伺服器啟動失敗）
- 操作成功時使用 Toast + 聲音回饋（可關閉）

### #solution-shortcut-hints

**鍵盤快捷鍵提示**

在按鈕旁顯示快捷鍵提示（如「Ctrl+Shift+C 複製」「Ctrl+Shift+V 填入」），幫助進階使用者加速。

---

## 實作優先級

| 優先級 | 項目 | 預估工時 | 依賴 |
|--------|------|---------|------|
| P0 | flow-header 全流程導航列 | 2h | popup.html, popup.js |
| P0 | mode-badge 模式視覺差異 | 0.5h | popup.html, popup.js |
| P0 | empty-state 空白狀態 | 1h | popup.js |
| P1 | server-integration 伺服器狀態整合 | 2h | popup.html, popup.js |
| P1 | button-labels 按鈕文字優化 | 0.5h | popup.html, batch-upload.html |
| P1 | toast-unification 通知統一 | 1h | popup.js, batch-upload.js |
| P1 | batch-upload-steps 漸進展開 | 1h | batch-upload.js |
| P2 | clipboard-memory 剪貼簿暫存 | 1h | popup.js |
| P2 | first-run 首次引導 | 3h | welcome.html, welcome.js, background.js |
| P2 | batch-upload-entry 批次入口強化 | 0.5h | popup.html |
| P2 | color-hierarchy 色彩層級 | 0.5h | popup.html, batch-upload.html |
| P3 | shortcut-hints 快捷鍵提示 | 0.5h | all HTML files |

---

## 驗收標準

### #accept-mode-switch
- 商品頁與賣家頁的 popup 在視覺上一眼就能區分
- 使用者無需閱讀文字說明就知道現在處於哪個模式

### #accept-flow-vision
- 首次使用者打開 popup 能在 3 秒內理解完整操作流程（擷取→複製→填入）
- 目前處於流程的哪一步清晰可見

### #accept-error-reduction
- 因「不知道下一步做什麼」而卡住的情況歸零
- 「忘記先複製剪貼簿就去賣家頁」的情況減少 80%

### #accept-server-awareness
- 使用者在下載或批次上傳前就清楚知道伺服器狀態
- 伺服器未啟動時無法進行依賴它的操作（按鈕 disabled + 說明原因）

---

## 相關文件

- `extension/popup.html` — 主要介面
- `extension/popup.js` — 主要邏輯
- `extension/batch-upload.html` — 批次上傳介面
- `extension/batch-upload.js` — 批次上傳邏輯
- `extension/options.html` — 設定頁
- `docs/spec/014-spec-擴充功能-chrome extension-shopee-get-content.md` — 原始 UI 規格