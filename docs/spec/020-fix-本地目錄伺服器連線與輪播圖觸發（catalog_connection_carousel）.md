---
type: fix
status: draft
updated: 2026-07-21
domain: shopee
tags: [local-catalog-server, CORS, preflight, service-worker, carousel, virtual-rendering, content-script, native-host, subprocess]
---

# 本地目錄伺服器連線失敗與輪播圖觸發修復

> 兩個問題：`POST /append` 從 extension 送至 `localhost:9801` 失敗，以及 `triggerCarouselFullRender` 在某些頁面找不到目標。

---

## 問題一：POST /append 連線失敗（根因已確認）

### 症狀

- popup 顯示「伺服器運行中」
- 點「送出至目錄」後 toast 顯示「❌ 無法連線 (http://localhost:9801): Failed to fetch」
- `GET /health` 可正常回應
- background Service Worker console 顯示 `TypeError: Failed to fetch`
- 伺服器 terminal 完全無任何 log

### 根因：Native Host 子行程被 Chrome 殺掉

**不是 CORS 問題，也不是 popup vs background 問題。**

`S:\projects\shopee-copy-product\extension\native-messaging-host\catalog-server-host.py`

Native Host 透過 `subprocess.Popen` 啟動 `local-catalog-server.py`。當 Chrome 終止 Service Worker 或 Native Port 斷線時，Chrome 會 kill 整個 Native Host 行程樹，**包括子行程**。

但健康檢查的流程是：
1. popup → `sendMessage({action: 'serverHealthCheck'})` → background.js → `fetch('/health')`
2. 這個 `fetch` 是**獨立 HTTP 請求**，不會觸發 Native Host 重啟

所以 popup 顯示「運行中」（因為健康檢查成功），但實際伺服器早就被殺掉了。

### 修正

`S:\projects\shopee-copy-product\extension\native-messaging-host\catalog-server-host.py:55-58`

```python
if platform.system() == 'Windows':
    kwargs['creationflags'] = subprocess.CREATE_NEW_PROCESS_GROUP
else:
    kwargs['start_new_session'] = True
```

使用 `CREATE_NEW_PROCESS_GROUP`（Windows）／`start_new_session`（Unix）讓伺服器行程獨立於 Native Host 的行程樹，Chrome 殺掉 Native Host 時不會波及伺服器。

### 驗證

當伺服器由 terminal 獨立啟動（`python scripts/local-catalog-server.py`）時，POST 正常運作、去重判斷正確、response 正常回傳。Server 端 44/44 測試全通過。

---

## 問題二：triggerCarouselFullRender 找不到目標

### 症狀

```
content.js:458 [SGC] triggerCarouselFullRender: no target found, giving up
```

### 根因

選擇器脆弱性：
- `.o_Jpw2` 是 CSS Modules hash，蝦皮部署可能變更
- Strategy 2 若所有 `.mdCA_C` 都在 dialog/popup 內則被過濾掉

### 現有防禦

`extractFromDOM()` 有備援圖片來源，不影響圖片萃取結果。

---

## 相關檔案

| 用途 | 路徑 |
|------|------|
| 本地目錄伺服器 | `S:\projects\shopee-copy-product\scripts\local-catalog-server.py` |
| Native Host（子行程管理） | `S:\projects\shopee-copy-product\extension\native-messaging-host\catalog-server-host.py` |
| extension popup JS | `S:\projects\shopee-copy-product\extension\popup.js` |
| extension background | `S:\projects\shopee-copy-product\extension\background.js` |
| 內容腳本（carousel 觸發） | `S:\projects\shopee-copy-product\extension\content.js` |
| 自動測試 | `S:\projects\shopee-copy-product\scripts\test-catalog-server.py` |
| 目錄規格 | `S:\projects\shopee-copy-product\docs\spec\019-plan-本地目錄伺服器（local_catalog_server）.md` |
| 目錄資料 | `S:\projects\shopee-copy-product\docs\data\product-catalog-tw.json` |

---

## Tasks

### Task 1：驗證 Native Host 修正

- [ ] 重新安裝 Native Host：`.\scripts\install-native-host.ps1`
- [ ] `chrome://extensions` → 重新整理 extension
- [ ] 按 ▶ 啟動伺服器
- [ ] 確認 popup 顯示「運行中」
- [ ] 按「送出至目錄」→ 確認 toast 正常顯示
- [ ] 關閉 popup，再開新 popup → 確認「運行中」
- [ ] 再按「送出至目錄」→ 另一個商品

**smoke test**：
```powershell
python scripts/test-catalog-server.py
```
44/44 通過。

### Task 2：carousel 選擇器穩定化（非急件）

- [ ] 觀察 `.o_Jpw2` 是否會因蝦皮前端版更而變化
- [ ] 若頻繁失效，改用更穩定選擇器