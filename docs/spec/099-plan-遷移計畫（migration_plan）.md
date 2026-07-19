---
type: plan
status: draft
updated: 2026-07-19
domain: meta
tags: [migration, split, shopee-copy-product, cleanup, redirect]
---

# 遷移計畫：從 shopee monorepo 拆分 shopee-copy-product

> 本文件記錄將 Shopee Copy Product Chrome Extension 從 `S:\projects\shopee` 拆分為獨立專案的完整步驟。任何一輪新對話拿到本文件即可按順序執行。

---

## 一、背景

### 1.1 為什麼拆分

`S:\projects\shopee` 是一個 monorepo，包含：
- 蝦皮商品上架管線（pipeline spec、資料轉換、爬蟲腳本）
- Chrome Extension「Shopee Get Content」（後改名 shopee-copy-product）
- 蝦皮官方工具參考資料
- 除錯診斷腳本

Extension 需要獨立發布到 Chrome Web Store，因此拆分為獨立 repo。

### 1.2 現狀

已完成（不需重做）：

| 項目 | 說明 |
|------|------|
| Repo 建立 | https://github.com/a0000001/shopee-copy-product |
| GitHub Pages 啟用 | docs/ 目錄，隱私權政策 URL: https://a0000001.github.io/shopee-copy-product/privacy/ |
| 原始碼搬移 | `extension/` 含 manifest、background.js、content.js、popup.html、popup.js、icon 一整套 |
| Spec 搬移 | 014（主 spec）、015（輪播修復）、016（PNG 過濾）、021（上架檢查清單） |
| 診斷腳本 `_000` | 已搬至 `docs/scripts/` |
| AI 指令檔 `從mazz68` | 已搬至 `extension/assets/`（但位置錯誤，待修正） |
| CHANGELOG、ARCHITECTURE、REFERENCE | 已建立 |
| Pipeline spec 001、011、012、013 | 已拷貝至 `docs/spec/`（但部分不該留） |

### 1.3 兩個 repo 的路徑與用途

| Repo | 本機路徑 | GitHub |
|------|---------|--------|
| 原專案 | `S:\projects\shopee` | https://github.com/a0000001/shopee |
| 新專案 | `S:\projects\shopee-copy-product` | https://github.com/a0000001/shopee-copy-product |

---

## 二、完整步驟（依序執行）

### 步驟 1：新專案 — 補搬診斷腳本（_001、_002）

目前 `docs/scripts/` 只有 `_000`（已搬），缺少 `_001` 和 `_002` 以及 `__remo__/README.md`。

**執行命令**：

```powershell
# 複製其餘診斷腳本
Copy-Item -Path "S:\projects\shopee\__remo__\_001_diagnostic_dom_timing.js" -Destination "S:\projects\shopee-copy-product\docs\scripts\" -Force
Copy-Item -Path "S:\projects\shopee\__remo__\_002_diagnostic_dom_click.js" -Destination "S:\projects\shopee-copy-product\docs\scripts\" -Force

# 複製診斷歷程 README（改名為 DIAGNOSTIC_JOURNEY.md 避免與專案根 README 混淆）
Copy-Item -Path "S:\projects\shopee\__remo__\README.md" -Destination "S:\projects\shopee-copy-product\docs\scripts\DIAGNOSTIC_JOURNEY.md" -Force
```

**驗證**：

```powershell
Get-ChildItem -LiteralPath "S:\projects\shopee-copy-product\docs\scripts" | Select-Object Name
# 預期看到：_000_PROVEN_rootcause_carousel_virtual_rendering.js, _001_diagnostic_dom_timing.js, _002_diagnostic_dom_click.js, DIAGNOSTIC_JOURNEY.md
```

---

### 步驟 2：新專案 — 修正 從mazz68 位置

目前 `從mazz68收錄並拆分商品描述.md` 在 `extension/assets/`，這會被打包進上架 zip。應該移到 `docs/data/`。

**執行命令**：

```powershell
# 確保 docs/data 已存在
New-Item -ItemType Directory -Path "S:\projects\shopee-copy-product\docs\data" -Force

# 搬移檔案（從 extension/assets 到 docs/data）
Move-Item -Path "S:\projects\shopee-copy-product\extension\assets\從mazz68收錄並拆分商品描述.md" -Destination "S:\projects\shopee-copy-product\docs\data\" -Force

# 如果 extension/assets 變空資料夾則刪除
if ((Get-ChildItem "S:\projects\shopee-copy-product\extension\assets" | Measure-Object).Count -eq 0) {
    Remove-Item -LiteralPath "S:\projects\shopee-copy-product\extension\assets" -Force
}
```

**驗證**：

```powershell
Test-Path "S:\projects\shopee-copy-product\docs\data\從mazz68收錄並拆分商品描述.md"
# 預期：True
Test-Path "S:\projects\shopee-copy-product\extension\assets\從mazz68收錄並拆分商品描述.md"
# 預期：False
```

