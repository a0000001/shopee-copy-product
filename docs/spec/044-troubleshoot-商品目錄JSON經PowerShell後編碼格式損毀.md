# 044 - Troubleshoot：商品目錄 JSON 編碼格式損毀（假性異動）

## 當前問題

`product-catalog-tw.json` 在經過 PowerShell 的 `ConvertTo-Json | Set-Content -Encoding UTF8` 處理後，檔案變成：

| 項目 | 修改前（HEAD） | 修改後（工作目錄） |
|---|---|---|
| 編碼 | UTF-8 **無 BOM** | UTF-8 **有 BOM**（3 bytes: EF BB BF） |
| 行數 | ~10,350 行 | ~10,654 行（+304 行） |
| 檔案大小 | 882,872 bytes | 1,090,046 bytes |
| 換行格式 | LF（git 標準） | CRLF（Windows 預設） |

### 具體現象

- **SourceTree**：顯示該檔案有變更，但 try stage 時可能出現「no changes detected」或無法正常 unstage
- **git diff**：21004 行變動（10654 插入 + 10350 刪除），幾乎整份檔案都被重寫
- **JSON 內容是正確的**：207 個商品、所有資料值 intact，PowerShell 可正常 `ConvertFrom-Json`

## 根因分析

### 直接原因：PowerShell 5.1 的 `ConvertTo-Json` + `Set-Content` 行為

```powershell
$json | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $filePath -Encoding UTF8
```

1. **`ConvertTo-Json`** — 不管原始 JSON 的排版（縮排 2 格還 4 格、欄位順序），一律用自己的規則重新排版，導致整份檔案的每一行都可能有差異
2. **`Set-Content -Encoding UTF8`** — PowerShell 5.1 的 `-Encoding UTF8` **一定會加 BOM**（3 bytes 的 EF BB BF），而原始檔案是 UTF-8 without BOM
3. **CRLF vs LF** — `git config core.autocrlf = true` 使 git 在 checkout 時自動轉 LF→CRLF，但原始 commit 存的其實是 LF

### 為何這形成「假性異動」

對 git 來說，這 3 個差異讓它「看到」每一行都變了：

```
HEAD:     {"ps_product_name": "Wan2.2-SVI2-Pro-remix...\n
Working:  {"ps_product_name": "Wan2.2-SVI2-Pro-remix...\r\n
```

即使字面上內容完全相同，結尾的 `\r\n` vs `\n` 就讓 git 認為該行不同。

## 對上傳的影響

**「重複商品」錯誤與編碼問題無關**，因為：
- 上傳工具讀取 JSON 時，`ConvertFrom-Json` 會正常解析（BOM 不影響 JSON 解析）
- 商品識別欄位（SKU、名稱、價格、網址）完全沒動

但有以下**潛在風險**：
- 若上傳工具對 JSON 做 checksum / hash 比對來判斷是否已上傳，則格式重整會導致全部被視為「新檔案」
- 若上傳工具依賴欄位順序，則 `ConvertTo-Json` 改變順序可能造成讀取異常

## 建議處理方式

### ❌ 不建議直接 Discard（捨棄變更）

如果 discard，所有對 `power` 欄位的更新都會遺失（207 個商品的電源建議修正）。

### ✅ 建議修復方式

將檔案重新寫回 UTF-8 **without BOM**，行尾保留 CRLF（或統一為 LF）：

```powershell
# PowerShell 5.1：用 UTF8 without BOM 寫回
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($filePath, $jsonString, $utf8NoBom)
```

或用 Node.js 處理（更可靠）：

```powershell
node -e "const fs=require('fs'); const d=JSON.parse(fs.readFileSync('docs/data/product-catalog-tw.json','utf8')); fs.writeFileSync('docs/data/product-catalog-tw.json', JSON.stringify(d,null,2), 'utf8')"
```

Node.js 的 `JSON.stringify` 不會加 BOM、使用 LF 行尾，且排版一致。

### 修復後的驗證

```powershell
git diff --stat HEAD  # 應只剩 power 欄位的實際變動行
```

## 參考資料

- [PowerShell `Set-Content -Encoding UTF8` 必加 BOM 的已知行為](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.management/set-content)
- [Node.js `JSON.stringify` 輸出無 BOM 的 UTF-8](https://nodejs.org/api/fs.html#fswritefilesyncfile-data-options)
