---
type: plan
status: draft
updated: 2026-07-18
domain: shopee
tags: [shopee, listing, pipeline, ai-audit, content-generation, image-processing]
---

# 蝦皮商品上架自動化流程 — 從圖稿檢查到 AI 補圖補文上架

> 93 個 AI 商品資料夾，多數缺商品描述、圖片格式不一、缺少規格說明。
> 目標：AI 自動檢查缺失 → AI 補內容 → AI 補圖 → 輔助上架。

---

## 零、已完成

### #completed

| 項目 | 狀態 |
|------|------|
| 價格表解析 | ✅ 完成（179 筆唯一商品，已去重、去 emoji） |
| JSON 結構化 | ✅ `docs/product-catalog.json`，含 `product_name` / `price_twd` / `tag` / `nsfw` |
| 多語系轉換 | ✅ zh-TW / en / ms 三語系（品名 + 標籤） |
| 腳本歸檔 | ✅ 解析腳本移至 `docs/scripts/` |
| Phase 1 完整盤點 | ✅ 94 商品資料夾，產出 `audit-report.csv` + `missing-report-商品缺失盤點.md` |
| 圖片/影片/描述規格書 | ✅ `spec/012-plan-商品圖片影片與描述規範（shopee_media_description）.md` |
| PNG→JPG 轉換 | ✅ 批次腳本 `scripts/convert_png_to_jpg.bat`，已轉 390 張，剩 18 張略過（JPG 已存在） |
| 蝦皮爬取指南 | ✅ `spec/013-guide-蝦皮商品描述爬取（shopee_scraping）.md` |
| 爬蟲腳本（v1 API） | ✅ `scripts/scrape_shopee.py` |
| 爬蟲腳本（v2 Playwright） | ✅ `scripts/test_shopee_api.py` |
| 商品 ID 提取（40 個） | ✅ 從 DOM 擷取 item_id / 名稱 / 價格 / 評分，存於 `data/shopee-item-ids.json` |
| API 探索（22 個 endpoint） | ✅ 紀錄在 `data/shopee-api-capture.json` |
| WAF 阻擋確認 | ✅ 確認所有 v4 API（search_items, item/get, pdp/get_pc）回傳 403/90309999 |

---

## 一、現況盤點

### #current-state-overview

| 項目 | 數據 |
|------|------|
| 商品資料夾總數 | 93 |
| 已有「商品描述.md」 | 1（僅 Anydoor） |
| 已有載點.txt | ~15 |
| 已有說明.txt | ~8 |
| 圖片格式 | 混雜 .png / .jpg / .webp / .jpeg |
| 商品分類 | 涵蓋換衣、換臉、影片生成、語音合成、音樂、命理、去浮水印、18+ 等 |
| 價格資料 | ✅ 已結構化至 `docs/product-catalog.json` |

### #product-categories

93 個商品可歸為以下類別：

| 類別 | 數量（約） | 範例 |
|------|-----------|------|
| 換衣/換裝/換臉 | 10+ | Anydoor, IMAGDressing, FLUX, AI換衣, Deepfacelive, FaceFusion |
| 影片生成 | 15+ | FramePack, CogVideoX, Wan2.2, LTX, Kandinsky |
| 圖片生成/編輯 | 10+ | Z-Image, SANA-Sprint, CreArt, FireRed, GLM-Image |
| 語音/配音/變聲 | 8+ | VibeVoice, RVC, TTS2, MOSS-TTS, Voice Changer |
| 音樂生成 | 3+ | HeartLib, ACE-Step, SongGeneration |
| 數字人/口型同步 | 5+ | Heygem, MuseTalk, infintetalk, AniPortrait |
| 影片處理（去浮水印/修復/去碼） | 8+ | MiniMax-Remover, Anime4KCPP, 去碼 |
| 實用工具 | 8+ | STranslate, OfficeAI, LibreTranslate, RWKV Runner |
| 命理占卜 | 3+ | AI 賦能的東方命理, AI占卜系統 |
| 18+ 成人 | 5+ | 成人抖音, Pony Diffusion, NSFW 相關 |
| 其他 | 10+ | ComfyUI, 工作流教學, 圖, 其他 |

