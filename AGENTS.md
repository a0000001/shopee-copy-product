# AI Agent Safety & Code Architecture Guidelines

## ⚠️ CRITICAL MANDATORY RULES (NEVER BREAK)

1. **Product Scan Pagination Loop (Spec 024)**:
   - `extractSellerProductList()` in `extension/lib/seller-list.js` and `scanProducts()` in `extension/batch-upload.js` MUST ALWAYS preserve the `page_number=1..N` loop for all list_types (`live_all`, `reviewing`, `unpublished`, etc.).
   - NEVER replace the loop with a single-page `fetch` (which only retrieves 48 items).
   - AFTER editing any extension script, ALWAYS run `node scripts/verify-scan-loop.js` to verify compliance.

2. **Deduplication Title Normalization (Spec 045)**:
   - `isExistingProduct()` and `stripHashtag()` MUST ALWAYS use `normalizeTitle()` with `NFKC` normalization.
