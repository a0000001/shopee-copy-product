# 參考資訊

## Git 歷史

本專案由 `S:\projects\shopee` 拆分獨立，檔案在此之前的所有 git 紀錄留在原 repo：

- **原 repo**: `S:\projects\shopee` (https://github.com/a0000001/shopee)
- **搬移日期**: 2026-07-19
- **搬移範圍**: 所有與 Shopee Copy Product Chrome Extension 相關的檔案

若要查閱搬移前的 commit 歷史，請至原 repo 執行：

```bash
git log --follow -- docs/spec/014-spec-擴充功能-chrome\ extension-shopee-get-content.md
git log --follow -- __remo__/shopee-get-content/
```

## 檔案來源對照

| 新路徑 | 原路徑 |
|--------|--------|
| `extension/` | `shopee/__remo__/shopee-get-content/` |
| `docs/spec/014-*` | `shopee/docs/spec/014-*` |
| `docs/spec/015-*` | `shopee/docs/spec/015-*` |
| `docs/spec/016-*` | `shopee/docs/spec/016-*` |
| `docs/spec/021-*` | `shopee/docs/spec/021-*`（本專案建立） |
| `extension/assets/從mazz68收錄並拆分商品描述.md` | `shopee/docs/data/從mazz68收錄並拆分商品描述.md` |
| `docs/scripts/_000_PROVEN_*` | `shopee/__remo__/_000_PROVEN_*` |
| `docs/data/mcp devtools 蒐集的蝦皮資料/` | `shopee/docs/data/mcp devtools 蒐集的蝦皮資料/` |

## 完整 Commit 歷史（按時間序）

原 repo 中所有影響 extension 的 commit，commit hash 保留供交叉參考：

### 2026-07-18

| Commit | 時間 | 訊息 |
|--------|------|------|
| `52f8839` | 18:16 | feat: Chrome Extension Shopee Get Content（Spec 014） |
| `58f873b` | 18:21 | fix: 實測後修正 5 項 bug + 新增 AI 按鈕 |
| `05a5fdb` | 18:38 | fix: isProductImg() 過濾 DOM 小圖與賣場 logo |
| `cf0ba1a` | 18:47 | fix: isProductImg() 改為語意過濾，移除寬高限制 |
| `8778638` | 18:52 | fix: DOM 圖片僅取 mdCA_C/uRJsr5 縮圖區 |
| `5ce4247` | 19:03 | fix: 價格 aria-live 選擇器、圖片 supplement |
| `d15f875` | 19:19 | fix: JSON-LD 層補抓懶載入圖片 |
| `9e15688` | 19:23 | fix: JSON-LD 僅取 images、支援 @graph |
| `5c373b4` | 19:25 | fix: API 總是呼叫補圖、描述保留斷行 |
| `395d147` | 19:29 | fix: 描述 CSS pre-wrap、DOM loop .png 過濾 |
| `4c83e69` | 19:32 | fix: API 加 X-Requested-With+v2 備援 |
| `b83ac1b` | 20:20 | feat: 右鍵另存為 .JPG + OffscreenCanvas 實轉 |
| `7910ae1` | 20:36 | fix: context menu 無反應；啟動即註冊 |
| `e6839e6` | 20:38 | fix: URL.createObjectURL SW 不可用 |
| `3a0eaf8` | 20:48 | fix: context menu 資料夾名去尾綴 |
| `60b3388` | 20:51 | fix: safeName 改用 safeFolderName |
| `8aec0e0` | 21:39 | checkpoint: 解決下載與剪貼簿垃圾文字 |
| `2971c67` | 23:53 | feat: 新增賣家編輯頁標題填入 |

### 2026-07-19

| Commit | 時間 | 訊息 |
|--------|------|------|
| `18c3e54` | 00:21 | feat: 一鍵填入所有欄位 |
| `c68a51d` | 00:34 | feat: 改為從剪貼簿直接填入 |
| `5c213e9` | 00:35 | feat: 品牌下拉選單 eds-selector |
| `2c9a899` | 00:39 | fix: 強化欄位搜尋 Vue 3 scoped label |
| `e4c9af3`~`543043e` | 00:39~00:42 | Revert 系列 x3 |
| `6f246a2` | 00:43 | fix: TreeWalker 搜尋 label |
| `77aeffa` | 00:50 | docs: 類別依賴發現 |
| `a669032`~`5cf6086` | 00:54~00:57 | Revert 系列 x2 |
| `1716b5c` | 01:25 | 修復：重構賣家頁自動填入 |
| `d783d41` | 01:31 | checkpoint: 類別/品牌/媒體自動化 |
| `5efbdb4` | 03:49 | fix: merge all image sources + LOGO filter |
| `ecef0c9` | 13:27 | fix: carousel virtual rendering 圖片不足 |
| `2f59cbe` | 13:46 | fix: triggerCarouselFullRender 選擇器 |
| `e631edf`~`0d17f7b` | 14:05~14:11 | closeCarouselPopup 嘗試失敗 |
| `a2e290b` | 15:38 | fix: 買家頁頭像漏網 |
| `03e36d6` | 15:42 | fix: collection-time PNG magic number check |

### 作者

所有 commit 作者：`PC2\micha <remotac@gmail.com>`