---

## 二、核心流程（三階段）

### #phase-1-audit

**Phase 1：AI 自動檢查（Inventory Audit）**

對每個商品資料夾執行：

```
檢查清單：
□ 商品名稱（從資料夾名稱擷取）
□ 圖片數量是否足夠（建議 ≥ 5 張）
□ 圖片格式（全部轉換格是成為 .jpg，< 2MB）
□ 是否有「商品描述.md」或等效文案
□ 是否有載點/下載連結，沒有的話只記錄暫不補充
□ 是否有分類標籤
□ 是否有電腦規格（由AI根據產品生成，能使用該產品的電腦建議規格跟最小規格）
□ 先以繁體中文、英文規劃，讓結構相容多國語言
```

**輸出**：一份缺失報表，列出每個商品缺少哪些項目，作為AI工作用的tasks。

### #phase-2-generate

**Phase 2：AI 補內容（Content Generation）**

針對缺失項目自動生成：

| 缺失項目 | AI 生成方式 |
|---------|------------|
| 商品描述 | 根據資料夾名稱、現有圖片內容、功能描述，生成蝦皮風格商品文案 |
| AI 初稿注意 | 依照 Notion 規範：不要包入 AI 說明前後文，這點要在AI生成文案的題示詞預防，生成後要AI審查 |
| 圖片不足 | 標記需要補拍的圖片類型（如規格圖、應用場景圖） |
| 分類標籤 | 根據功能自動推斷 |
| 多國語言 | 英文版文案（至少除了繁體中文也要有英文） |

**模板**：固定區塊（依 Notion 計劃）

```
📦 購買須知（重要！請務必閱讀）
硬體相容性檢測工具連結
本地端模型顯卡需求說明
雲端載點提供方式
貨到付款流程說明
退換貨政策（虛擬商品恕不退換）
#Tags
```

### #phase-3-list

**Phase 3：上架準備（Listing Preparation）**

| 步驟 | 內容 |
|------|------|
| 圖片統一轉 JPG | 全轉 JPG，確保每張 < 2MB |
| 圖片重新命名 | 規則：`[商品名稱]_[序號].jpg` |
| 商品分類對應 | 對應蝦皮實際類目，全部都為：3C與筆電>電腦周邊配件>軟體/服務 |
| 價格設定 | 優先參考總店（mazz68）價格一覽表（若缺失則由 AI 決定） |
| 規格設定 | 電腦規格（AI 決定） |
| 生成上架稿 | 包含所有欄位的 JSON / CSV |

---

## 三、Pipeline 執行方式

### #execution-mode

每階段獨立執行，可單獨重跑：

```bash
# Phase 1：檢查所有商品
> AI 執行 audit 腳本 → 產出缺失報表

# Phase 2：補內容（可指定單一商品或批量）
> AI 讀取缺失報表 → 逐一生成補內容

# Phase 3：上架準備
> AI 統一處理圖片 + 生成上架資料
```

### #product-priority

建議優先順序（從最成熟的上架）：

1. **Anydoor**（已有 `商品描述.md`，最完整）
2. **換衣/換臉類**（有圖有影片，轉換率高）
3. **影片生成類**（FramePack, Wan2.2 等熱門）
4. **語音變聲類**（工具型，易於描述）
5. 其餘依此類推

---

## 四、檔案結構規範

### #directory-standard

每個商品資料夾最終應包含：

```
[商品名稱]/
├── images/              # 商品圖片（統一 .jpg）
│   ├── 001.jpg         # 主圖
│   ├── 002.jpg         # 功能圖
│   ├── 003.jpg         # 應用場景
│   ├── 004.jpg         # 規格說明
│   └── 005.jpg         # 其他
├── videos/              # 展示影片（選配）
├── 商品描述.md           # 商品文案（Markdown）
├── 載點.txt              # 下載連結
└── listing.json         # 上架用結構化資料（自動生成）
```

