# AI Agent Safety & Code Architecture Guidelines

## ⚠️ CRITICAL MANDATORY RULES (NEVER BREAK)

1. **資料 Schema 存取通用規範 (Spec 018 & Spec 048)**:
   - 修改或新增任何資料欄位存取前，必須先開啟 `docs/data/product-catalog-tw.json` 檢視真實 Key 清單（例如 `images`, `ps_item_cover_image`, `ps_product_name`）。
   - 嚴禁憑記憶或主觀推測命名屬性名稱（例如禁止使用虛構的 `ps_product_media`）。
   - `batch-upload.js` 傳送給 `uploadMedia` 的 payload 必須為整顆原生商品物件 `data: item`。
   - 編輯完成後，必須執行 `node scripts/verify-catalog-schema.js` 校驗合規性。

2. **Product Scan Main World Pagination Loop (Spec 024 & Spec 048)**:
   - `scanProducts()` in `extension/batch-upload.js` MUST ALWAYS use `chrome.scripting.executeScript` (Main World) with `page_number=1..N` loop for all list_types (`live_all`, `reviewing`, `unpublished`, etc.).
   - `extractSellerProductList()` in `extension/lib/seller-list.js` MUST ALSO preserve the `page_number=1..N` loop.
   - AFTER editing any extension script, ALWAYS run `node scripts/verify-scan-loop.js` to verify compliance.

3. **Deduplication Title Normalization (Spec 045)**:
   - `isExistingProduct()` and `stripHashtag()` MUST ALWAYS use `normalizeTitle()` with `NFKC` normalization.