---

### 步驟 3：新專案 — 移除不必要的 pipeline spec

`docs/spec/` 中有些 spec 是原 repo 的管線規範，與 extension 無直接關聯，留著會造成 stale duplicate。

**保留的清單**（這些被 014-spec 引用，是理解 extension 需要的上下文）：

| 檔案 | 保留原因 |
|------|---------|
| `001-plan-商品上架流程（shopee_listing_pipeline）.md` | 014 引用 |
| `012-plan-商品圖片影片與描述規範（shopee_media_description）.md` | 014 引用 |
| `013-guide-蝦皮商品描述爬取（shopee_scraping）.md` | 014 引用 |

**移除的清單**（與 extension 無直接關聯）：

| 檔案 | 移除原因 |
|------|---------|
| `011-guide-價格表資料轉換（price_list_transformation）.md` | 價格表轉換，extension 不涉及 |
| `031-商業計畫.md` | 商業計畫，非技術文件 |
| `所有非 014/015/016/021/001/012/013 的 spec` | 與 extension 無關 |

**執行命令**：

```powershell
# 刪除不必要的 spec
Remove-Item -LiteralPath "S:\projects\shopee-copy-product\docs\spec\011-guide-價格表資料轉換（price_list_transformation）.md" -Force -ErrorAction SilentlyContinue
# 如有其他非保留清單的 spec 也一併刪除
# 注意：保留 001, 012, 013, 014, 015, 016, 021
```

**驗證**：

```powershell
Get-ChildItem -LiteralPath "S:\projects\shopee-copy-product\docs\spec" | Select-Object Name
# 預期只看到：001, 012, 013, 014, 015, 016, 021
```

---

### 步驟 4：新專案 — 更新 014-spec 內的引用路徑

014-spec 原本引用原 repo 路徑（如 `__remo__/shopee-get-content/`），需改為新專案路徑。

**需要修改的引用**（在 014-spec 中搜尋）：

| 舊路徑 | 改為 |
|--------|------|
| `__remo__/shopee-get-content/` | `extension/` |
| `__remo__/_000_PROVEN_rootcause_carousel_virtual_rendering.js` | `docs/scripts/_000_PROVEN_rootcause_carousel_virtual_rendering.js` |
| `docs/spec/012-plan-...` | `docs/spec/012-plan-...`（不變，但需確認檔案存在） |
| `docs/spec/013-guide-...` | `docs/spec/013-guide-...`（不變，但需確認檔案存在） |

**檢查重點**：grep 014-spec 中所有包含 `__remo__`、`shopee/` 的路徑，改為新專案相對路徑。

---

### 步驟 5：原 repo — 將 spec 014-016 改為 stub

`S:\projects\shopee\docs\spec\014-*`、`015-*`、`016-*` 的內容已完整拷貝到新專案。為防止未來在原 repo 誤編輯這三份文件，將其內容取代為 redirect stub。

**新內容範例**（三個檔案都改成類似的 stub）：

```markdown
---
type: redirect
status: deprecated
updated: 2026-07-19
domain: shopee
tags: [redirect, moved]
---

# 本文件已遷移

此文件的完整內容已移至獨立專案：

- **新專案**：`S:\projects\shopee-copy-product`
- **新路徑**：`docs/spec/014-spec-擴充功能-chrome extension-shopee-get-content.md`
- **GitHub**：https://github.com/a0000001/shopee-copy-product

請至上述路徑查閱最新版本。本 stub 僅供歷史參考，不再更新。
```

**執行命令**：

```powershell
$stub = @'
---
type: redirect
status: deprecated
updated: 2026-07-19
domain: shopee
tags: [redirect, moved]
---

# 本文件已遷移

此文件的完整內容已移至獨立專案：

- **新專案**：`S:\projects\shopee-copy-product`
- **GitHub**：https://github.com/a0000001/shopee-copy-product

請至上述路徑查閱最新版本。本 stub 僅供歷史參考，不再更新。
'@

Set-Content -Path "S:\projects\shopee\docs\spec\014-spec-擴充功能-chrome extension-shopee-get-content.md" -Value $stub -Encoding UTF8
Set-Content -Path "S:\projects\shopee\docs\spec\015-fix-蝦皮輪播圖 virtual rendering 造成圖片不足.md" -Value $stub -Encoding UTF8
Set-Content -Path "S:\projects\shopee\docs\spec\016-fix-商品圖片PNG與重複來源.filter修補（png_dedup_filter）.md" -Value $stub -Encoding UTF8
```

---

### 步驟 6：原 repo — 將 __remo__/shopee-get-content/ 改為 redirect