### #naming-convention

商品資料夾名稱盡量保持簡潔，以蝦皮搜尋友善為原則：

```
❌ 【AI视频】最强AI生成视频，FramePack-V1.2整合包，支持首尾帧视频...
✅ FramePack V1.2 - AI影片生成整合包
```

---

## 五、產出物

### #deliverables

每輪執行完成後產出：

| 產出 | 格式 | 說明 |
|------|------|------|
| 缺失報表 | `.md` | 每個商品缺少什麼，一目了然 |
| 商品描述 | `.md` | 寫入各商品資料夾 |
| 整理後圖片 | `.jpg` | 統一格式壓縮後 |
| 上架資料 | `.json` | 結構化資料，可匯入或複製貼上 |

---

## 六、已知阻擋

### #blockers

| 阻擋項目 | 影響 | 狀態 |
|---------|------|------|
| **Shopee WAF 阻擋（IP + Header 驗證）** | 所有 v4 API（search_items, item/get, pdp/get_pc 等）回傳 403/90309999 | 🔴 需乾淨 IP 與正確 headers |
| **Product Page CAPTCHA** | Playwright 導航至商品頁 → 觸發 Traffic Verification（`/verify/captcha`） | 🔴 無法繞過 |
| **分類商品列表 API** | `get_shop_category_items` 回 `error_not_found`，無法透過分類遍歷商品 | 🔴 無效 |
| **shop page 僅顯示 40 個商品** | 賣場有 204 個商品但首頁只載入展示商品，需滾動/分類標籤切換才載入更多 | 🟡 可嘗試自動滾動 |

### 當前可行方案

| 方案 | 難度 | 可獲得資料 |
|------|------|-----------|
| 🅰 真實瀏覽器 CDP 連線（`connect_over_cdp`） | 低（需使用者開啟 Chrome remote debugging） | 完整商品描述（待測試） |
| 🅱 Playwright DOM 提取（已實作） | 低 | 40 個 item ID + 名稱 + 價格 |
| 🅲 使用者手動複製描述 | 中（逐頁開） | 完整描述 |
| 🅳 AI 直接生成描述 | 高（需訓練/提示詞優化） | 無需爬取 |

---

## 七、待確認事項

### #open-questions

- 蝦皮賣場名稱 / 賣家身份（誰的帳號上架？）
- 定價策略（單一價 / 分類定價？）
- 是否要分多個賣場上架（一般商品 vs 18+ 分開？）
- 蝦皮類目對應（每個商品屬於哪個類目？）

### #resolved

| 問題 | 決議 |
|------|------|
| 多國語言必要性 | ✅ 三語系：zh-TW（繁體中文）/ en（英文）/ ms（馬來文），已寫入 `product-catalog.json` |
| 價格來源 | ✅ 以 `總店（mazz68）價格一覽表.md` 為 SSOT，已轉為結構化 JSON |

---

## 相關文件

- Notion 計劃：[先整理 蝦皮商品圖稿](https://app.notion.com/p/3a0daea3fdea80d6a324d3d4af85fc5b)
- 商品圖稿目錄：`E:\proj\shopee\蝦皮商品圖稿\`
- 價格表 JSON：`docs/data/product-catalog.json`（179 筆，3 語系）
- 盤點報表：`docs/data/audit-report.csv`（94 資料夾完整統計）
- 缺失盤點：`docs/data/missing-report-商品缺失盤點.md`（tasks 格式，分 P0~P3 優先級）
- 圖片/影片/描述規格：`docs/spec/012-plan-商品圖片影片與描述規範（shopee_media_description）.md`
- PNG→JPG 轉換腳本：`docs/scripts/convert_png_to_jpg.bat`
- 解析腳本：`docs/scripts/transform_prices.js`
- 資料轉換經驗：`docs/spec/011-guide-價格表資料轉換（price_list_transformation）.md`
- SSOT 命名規範：`S:\projects\share\docs\spec\001-rule-SSOT-文件命名與撰寫規範.md`
