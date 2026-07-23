# 027 — Plan: 類別選取與 SPA 導航 Context 銷毀修復計畫

> 本文件記錄二刷診斷後的真實根因、修復方案及驗證計畫。
> 已將實測發現之「價格填寫未觸發銷售資訊區塊啟用」問題完整對齊整合。

---

## 一、 黃金對照日誌與實測現狀 (Golden Reference & Diagnostic)

### 1.1 實測截圖發現 (2026-07-23 13:46 實測)
- 觀察實測截圖 `product_page_status_1784785351246.png` 發現：
  - **商品名稱**：成功填入。
  - **類別**：成功選取 (`電腦與周邊配件 > 軟體`)。
  - **商品描述**：成功填入。
  - **價格與銷售資訊區塊**：價格欄位未成功啟用 / 輸入，導致蝦皮 DOM 下方的「商品數量 (stock)」與「信用卡分期付款 (installment)」區塊未獲 Vue 啟用（商品數量維持 `0`，信用卡分期按鈕未渲染）。

---

## 二、 確切根因與破口分析 (Root Cause Analysis)

### 根因 1 (主因)：`window._sgcFillState` 在 Vue SPA 導航後遺失 (已實作 Auto-Resume 修復)
- 頁面導航後透過 `chrome.tabs.onUpdated` 與 Auto-Resume 機制自動重送 `fillProductData`。

### 根因 2 (欄位依賴性)：價格欄位與 Vue 銷售資訊區塊啟用順序
- 蝦皮賣家中心表單中，**價格 (price)** 是啟用「商品數量 (stock)」與「信用卡分期 (installment)」的核心前置欄位。
- 若 `cleanPrice` 賦值後未產生 `input` / `change` 事件讓 Vue 響應，或價格填寫後未等待 Vue 穩定，下方的數量與分期區塊將不會出現，致使全流程在中途在中斷。

---

## 三、 擬定修復方案 (Proposed Changes)

### Component 1: `content.js` 價格填寫事件強化與 Vue 安定等待 (修復點 C)

#### [MODIFY] [content.js](file:///S:/projects/shopee-copy-product/extension/content.js)
- 強化 `fillFieldAsync` 填寫價格時之事件觸發 (`input`, `change`, `blur`)。
- 在價格填寫成功後，明確新增 `await sleep(600)` 等待，確保 Vue 將「商品數量」與「信用卡分期」區塊渲染完成後，才繼續執行後續欄位。

---

## 四、 執行任務與驗證計畫 (Tasks & Verification Plan)

### Tasks
- [x] **Task 1**: 更新 `docs/spec/027-plan-類別選取破口與實際上架通訊超時修復分析.md`。
- [ ] **Task 2**: 修改 `content.js` 強化價格填寫之 Vue 事件發送與 600ms 安定等待。
- [ ] **Task 3**: 到 `batch-upload.html` 進行實測驗證。