```powershell
# 刪除原始 extension 檔案
Remove-Item -LiteralPath "S:\projects\shopee\__remo__\shopee-get-content" -Recurse -Force

# 建立 redirect README
$readme = @'
# shopee-get-content

此 Chrome Extension 已遷移至獨立專案：

- **新專案**：`S:\projects\shopee-copy-product`
- **新路徑**：`extension/`
- **GitHub**：https://github.com/a0000001/shopee-copy-product

本目錄已清空，請至上述路徑查閱最新版本。
'@

New-Item -ItemType Directory -Path "S:\projects\shopee\__remo__\shopee-get-content" -Force
Set-Content -Path "S:\projects\shopee\__remo__\shopee-get-content\README.md" -Value $readme -Encoding UTF8
```

---

### 步驟 7：新專案 — 更新 ARCHITECTURE.md

ARCHITECTURE.md 中的「目錄結構」章節需要反映上述變更：

- `extension/assets/` 已移除（`從mazz68` 移到 `docs/data/`）
- `docs/scripts/` 新增 `_001`、`_002`、`DIAGNOSTIC_JOURNEY.md`
- `docs/spec/` 移除不必要的 pipeline spec

**不需手動編輯**，在執行完步驟 1-3 後，用以下命令確認目錄結構，再更新 ARCHITECTURE.md 的目錄樹：

```powershell
Get-ChildItem -LiteralPath "S:\projects\shopee-copy-product" -Recurse -File | Where-Object { $_.FullName -notmatch "\\.git" } | ForEach-Object { $_.FullName.Replace("S:\projects\shopee-copy-product\", "") }
```

---

### 步驟 8：Git commit + push（兩個 repo）

**新專案 push**：

```powershell
Set-Location -LiteralPath "S:\projects\shopee-copy-product"
git add -A
git commit -m "migration: 補搬診斷腳本、修正從mazz68路徑、移除不必要的pipeline spec"
git push
```

**原 repo push**：

```powershell
Set-Location -LiteralPath "S:\projects\shopee"
git add -A
git commit -m "chore: 已拆分 shopee-copy-product 為獨立專案，spec 014-016 改為 stub、extension 原始碼改為 redirect"
git push
```

---

## 三、最終驗證清單

執行完所有步驟後，確認以下項目：

| # | 檢查項目 | 預期結果 |
|---|---------|---------|
| 1 | 新專案 `docs/scripts/` 有 4 個檔案 | `_000`、`_001`、`_002`、`DIAGNOSTIC_JOURNEY.md` |
| 2 | `extension/assets/` 已刪除 | 資料夾不存在或為空 |
| 3 | `docs/data/從mazz68收錄並拆分商品描述.md` 存在 | True |
| 4 | 新專案 `docs/spec/` 只保留 001、012、013、014、015、016、021 | 共 7 個檔案 |
| 5 | 原 repo `docs/spec/014-016` 內容已改為 stub | 內容為 redirect 訊息 |
| 6 | 原 repo `__remo__/shopee-get-content/` 只剩 README.md | 原程式碼已刪除 |
| 7 | 新專案 `chrome://extensions` 載入 `extension/` 可正常運作 | 載入無錯誤 |
| 8 | 隱私權政策頁面可訪問 | https://a0000001.github.io/shopee-copy-product/privacy/ 正常顯示 |
| 9 | 兩個 repo 均已 push | git log 顯示最新 commit |

---

## 四、可能遇到的問題

### 4.1 路徑有中文

PowerShell 對中文路徑支援良好，但若使用 WSL 或 git bash 可能遇到編碼問題。一律在 PowerShell 中執行。

### 4.2 git push 需要權限

GitHub token 在 `S:\projects\shopee-copy-product\.env`：

```
GITHUB_TOKEN=your_token_here
GITHUB_USER=a0000001
```

若 token 過期，請至 https://github.com/settings/tokens 重新產生（需 scope: `repo` 或 `public_repo`）。

### 4.3 原 repo 可能有未 push 的變更

在步驟 6 修改原 repo 前，先確認：

```powershell
Set-Location "S:\projects\shopee"
git status
```

若有不相關的未提交變更，不要連帶 commit。只 commit 與 migration 相關的檔案。

---

## 五、相關文件

| 文件 | 位置 | 用途 |
|------|------|------|
| 遷移計畫（本文件） | `docs/spec/099-plan-遷移計畫（migration_plan）.md` | 步驟說明 |
| 專案架構 | `ARCHITECTURE.md` | 新專案架構總覽 |
| 變更歷史 | `CHANGELOG.md` | 所有歷史 commit |
| 歷史對照 | `REFERENCE.md` | 原 repo 路徑對照與 commit 清單 |
| 上架檢查清單 | `docs/spec/021-guide-上架審查工具與檢查清單（chrome_web_store_publish）.md` | Chrome Web Store 發布資訊 |
| 主 Spec | `docs/spec/014-spec-擴充功能-chrome extension-shopee-get-content.md` | Extension 功能與架構細節 |
