# AI Agent Safety & Code Architecture Guidelines

## ⚠️ CRITICAL MANDATORY RULES (NEVER BREAK)

1. **Product Scan Main World Pagination Loop (Spec 024 & Spec 048)**:
   - `scanProducts()` in `extension/batch-upload.js` MUST ALWAYS use `chrome.scripting.executeScript` (Main World) with `page_number=1..N` loop for all list_types (`live_all`, `reviewing`, `unpublished`, etc.).
   - `extractSellerProductList()` in `extension/lib/seller-list.js` MUST ALSO preserve the `page_number=1..N` loop.
   - NEVER replace the Main World loop with a single-page `fetch` or Isolated World fetch only.
   - AFTER editing any extension script, ALWAYS run `node scripts/verify-scan-loop.js` to verify compliance.

2. **Deduplication Title Normalization (Spec 045)**:
   - `isExistingProduct()` and `stripHashtag()` MUST ALWAYS use `normalizeTitle()` with `NFKC` normalization.
