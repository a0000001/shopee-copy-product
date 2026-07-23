# 030 — Plan: 避開機器人審核特徵與人類沉浸間隔優化

> 本文件記錄針對蝦皮賣家中心風控機制（避免商品上架後進入「審核中」狀態）所設計之擬真行為、沉浸間隔與事件模擬計畫。

---

## 一、 專案架構與關鍵檔案清單

| 檔案 | 說明 | 絕對路徑 |
|------|------|----------|
| `batch-upload.js` | 批次上傳 UI 控制，負責商品與商品之間的動態沉浸冷卻間隔。 | `file:///S:/projects/shopee-copy-product/extension/batch-upload.js` |
| `content.js` | 欄位填寫引擎，負責欄位間隨機 Jitter 停頓與 Focus/Blur 擬真事件發送。 | `file:///S:/projects/shopee-copy-product/extension/content.js` |

---

## 二、 蝦皮風控與審核機制分析 (Review & WAF Risk Factor)

### 1. 觸發「審核中 (Under Review)」的核心風控特徵
1. **輸入速度過快 (No Human Delay)**：欄位值在幾毫秒內全部完成賦值，未觸發真實鍵盤/焦點事件。
2. **機器人連續動作 (Zero Jitter)**：欄位與欄位切換的時間間隔固定且為零。
3. **商品間隔過短 (High Velocity Upload)**：兩筆商品發布時間差過短（< 3 秒），觸發蝦皮大量刊登頻率限制。

---

## 三、 擬定修復方案 (Proposed Changes)

### Component 1: `content.js` 擬真焦點事件與隨機 Jitter 停頓

#### [MODIFY] [content.js](file:///S:/projects/shopee-copy-product/extension/content.js)
- 在 `setNativeValue` 賦值前後，明確依序發送 `focus` -> `setNativeValue` -> `input` -> `change` -> `blur` 事件。
- 在每個欄位填寫之間，加入 `150ms ~ 350ms` 的隨機微小停頓（Jitter），模擬真人游標移動與思考間隔。

```javascript
// 隨機 Jitter 停頓工具
function randomJitter(min = 150, max = 350) {
  const ms = Math.floor(Math.random() * (max - min + 1)) + min
  return new Promise(r => setTimeout(r, ms))
}

// 增強 setNativeValue 擬真事件發送
function setNativeValue(element, value) {
  element.focus && element.focus()
  // ... native setter ...
  element.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }))
  element.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }))
  element.blur && element.blur()
}
```

---

### Component 2: `batch-upload.js` 商品間隨機沉浸冷卻

#### [MODIFY] [batch-upload.js](file:///S:/projects/shopee-copy-product/extension/batch-upload.js)
- 將商品與商品之間的固定等待（`sleep(3000)`）優化為 **`6000ms ~ 12000ms` 的隨機動態沉浸冷卻**。
- 降低發布頻率，避開蝦皮後台 WAF 自動化檢測與審核佇列標記。

```javascript
// 在批次上傳迴圈中
const coolDownMs = Math.floor(Math.random() * (12000 - 6000 + 1)) + 6000
log(`⏳ 商品上架完成，啟動 ${(coolDownMs / 1000).toFixed(1)} 秒隨機沉浸冷卻間隔...`, 'info')
await sleep(coolDownMs)
```

---

## 四、 執行任務與驗證計畫 (Tasks & Verification Plan)

### Tasks
- [ ] **Task 1**: 修改 `content.js` 加入欄位間隨機 Jitter 停頓與完整的 `focus/blur` 擬真事件鏈。
- [ ] **Task 2**: 修改 `batch-upload.js` 將商品間隔改為 6 ~ 12 秒動態隨機沉浸冷卻。

### Verification Plan
1. 實測 2 筆商品批次上傳，觀察蝦皮賣家中心商品列表中上架商品的狀態是否為「架上商品」，避免掉入「審核中」。
