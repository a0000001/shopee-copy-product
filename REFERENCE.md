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
