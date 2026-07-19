---
type: guide
status: draft
updated: 2026-07-19
domain: shopee
tags: [chrome-web-store, publish, review, checklist, cws]
---

# Chrome Web Store 上架審查工具與檢查清單

> 發布 Shopee Get Content 到 Chrome Web Store 前，需要安裝的工具、檢查項目與常見退件原因。

---

## 一、官方工具

### 1.1 Chrome Web Store Developer Dashboard

官方發布入口，上架前自動跑自動審查。

- 網址：https://chrome.google.com/webstore/devconsole
- 費用：一次性 USD 5 註冊費（Chrome Web Store Developer 帳號）
- 上架流程：打包 `.zip` → 上傳 → 填寫商店資訊 → 送出審查

### 1.2 Chrome Extension 官方文件

- [CWS 審查政策](https://developer.chrome.com/docs/webstore/program-policies/)
- [CWS 最佳實踐](https://developer.chrome.com/docs/webstore/best-practices/)
- [CWS 審查時程](https://developer.chrome.com/docs/webstore/review-process/)

---

## 二、上架前必裝工具

### 2.1 Chrome Extension Developer Dashboard

官方發布入口，上架前自動跑自動審查。

- 網址：https://chrome.google.com/webstore/devconsole
- 費用：一次性 USD 5 註冊費
- 流程：打包 `.zip` → 上傳 → 填寫商店資訊 → 送出審查

### 2.2 Chrome Extension Analyzer

第三方工具，檢查權限是否過多、manifest 是否符合最佳實踐。

- 網址：https://chrome-ext-analyzer.vercel.app/
- 功能：上傳 `.zip` 或貼 manifest 內容，自動分析權限必要性、安全性問題

### 2.3 ESLint + Chrome Extension 規則

```bash
npm init @eslint/config
npm install --save-dev eslint-plugin-chrome-extension
```

檢查 JS 語法、MV3 相容性、未使用的變數等。

### 2.4 Chrome DevTools 開發者模式

- 在 `chrome://extensions` 開啟開發者模式 → 載入未封裝擴充功能
- 檢查 Console 錯誤、Network 請求、Service Worker 狀態
- 測試所有功能是否正常

---

## 三、Chrome Web Store 審查項目

### 3.1 審查流程

| 階段 | 內容 | 預估時間 |
|------|------|---------|
| 自動審查 | 掃描 manifest、權限、惡意程式碼 | 數分鐘 |
| 人工審查 | 檢查功能是否符合描述、隱私權政策 | 數小時～數天 |
| 初次上架 | 首次審查通常較嚴格 | 1～3 天 |

### 3.2 常見退件原因

| # | 退件原因 | 本專案風險 | 因應措施 |
|---|---------|-----------|---------|
| 1 | 權限過多（Minimum Permission 原則） | 中 | `clipboardRead` 需說明用途；`contextMenus` 已用於右鍵另存 JPG |
| 2 | 缺乏隱私權政策 | 高 | 需準備 Privacy Policy 頁面（可用 GitHub Pages 或 Notion） |
| 3 | 功能與描述不符 | 低 | 商店描述需與實際功能一致 |
| 4 | 使用無關第三方程式碼 | 低 | 無外部依賴 |
| 5 | 誤導性促銷或功能宣稱 | 低 | 避免誇大功能描述 |
| 6 | 權限最小化原則不符 | 中 | `clipboardRead` 需說明為何需要讀取剪貼簿 |

---

## 三、上架前檢查清單

### 3.1 Manifest 檢查

| # | 項目 | 檢查結果 | 備註 |
|---|------|---------|------|
| 1 | manifest_version 為 3 | ✅ | 已使用 MV3 |
| 2 | 權限最小化 | ⚠️ | `clipboardRead` 需在商店說明中解釋用途 |
| 3 | host_permissions 精確 | ⚠️ | `*.img.susercontent.com` 在 content_scripts 未使用，僅 background 用於 context menu 下載，需在說明中解釋 |
| 4 | 無冗餘 permission | ✅ | `scripting` 已移除 |
| 5 | content_scripts matches 與 host_permissions 一致 | ⚠️ | `*.img.susercontent.com` 在 host_permissions 但不在 content_scripts matches 中，需確認 background 確實有使用 |

### 3.3 隱私權政策要求

Chrome Web Store 要求**所有**擴充功能（即使不收集個人資料）都必須提供隱私權政策。

| 項目 | 要求 | 本專案狀態 |
|------|------|-----------|
| 隱私權政策 URL | 必須在商店資訊中提供 | ❌ 未準備 |
| 資料收集聲明 | 說明收集哪些資料、用途、是否分享給第三方 | ❌ 未準備 |
| 資料傳輸加密 | 必須使用 HTTPS | ✅ 所有通訊均為 HTTPS |

**建議方案**：
- 用 GitHub Pages 或 Notion 建立隱私權政策頁面
- 內容重點：本擴充功能**不收集**任何個人資料、**不傳送**資料到第三方伺服器（僅直接與 shopee.tw 互動）、**不儲存**任何使用者資訊

---

## 四、上架前檢查清單

### 4.1 必要檢查項目

| # | 項目 | 狀態 | 備註 |
|---|------|------|------|
| 1 | 註冊 Chrome Web Store Developer 帳號（USD 5） | ❌ | 需先完成 |
| 2 | 準備隱私權政策 URL | ❌ | 可用 GitHub Pages 或 Notion |
| 3 | 移除冗餘權限 | ⚠️ | `clipboardRead` 需在商店說明解釋用途 |
| 4 | 確認所有 host_permissions 有對應用途 | ⚠️ | `*.img.susercontent.com` 用於 context menu 下載 |
| 5 | 打包 `.zip`（僅含必要檔案） | ❌ | 排除 `.git`、`node_modules`、開發用檔案 |
| 6 | 填寫商店資訊（說明、截圖、類別） | ❌ | 需準備至少 1 張 1280x800 截圖 |
| 7 | 選擇發布方式（公開/不公開/僅限特定網域） | ❌ | 建議先以「不公開」測試 |
| 8 | 提交審查 | ❌ | 審查通過後即可公開 |

### 4.2 商店資訊準備

| 項目 | 建議內容 | 狀態 |
|------|---------|------|
| 名稱 | Shopee Get Content | ✅ |
| 簡短說明 | 一鍵擷取蝦皮商品標題、價格、描述，下載圖片與影片 | ✅ |
| 詳細說明 | 功能列表、使用方式、權限說明 | ❌ 需撰寫 |
| 類別 | Productivity | ✅ |
| 語言 | 繁體中文 | ✅ |
| 截圖（1280x800） | 至少 1 張 popup 操作截圖 | ❌ 需準備 |
| 小圖示（128x128） | icon.png | ✅ 已有 |
| 隱私權政策 URL | 說明不收集個人資料 | ❌ 需準備 |

---

## 四、建議安裝的審查工具

| 工具 | 用途 | 安裝方式 |
|------|------|---------|
| **Chrome Extension Analyzer** | 分析 manifest 權限、安全性問題 | 網頁版：https://chrome-ext-analyzer.vercel.app/ |
| **ESLint** | JS 語法檢查 | `npm init @eslint/config` |
| **ESLint Chrome Extension Plugin** | Chrome Extension 專用規則 | `npm install --save-dev eslint-plugin-chrome-extension` |
| **chrome://extensions 開發者模式** | 載入未封裝擴充功能，檢查 console 錯誤 | 內建於 Chrome |
| **Chrome DevTools** | 檢查 Service Worker、popup、content script 錯誤 | 內建於 Chrome |
| **PWA Builder** | 檢查擴充功能是否符合最佳實踐 | https://www.pwabuilder.com/ |

---

## 四、上架流程

### 4.1 步驟

1. **註冊帳號**：前往 https://chrome.google.com/webstore/devconsole 註冊（USD 5）
2. **打包擴充功能**：在 `chrome://extensions` → 開發者模式 → 封裝擴充功能
3. **上傳**：登入 Developer Dashboard → 新增項目 → 上傳 `.zip`
4. **填寫商店資訊**：
   - 說明：功能列表、使用方式
   - 截圖：至少 1 張 1280x800
   - 類別：Productivity
   - 語言：繁體中文
   - 隱私權政策 URL
5. **送出審查**

### 4.2 審查後續

| 結果 | 處理方式 |
|------|---------|
| 通過 | 擴充功能上架，可公開或限網域發布 |
| 退回 | 依退件原因修正後重新提交 |
| 需補充資訊 | 依要求補充後重新提交 |

---

## 五、常見退件原因與本專案因應

| # | 退件原因 | 本專案風險 | 因應措施 |
|---|---------|-----------|---------|
| 1 | 權限過多（Minimum Permission 原則） | 中 | `clipboardRead` 需在商店說明解釋：用於從剪貼簿讀取 JSON 填入賣家編輯頁 |
| 2 | 缺乏隱私權政策 | 高 | 需準備 Privacy Policy 頁面 |
| 3 | 功能與描述不符 | 低 | 商店說明需與實際功能一致 |
| 4 | 使用無關第三方程式碼 | 低 | 無外部依賴 |
| 5 | 誤導性促銷或功能宣稱 | 低 | 避免誇大功能描述 |
| 6 | 權限最小化原則不符 | 中 | `clipboardRead` 需說明；`host_permissions` 需確認每個網域都有對應用途 |

---

## 六、相關文件

| 文件 | 關聯 |
|------|------|
| `docs/spec/014-spec-擴充功能-chrome extension-shopee-get-content.md` | 擴充功能完整 spec，含權限分析與實作狀態 |
| `__remo__/shopee-get-content/` | Extension 實作原始碼 |
| [Chrome Web Store Program Policies](https://developer.chrome.com/docs/webstore/program-policies/) | 官方審查政策 |
| [Chrome Extension Best Practices](https://developer.chrome.com/docs/webstore/best-practices/) | 官方最佳實踐 |
| [Chrome Web Store Review Process](https://developer.chrome.com/docs/webstore/review-process/) | 審查流程說明 |
