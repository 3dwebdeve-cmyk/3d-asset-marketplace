# Packages pipeline: execution plan (5 phases)

Source: `BACKEND_CHANGES_PROMPT_PACKAGES.md` (called **PKG** below, section numbers `§`), and the
parts of `E:\ABHAY\MaxPlugin\BACKEND_CHANGES_PROMPT_NEW_CATEGORY.md` (called **CAT**) that PKG does
not replace. PKG says it replaces the earlier packages prompt. Its §3b replaces CAT's name-based
category rule with a code-based one. CAT's other details (fields, endpoints, console screens,
tests, ops notes) are kept here. Where the two disagree, see **Decisions** at the end.

Every PKG and CAT item appears in exactly one phase. The table at the end maps each section to
its phase.

---

## Checked against the code (2026-11-16, branch `main` @ ac31d08)

PKG §0's five refusal causes are confirmed:

| # | Confirmed in code |
|---|---|
| 1 | `_build_media_pointers` accepts only `{prefix}package.zip` and `{prefix}{sku}.zip` → `invalid_object_key` (field `package_key`) |
| 2 | `_gate_item` requires `glb_checksum` (`missing_glb_checksum`) and `media.preview_key` (`missing_preview`) |
| 3 | `ProductService._validate_publish_ready` requires `preview_model` (used by QA Approve and Publish) |
| 4 | `resolve_category` matches `name__iexact` among active categories only; else `category_unmapped` |
| 5 | `_sync_package` deletes every non-preview `ProductFile` and creates one |

Extra findings PKG does not mention. Each is handled in the phase noted:

- **E1.** `_gate_item` also runs `exports_incomplete`. A row needs `package_formats` with a
  non-GLB format, or the old `exports` block. If Model ID Tool 1.8.x does not send
  `package_formats`, every row is refused here too. Phase 2 confirms this from a real payload.
- **E2.** `_build_media_pointers` always normalises `preview_key` and hard-codes
  `has_preview: True`, and `_check_preview` always runs. Both must become conditional for
  360-only models (Phase 2).
- **E3.** `_validate_publish_ready` already refuses an **inactive** category ("Category not found
  or inactive."). A pending category is therefore already blocked. Phase 2 only adds the clear
  message.
- **E4.** `user_owns_catalog_item` is also used in `orders/services.py`. PKG §7's caller list
  leaves it out, but its checkout step covers it (Phase 4).
- **E5.** `REASON_HELP` exists only in the frontend (`UploaderImportsPanel.tsx`, 15 codes). The
  panel reads `skipped_reasons` as `{model_id: reason}`, with no model name. PKG §9 needs the
  reason table in the backend and the name in the audit metadata (Phase 2).
- **E6.** `PRODUCT_SKU_REGEX` is permissive (`^[A-Z0-9][A-Z0-9_-]*$`). The new category-code rule
  (`^[A-Z]{2,5}$` before the first `-`) is new and applies to new products only (Phase 2).
- **E7.** Next migration numbers: `products/0016_packages`, `categories/0003_...`.
- **E8.** The free download (`ProductFreeDownloadView`) uses
  `files.filter(is_preview=False).order_by("-created_at").first()`, as PKG says (Phase 4).
- **E9.** `R2_SIGNED_URL_EXPIRY` defaults to 60 in `settings.py`. CAT says Render may still have
  300; check Render (Phase 5).
- **E10.** `entrypoint.sh` already runs `createcachetable` after `migrate` (commit cd285fc). CAT's
  "other thing" #2 and PKG §13's second bullet are done.
- **E11.** CAT "still open #4" (a product at 0.00 can be approved; a re-import resets an
  admin-set price) looks fixed by the pricing pipeline: `awaiting_price`, and
  `console_text_kept` on re-import. Phase 1 re-checks it with a test before building on it.

---

## Global rules (PKG §10, apply in every phase)

1. **One list of package kinds**: `PACKAGE_KINDS`, `PACKAGE_LABELS`, `PACKAGE_ORDER` (plus one
   contents/description text per kind) in `backend/products/packages.py`. Every loop over
   packages uses it: import, pricing, cart, checkout, downloads, serializers. Never write the
   list again anywhere (frontend: read the labels and order from the API or one shared TS
   constant generated from it, never a second hand-typed list).
   `PACKAGE_KINDS = ("glb_only", "with_light_rig", "without_light_rig", "environment", "whole")`.
2. **Loops, not copies.** The gate, the package writer, the publish check, the serializer, the
   ownership check and the free download each use one loop over the package rows.
3. **Delete what is replaced, in the same change** (each phase lists its deletions). Confirm with
   `grep` that each removed name has no remaining user.
4. **No legacy branches**, except the migration's data step and the blank-kind rule for old
   order lines.
5. **No new helper for one use.** Add a function only when two or more places need it.
6. **No commented-out code, no `TODO` without a ticket, no unused imports, no unused serializer
   fields.** Run the linter and `vulture` (or equivalent) on the changed files, and remove what
   they report as unused unless it is an API field the frontend reads.
7. **Tests for every new function**, in the style of `test_catalog_import.py`,
   `test_pricing_api.py`, `test_downloads.py` and `test_orders.py`.
8. Tests run with `manage.py test` (R2 is off in tests). Never run the local stack against
   `backend/.env` (real R2). Override `STRIPE_SECRET_KEY` with a non-blank placeholder.
9. Work on one branch from `main`, `feature/packages`, with one commit (or more) per phase. See
   Decision D3 for when it may be merged.

---

## Phase 1: Foundation (constants, data model, migrations)

**Goal:** the database can hold up to five priced packages per model, and new categories with a
code and an approval state. Nothing visible changes yet. Existing products, carts and orders
keep working.

**Covers:** PKG §4, §2 (constants part), §3b (category fields), §3c rule 2; CAT §1.

### 1.1 `backend/products/packages.py` (new)
- `PACKAGE_KINDS` (above), `PACKAGE_LABELS` ("GLB Only", "With Light Rig", "Without Light Rig",
  "With Environment", "Whole File"), `PACKAGE_ORDER`, and one contents/description text per kind.
- Small shared helpers only when two places need them, for example "the expected key for
  `(prefix, sku, kind)`" = `{prefix}{sku}_{kind}.zip`. Both the gate and the migration use it.

### 1.2 `ProductFile` becomes the package row (no second model)
- `package_kind`: CharField, choices from `PACKAGE_KINDS`, blank for preview rows.
- `price`: Decimal, nullable. `discount_price`: Decimal, nullable. `discount_ends_at`: DateTime,
  nullable.
- Unique constraint on `(product, package_kind)` for rows with `is_preview=False` and
  `package_kind` set (conditional `UniqueConstraint`).

### 1.3 `PricedMixin` (one shared price class)
- Move `active_discount_price`, `effective_price` and the sale-end logic out of `Product` into an
  abstract `PricedMixin`. `Product` and `ProductFile` both inherit it. Do not copy the methods.

### 1.4 `Product.price` / `discount_price` / `discount_ends_at` become a summary
- One function, `sync_summary_price(product)`, is called after every package change:
  - `price` = the lowest regular price among the priced packages;
  - `discount_price` / `discount_ends_at` = the sale of that same package;
  - `0` for free models.
- This keeps the price filters, sorting, the `price` index and `is_free` working. Nobody types
  these fields any more; the admin product form shows the package prices instead (the form
  change is in Phase 3).

### 1.5 Carry the kind through (blank = legacy)
- `CartItem.package_kind` and `OrderItem.package_kind`: blank means "bought before packages
  existed", which entitles the buyer to **every** package of that product.
- Add `package_kind` to `unique_cart_line_item` and `unique_order_line_item`, so one cart or order
  can hold two packages of one model.
- `ProductPriceChange.package_kind`, so the history says which package changed.
- Plugin lines keep a blank package kind (PKG §14).

### 1.6 Category fields (`backend/categories/models.py`)
- `code`: `CharField(max_length=5, unique=True, null=True, blank=True)`, validated with
  `^[A-Z]{2,5}$`. Blank (null) means no code yet.
- `pending_approval`: `BooleanField(default=False)`. True only for categories created by an import
  and not yet approved. A pending category is always saved with `is_active=False`.
- `created_by_import`: `BooleanField(default=False)`, kept for history and audit (CAT).
- `created_from_batch`: `CharField(max_length=128, blank=True)`, the import batch that created it.
- Index on `pending_approval` (CAT).
- The migration only adds the columns (PKG §3b): no data step for categories.

### 1.7 Migration `products/0016_packages` (one file)
1. Add the fields above (ProductFile, CartItem, OrderItem, ProductPriceChange).
2. Data step: for every product with a non-preview file, set that file's `package_kind` from the
   file name (`..._whole.zip` → `whole`; old `<ID>.zip` / `package.zip` → `whole`), and copy the
   product's `price` / `discount_price` / `discount_ends_at` into it. (See Decision D6 for paid
   products still at the 0.00 placeholder.)
3. Product `CartItem` lines become `whole`. `OrderItem` lines keep blank (legacy = all packages).
4. Run `sync_summary_price` for every product.

Categories get their own migration, `categories/0003_...`, with columns only.

### 1.8 Tests (PKG §11 #13, plus the mixin)
- The migration, on a database with one old zip, gives one `whole` row with the old price, and the
  old cart and order lines still work.
- `PricedMixin`: an ended sale is never active on a product or on a package (same tests, both
  classes).
- `sync_summary_price`: lowest priced package wins, its sale follows, free = 0, unpriced rows
  ignored.
- The unique constraints: two rows of the same kind are refused. Two cart and order lines of the
  same product with different kinds are allowed.
- Category: two categories cannot share a code; the code validator refuses lower-case letters
  and more than five letters.
- E11 check: a 0.00 paid model cannot be published, and a re-import keeps an admin-set price.
  Already covered by the existing tests (`test_e2e_pricing_journey` test 7,
  `test_pricing_review_fixes`, and the `console_text_kept` tests in `test_catalog_import`), so
  no new test was added.

**Phase 1 is done when** all existing tests still pass, plus the new ones.

---

## Phase 2: Import, categories, refusals (models reach the QA queue)

**Goal:** every model the tool sends with a preview **or** a 360, and one to five zips, is
created and reaches the QA queue. If it is refused, the admin sees why and what to do. New
categories wait for approval. QA can approve a 360-only model; paid models then wait for price.

**Covers:** PKG §0, §1 (steps 1-3, 2b), §2, §3, §3b, §3c (import rules 1, 3, 6, 7), §5 (publish
rule), §8 (QA page parts), §9; CAT §2-§6 (as amended by PKG §3b).

### 2.1 Confirm the real payload first (E1)
- Get one real Model ID Tool 1.8.x / Model Uploader 1.2.1 request body (RacingGamingChair). Check
  that it has `package_formats` (or `exports`), `media.packages`, `media.package_key`,
  `spin_keys`, `thumbnail_key` and `price: "0.00"`. Save it, without secrets, as a fixture in
  `docs/fixtures/batch-ingest/`.

### 2.2 Accept the zip names (PKG §2) in `_build_media_pointers`
- Replace the two hard-coded names with one loop over `media.packages`. Each entry's key must
  equal `{prefix}{sku}_{kind}.zip`, where `prefix` is the row's `r2_key_prefix`
  (`models/<sku>/` or `free-models/<sku>/`).
- `media.package_key` keeps working as the main zip. The tool sets it to `..._whole.zip` or the
  first package it made, and it must be one of the listed keys.
- The old `package.zip` / `<sku>.zip` names are accepted only by the Phase 1 migration, not by
  new imports.
- `preview_key` is optional (E2). Normalise and check it only when sent. `has_preview` reflects
  whether one was sent.

### 2.3 The import contract (PKG §3)
- `media.packages`: one entry per zip, each with `kind`, `label`, `key`, `file_name`,
  `file_format`, `file_size`, as in PKG §3's JSON.
- `media.spin_keys` (36 frames) and `media.preview_key` (GLB) are both optional, but a model needs
  at least one of them (`missing_preview` otherwise). `glb_checksum` is required only when there
  is a `preview_key`.
- `price` is still the `"0.00"` placeholder for paid models; prices are set on the website.
- Drop the product-level `discount` fields from the import (deleted, §10 rule 3).
- Serializer: accept `media.packages`, with a cap like `gallery_keys` (a malformed list skips the
  row, it does not fail the batch).

### 2.4 Gate, in this order (`_gate_item`, one loop each)
1. Keep every existing check that still applies. Remove the `glb_checksum` and `preview_key`
   requirements, and replace them with "a preview **or** exactly 36 `spin_keys`"
   (`missing_preview`), plus "checksum required when a preview is sent"
   (`missing_glb_checksum`).
2. `packages`: no duplicate kinds, every kind in `PACKAGE_KINDS`, every key is the right name for
   its kind and prefix, `file_size > 0`, `file_format == "zip"`, and `media.package_key` is one
   of the listed keys. Otherwise `invalid_packages`.
3. Every package object must exist: loop `package_object_exists` over the packages, otherwise
   `missing_package_object`. Check this before anything is changed, so the uploaded files stay
   in place for a retry.
4. Category: decided by the ID's code (2.6). A brand-new category is created once, pending admin
   approval.
- `_check_preview` runs only when there is a preview (E2). The 360 checks stay as they are.

### 2.5 Protect buyers, then write packages (replaces `_sync_package`)
- **Before the transaction:** loop over the existing product's package rows. If a kind the
  product has is missing from the new import **and** someone bought that kind, refuse the row with
  `package_has_buyers`. "Bought" means a paid, not disputed `OrderItem` with that
  `package_kind`, or a legacy blank kind (bought before packages existed). The uploader then
  deletes nothing, so the buyer's file stays in R2.
- **Writing:** loop over the incoming packages and `update_or_create` one `ProductFile` per
  `(product, package_kind)` (label-free: the label comes from the constant; store `file_name`,
  `file_format`, `file_size`, `storage_path`).
  - Re-imports keep each package's price and sale.
  - Kinds the product had and the import no longer has (nobody bought them): delete those rows.
  - A paid model's **new** package row gets price `null` (not sold until priced). On a live model
    it also gets the warning `package_needs_price`.
  - A free upload's rows get price `0`.
  - Then call `sync_summary_price(product)`.
- **Live models** (PKG §1 step 7): a published model uploaded again stays on sale; the update
  waits in the QA queue (`pending_update`); a new package is not sold until priced.
- Delete `_sync_package`'s delete-all branch.

### 2.6 Category from the ID's code (PKG §3b; replaces CAT §2's name rule)
`CatalogImportService.resolve_category(model_id, sheet_category_name)` replaces the current
name-based version and works in this order:
1. The code is the part of `model_id` before the first `-`. If it is not `^[A-Z]{2,5}$`, refuse
   `invalid_model_id`.
2. An active category with that `code` → use it.
3. Otherwise, the active categories whose name equals the sheet's name (case-insensitive, extra
   spaces ignored) and that have **no code yet**:
   - exactly one → save the code on it (a one-time automatic link), use it, warning
     `category_linked`;
   - more than one → refuse `category_ambiguous`.
4. The named category already has a different code → refuse `category_code_mismatch` (the sheet
   says `Electronics`, but that category has code `FUR` and this ID is `ELE`).
5. **A genuinely new category** (no category with that code, and none with that name): create it
   once, hidden and waiting for approval:
   - `name` = the sheet's name, trimmed with spaces collapsed. Empty, or over 255 characters →
     refuse `category_unmapped`.
   - `slug` = `Category.build_slug(name)`; `code` = the ID's code; `is_active=False`;
     `pending_approval=True`; `created_by_import=True`; `created_from_batch` = the batch id; top
     level (no parent).
   - Inside the row's transaction, guard against two rows of one batch creating the same code:
     `select_for_update`, or catch `IntegrityError` and read the category again.
   - Warning `category_pending_approval`. The model is imported as "Pending review" in it.
   - Log it as an admin/audit event like the other catalog import actions (`accounts.security`).
   - The public site never shows the category until an admin approves it.
6. A category with that code exists **and is pending approval** → use it, with the same warning.
   Never create a second one for the same code.
7. A category with that code (or the matched name) that is **inactive and not pending**, meaning an
   admin turned it off on purpose → do not revive it silently. See Decision D2.
- Existing products keep their category, as now (a re-upload never looks the category up). Only
  new products go through this function.
- **Subcategory:** the plugin never sends one. Delete the subcategory branch, the
  `subcategory_not_found` warning and its test.

### 2.7 Category admin API (CAT §4, with PKG §3b's Merge rule)
Same admin permissions as the existing `AdminCategory*` views:
- **List pending:** `GET /api/v1/admin/categories/?pending_approval=true`, a filter next to the
  existing `is_active` one. The list returns `code`, `product_count` and `created_from_batch`.
- **Approve:** `POST /api/v1/admin/categories/<id>/approve/` sets `is_active=True` and
  `pending_approval=False`, and logs it. The admin may first fix the name or slug with the existing
  PATCH. After that, its models can be approved.
- **Merge into…:** `POST /api/v1/admin/categories/<id>/merge/` with `{"into": "<category id>"}`.
  The target must be active and not pending. In one transaction, every product of the pending
  category moves to the target and the pending category is deleted. The target keeps its own
  code; a target with no code takes this one. (Used for typos like "Furnture" → "Furniture".)
- **Reject:** see Decision D1 (the two prompts disagree).
- The existing PATCH refuses `is_active=True` while `pending_approval` is True, so Approve is the
  only way to make it live.
- `CategoryAdminSerializer` exposes `code`. Validation refuses a code another category already
  has, and a code that is not `^[A-Z]{2,5}$`. The code can be edited while the category has no
  products and is read-only afterwards, because codes never change.

### 2.8 QA approval and the publish rule
- `ProductService.approve_product` refuses a model whose category is still pending, with
  "Approve the new category '<name>' first." (`errors["category"]`). It works today only because
  the category is inactive (E3); now the message is clear. A published product never sits in a
  hidden category.
- Keep the current QA behaviour (PKG §5): paid → `awaiting_price`; free → `published` at price
  0 with every package free; a live update stays published. QA never sets a paid price.
- **Publish rule** (`_validate_publish_ready`, used by Publish and by QA Approve), built here so
  that nothing with an unpriced package can ever be published, even before Phase 3 ships:
  - Loop over the product's package rows. Every package needs a price of at least
    `MINIMUM_PRICE` (0.50 USD for paid models; free models use 0), and a valid sale if one is set.
    The error names the packages still missing a price.
  - At least one package row must exist, and each row's `package_object_exists` must pass.
  - Preview: publish needs `preview_model` **or** 36 `spin_images`. The 50% polygon check still
    applies whenever there is a preview model. A model with neither is refused.
  - QA Approve of a paid model only moves it to `awaiting_price`, so the price part does not
    block QA; it blocks Publish.

### 2.9 Refused imports visible and actionable (PKG §9)
- **One backend reason table** (codes → text and next step), for example in
  `products/import_reasons.py`. The uploader-imports API returns the text with each refused row,
  and the frontend `REASON_HELP` is deleted (E5).
- Entries: every reason the import can return, including `invalid_packages`,
  `package_has_buyers`, `package_needs_price`, `missing_package_object`, `missing_preview`,
  `missing_glb_checksum`, `category_unmapped` ("no category has the code of this ID: set the code
  on the right category in /console → Categories"), `category_code_mismatch`,
  `category_ambiguous`, `invalid_object_key` ("a zip name the website does not know: the uploader
  is out of date"), and the existing 15 codes. `category_linked` and
  `category_pending_approval` are notes, not refusals.
- The audit metadata records, per refused row, the model ID, the **name** and the reason.
- The panel lists **every** refused row of the latest batches, with the model ID, the name, the
  reason in words and the next step. One loop over the audit rows; no second list.
- Acceptance: a refused model shows in the panel within the same minute the uploader sends it
  (the panel refetches; no long cache on that endpoint).
- If a category is rejected (D1), the panel says why its models cannot be approved.

### 2.10 Admin screens for this phase (frontend)
- **Imports panel** (`UploaderImportsPanel.tsx`): uses the backend texts (2.9).
- **Dashboard** (`AdminDashboardPage.tsx`): a "New categories (N)" badge/card linking to the list,
  hidden when N = 0.
- **Categories page** (`AdminCategoriesPage.tsx`): a "Waiting for approval" ("New categories")
  filter or tab. Each row shows the name, the code, the product count, the date and the batch, with
  **Approve**, **Merge into…** (a dropdown of active categories) and **Reject**. The category form
  gets a **Model code** field (editable while empty of products, read-only after).
- **QA product page** (`AdminProductDetailPage.tsx`, `ProductMediaSection.tsx`):
  - The category block: the category, its code, and when pending the note "Category '<name>' is
    waiting for approval" with a link, plus **Approve category**, **Merge** and **Reject**. These
    run the same actions as the New categories list. The model's Approve button is disabled with
    that reason until the category is approved; after it, Approve works and the model goes to
    the Pricing page once approved.
  - The packages table: label, file name, size, admin download link (price and sale columns are
    added in Phase 3).
  - "No 3D preview - 360 only" when there is no preview, instead of an empty viewer.
  - The Approve and Reject buttons as now.

### 2.10b Admin console uploads (F2)
- `ProductMediaService.add_file` and its upload endpoint take a `package_kind` for a non-preview
  file: one of `PACKAGE_KINDS`, refused when the product already has that kind. A paid product's
  new package is unpriced; a free product's is 0. Then `sync_summary_price`.

### 2.11 Docs
- `docs/batch-ingest-contract.md`: `media.packages`, the five zip names, preview-or-360, the
  checksum rule, the new reasons and warnings (`invalid_packages`, `package_has_buyers`,
  `package_needs_price`, `category_linked`, `category_pending_approval`,
  `category_code_mismatch`, `category_ambiguous`), the code-based category rule, and the removal
  of `subcategory_not_found`. Update the storage layout to `models/<ID>/<ID>_<kind>.zip`.

### 2.12 Tests
Backend (PKG §11 #1-#6, #14; PKG §2, §3b and §3c tests; CAT §6):
- Each of the five names is accepted; `<sku>_other.zip` → `invalid_packages`; a free model's
  `free-models/` names are accepted.
- Import with 1, 3 and 5 packages gives the right `ProductFile` rows; a re-import keeps the
  prices.
- `invalid_packages`: unknown kind, duplicate kind, wrong name, `package_key` not in the list,
  size 0, wrong format.
- `missing_package_object` for one missing zip (the other zips present).
- `package_has_buyers` when a bought kind is dropped (including a legacy blank-kind order); a kind
  nobody bought may be dropped.
- A re-upload without a zip removes its row; the same upload with a bought zip is refused.
- A live model's new package gets `null` price and `package_needs_price`.
- A 360-only model (no `preview_key`, 36 spin keys) is created with `has_preview = False`. No
  preview and no spin → `missing_preview`. A preview without a checksum → `missing_glb_checksum`.
- Category: `ELE-000001` goes to the category with code `ELE`, whatever its sheet name says; no
  code yet and one category with the sheet's name → the code is saved and `category_linked`;
  the name belongs to a category with another code → `category_code_mismatch`; two categories
  with the same name and no code → `category_ambiguous`; empty or over-255 name →
  `category_unmapped`; an unknown code and name → a hidden pending category is created with the
  product, plus `category_pending_approval`; a second import with the same code → no duplicate;
  two rows of one batch with a new code → one category; a deliberately inactive category →
  per D2; a bad code prefix → `invalid_model_id`.
- Category admin: approve / merge / reject endpoints (including Reject per D1); PATCH cannot set
  `is_active` on a pending category; the code can be set while the category is empty and cannot
  change once products exist; duplicate code refused; the public category list never shows
  pending categories.
- QA: approve paid → `awaiting_price`; free → `published` at 0; a 360-only model can be approved;
  approve is blocked while the category is pending.
- Publish refused while any package is unpriced or any sale is invalid; allowed when all are priced
  (PKG §11 #7; the pricing UI comes in Phase 3).
- Refused imports appear with the right text, model ID and name (PKG §11 #14).
Frontend:
- The Imports panel texts; the dashboard badge (hidden at 0); the waiting-for-approval filter
  and the three buttons; the QA category block; the read-only packages table; "No 3D preview -
  360 only".

**Deletions in this phase:** the two hard-coded zip names, the delete-all branch of
`_sync_package`, the import's product-level discount fields, the subcategory branch with
`subcategory_not_found` and its test, the frontend `REASON_HELP`.

**Phase 2 is done when** RacingGamingChair (three zips, 360, no GLB) imports as **created**, shows
in the QA queue, and after Approve sits in **Waiting for price**. It cannot be published yet.

---

## Phase 3: Pricing and publishing per package (admin side)

**Goal:** the admin sets a price, and optional sales, for each package a model has on the Pricing
page, sees the bundle check, and publishes.

**Covers:** PKG §1 steps 4-5, §3c rules 4 and 6, §5 (pricing engine and page), §8 (price history,
packages table prices).

### 3.1 Pricing engine (`backend/products/pricing.py`)
- Keep the rules (set price, tier price, percent off, amount off, remove sale) and the preview →
  apply → token flow. Change only the source of the price.
- A rule works on **one package kind**, chosen on the page. `_calculate_row` reads that package's
  `price`, not `product.price`.
- A model without the chosen package is listed as "no <label> package" and left alone. The page
  cannot set a price on a kind the model does not have.
- `PriceState` and `ProductPriceChange` work on package rows through `PricedMixin`, so the same
  code records the history of a product and of a package. History rows carry `package_kind`.
- `apply` saves all rows in one transaction, then calls `sync_summary_price` for each product.
- Every existing pricing rule still applies per package: USD only; poly tiers Low <10k, Mid
  10k-100k, High >100k; at most 200 models per action; at most 90% off, with a typed confirmation
  over 50%; the server calculates every price; sale end picked in IST and stored in UTC; save,
  then publish with a summary; live models allow both sales and normal-price changes.
- **Bundle check** (server-computed, a warning, never a block): when a model has Whole File and at
  least one other package, warn if Whole File is not cheaper than the other packages added
  together, or if it is cheaper than the single most expensive package.
- Delete the single-`package_key` / `product.price` path in `_calculate_row`.
- `end_expired_discounts` (F3) also clears ended sales on package rows, records a package
  price-history row with source `sale_ended`, and calls `sync_summary_price`.

### 3.2 Pricing page (`AdminPricingPage.tsx`, `PricingChoice.tsx`)
- A **Package** selector: one loop over `PACKAGE_ORDER` for the options, with labels from the same
  constant.
- Each model row shows every package it has, with its price and sale, so an empty (unpriced)
  package is visible.
- The bundle warning is shown on the row and in the publish summary.
- Publish uses the Phase 2 rule (every package priced, preview or 360, objects present). The error
  names the missing packages.

### 3.3 Admin product screens
- Packages table on the QA/product page: add the price and sale columns.
- Admin product form: shows the package prices instead of the product price fields. The product
  price is a summary nobody types.
- Price history (`ProductPriceHistoryPanel.tsx`): the package label on each change.

### 3.4 Tests (PKG §11 #8, §3c)
- Pricing rules change one package and leave the others; history rows carry the kind; the token
  is still checked.
- The Pricing page cannot set a price on a kind the model does not have; a model without the
  chosen kind is listed and left alone.
- Bundle check: the three warning cases and the no-warning case.
- `apply` keeps `Product.price` equal to the lowest priced package.
- The existing pricing limits (200 models, 90%, typed confirmation over 50%, IST → UTC) still
  apply per package.
- Frontend: the package selector, the per-package row display, the bundle warning, the admin
  packages table with prices, the price history label.

**Phase 3 is done when** RacingGamingChair can be priced 19 / 15 / 29 (With Light Rig / Without
Light Rig / Whole File), the bundle check says Whole File is cheaper than the other two together,
and Publish puts it live.

---

## Phase 4: Selling packages (storefront, cart, checkout, ownership, downloads)

**Goal:** the buyer sees one option per priced package, buys one or several, and downloads only
what they own. Old orders keep every package.

**Covers:** PKG §1 step 6, §3c rule 5, §6, §7, §8 (orders, payments and downloads admin labels),
§11 #9-#12.

### 4.1 Ownership (`orders/entitlements.py`)
- Replace `user_owns_catalog_item` (for products) with `owned_package_kinds(user, product_ids)`,
  which returns a set of `(product_id, kind)` in one query. A paid, not disputed order line gives:
  - kind `whole` → every package of that product;
  - kind blank (legacy) → every package of that product;
  - any other kind → that package only.
- Free models: everyone owns every package (`is_free`). Plugins keep their own check.
- Move every caller to the new function, then delete the old one for products: `cart/services.py`,
  `orders/services.py` (E4), `downloads/services.py` (`stream_product_file`,
  `list_downloadable_files_for_item`), `reviews/services.py` and `reviews/views.py` (a review
  needs any owned package), `config/rollback_rehearsal.py`, `payments/stripe_smoke.py`. Check
  with `grep` that no caller is left.

### 4.2 Cart (`CartService.add_item`, `_validate_catalog_item`)
- A product line needs a `package_kind`. Refuse a package that is owned, unpriced, or not in a
  published product.
- The price is that package's effective price. Line title: "<model name> - <package label>".
- When Whole File is in the cart with other packages of the same model, return a hint that Whole
  File already contains them.

### 4.3 Checkout (`OrderService.create`, `create_from_cart`, `_resolve_catalog_item`)
- Resolve the price and the title from the package row; copy `package_kind` into `OrderItem`;
  check ownership per `(product, kind)`.
- Stripe line names use the title.
- Invoices and licences: one per `OrderItem`, with the package label.
- Coupons: see Decision D4.

### 4.4 Downloads
- `DownloadService.list_entitlements`, `downloadable_product_files`, `stream_product_file`: list
  and stream only the packages the user owns (one loop over the product's package rows, filtered
  by `owned_package_kinds`).
- **Free download** (`ProductFreeDownloadView`): accept `?package=<kind>`. Without it, use the
  first kind in `PACKAGE_ORDER` that the product has. Unknown kind → 404. Replace the current
  `order_by("-created_at").first()` (E8).

### 4.5 Serializers
- `ProductDetailPublicSerializer.packages`: one loop over `PACKAGE_ORDER` that reads the product's
  package rows. Each entry has `kind`, `label`, `description` (the contents text, one constant per
  kind), `file_size`, `price`, `discount_price`, `effective_price`, `sale_ends_at`, and `owned`
  and `in_cart` for a signed-in user. Only priced packages of a published product are listed.
- `bundle_saving`: the sum of the other listed packages' effective prices minus Whole File's
  effective price, present when Whole File is listed and at least one other package is.
- List serializer: `price_from`, the lowest effective price, for the cards.

### 4.6 Storefront (frontend)
- **`PackageOptions`** (new, one file), replacing the single Buy button in
  `ProductDetailsPage.tsx` / `CommerceCtaGroup.tsx`:
  - One row per package: label, contents, size, price (sale price with the old price struck
    through).
  - A checkbox per package; the total updates as boxes are ticked.
  - The Whole File row is highlighted: "Everything in one download - save $X (Y%)", shown only
    when `bundle_saving > 0`.
  - Owned packages show **Download**; packages in the cart show **In cart**. When the buyer owns
    Whole File, it offers only downloads.
  - "Add selected to cart" adds one line per ticked package; "Buy now" buys the ticked packages
    at once.
  - Accessible: labelled checkboxes; when shown as a dialog, focus stays in it and Esc closes it;
    works at phone width.
  - Free models: the same rows, each with **Free download** (`?package=<kind>`) and no checkbox.
- **Product cards** (`ProductCard.tsx`): "From $`price_from`" when the model has more than one
  priced package. The 360° badge stays.
- **Hooks and API:** `useBuyNow` and `addCartItem` take `packageKinds` (a list). The cart and
  checkout requests send one `{product_type, product_id, package_kind}` line per package. Replace
  the single-item call; do not keep both.
- **Cart page:** the line title with the package label, and the Whole File hint.
- **My Downloads** (`MyDownloadsPage.tsx`): one row per owned package, with its label and size.
- **Admin orders, payments and downloads pages:** the package label next to the model name.

### 4.7 Tests (PKG §11 #9-#12 and the frontend list)
- Cart: two packages of one model make two lines; an owned or unpriced package is refused; a
  package of an unpublished model is refused; the Whole File hint.
- Checkout: two `OrderItem` rows with the right kinds and prices; Stripe line names carry the
  label; invoice and licence per line.
- Ownership: `with_light_rig` gives that zip only; `whole` gives all; a legacy blank-kind order
  gives all; a disputed payment gives nothing; free gives all; plugins unchanged.
- Downloads: only owned packages are listed and streamable; `?package=` works; an unknown kind →
  404; without `?package=` → the first kind in `PACKAGE_ORDER`.
- Serializer: unpriced packages are not listed; the number of options = priced rows;
  `bundle_saving` present only when it applies; `price_from`.
- Reviews: any owned package allows a review.
- Frontend: the option card lists only priced packages, ticks update the total, owned packages
  show Download, the saving line only when `bundle_saving > 0`; the "From $X" card price; the
  `packageKinds` hooks; My Downloads rows.

**Deletions in this phase:** `user_owns_catalog_item` for products, the single-item cart/buy calls,
the free download's `.first()`.

**Phase 4 is done when** the buyer can buy Whole File alone, or one single package, and My
Downloads lists only that zip.

---

## Phase 5: Clean-up, release and acceptance

**Goal:** no dead code, every test green, the host configured, the real-model acceptance test
passed, and the definition of done met.

**Covers:** PKG §10 (final check), §11 (full list), §12, §13, §14, Definition of done; CAT "After
you deploy" and "Other things".

### 5.1 Dead code and lint (PKG §10 rule 3, final check)
- `grep` confirms no remaining users of: `user_owns_catalog_item` (product use), `_sync_package`'s
  delete-all branch, the single-`package_key` price path in `_calculate_row`, the import's
  product-level `discount` fields, `subcategory_not_found`, the frontend `REASON_HELP`, and the
  old `package.zip` / `<sku>.zip` handling (now only in the migration).
- Linter and `vulture` on every changed file report nothing new. Every unused serializer field is
  gone, unless the frontend reads it.
- Run the whole backend suite and the whole frontend suite. Cross-check PKG §11 #1-#14 and the
  frontend list against the test names.

### 5.2 Must not change (PKG §14), checked by the existing tests
- The 360 viewer, `spin_images`, the `360/<ID>/` folder and the preview GLB viewer.
- Plugin products (`plugins/`): their own price and check, with a blank package kind.
- Archiving never deletes R2 files.
- The 3ds Max plugin and the uploader's logic stay unchanged. Their texts for
  `category_unmapped` and the new category reasons come later, as a text-only uploader release.
- The R2 layout: `models/<ID>/<ID>_<kind>.zip` (private), `models/<ID>/` (public preview,
  thumbnail, renders), `360/<ID>/` (public frames), `free-models/<ID>/` (public, free models).

### 5.3 Pre-flight on the host (PKG §13, CAT "Other things"; ops, not code)
- Render has all seven R2 settings, with the same names as the uploader's Settings:
  `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ENDPOINT_URL`,
  `R2_PUBLIC_BUCKET` (`3dam-public`), `R2_PRIVATE_BUCKET` (`3dam-private`), `R2_PUBLIC_BASE_URL`.
  If any is missing, the website silently uses its local disk and cannot see the uploaded files.
- `entrypoint.sh` runs `createcachetable` after `migrate` (already present, E10).
- The scanner (`PACKAGE_SCAN_HOST`) is set, or `CATALOG_IMPORT_SCAN_REQUIRED` is decided on
  purpose. In production with no scanner, every preview GLB is rejected (`scanner_unavailable`),
  and the exe says "the website rejected the preview GLB". Check the scanner first when uploads
  come back as rejected previews.
- `R2_SIGNED_URL_EXPIRY` on Render is 60 (you chose 60 s; the default was 300 before) (E9).
- The uploader is Model Uploader 1.2.1. It needs no change for this work.

### 5.4 Deploy
- Open the PR from `feature/packages` into `main` (see D3) and merge after your go. Render runs
  the migrations on start.
- Copy the updated master folder into `E:\ABHAY\MaxPlugin\subfolder\3d-asset-marketplace` (CAT).

### 5.5 Acceptance test with the real models (PKG §12, CAT "After you deploy")
Use `RacingGamingChair` (`ELE-000001`: 360 and three zips, With Light Rig, Without Light Rig and
Whole File; no GLB).
1. Category: `Electronics` should already be on the website. If it has no code, the first import
   links it to `ELE` by itself. If a category is brand new, the import creates it **pending**,
   and an admin approves it under "New categories" in `/console` before approving the model.
   (CAT check: the new category is hidden and pending, Approve is blocked until it is approved,
   then it is live.)
2. Upload from the studio PC. Expected: **created** in the Imports panel, and **Pending review**
   in the QA queue.
3. Approve. Expected: **Waiting for price**.
4. Pricing page: set the three prices (for example 19, 15, 29). Expected: the bundle check shows
   Whole File is cheaper than the other two together.
5. Publish. Expected: live.
6. Product page: three options with their prices; tick Whole File and see the saving line; Buy
   now Whole File. Expected: one order line, and the checkout total is the Whole File price.
7. My Downloads: only the Whole File zip is listed for that order.
8. Repeat step 6 with a single package. My Downloads shows only that zip.
9. Upload `ELE-000001` again with the same files. Expected: an **update**, the packages keep their
   prices, nothing is lost.
10. A free test model: every package free, one "Free download" per package.
11. Re-run the Model Uploader on the output folder of models refused earlier (for example
    `category_unmapped`, `invalid_object_key`). Their files are already in R2, so nothing is
    re-uploaded, and they now import.

### Definition of done (PKG)
- The refused models in PKG §0 are gone: every model the tool sends with a preview or a 360, and
  one to five zips, is created and reaches the QA queue, or is refused with a visible, correct
  reason.
- A paid model can be approved, priced per package, published and sold per option, with the
  Whole File saving shown and the right download after purchase.
- All tests in PKG §11 pass; the linter and the dead-code check report nothing new.

---

## Decisions (answered 2026-11-16)

| # | Decision |
|---|---|
| D1 | The import **creates** every new category automatically, hidden and pending; nobody adds categories by hand. Approve puts it live. Merge fixes typos. Reject is a safety net only: it deletes an empty category, and keeps a category with models hidden, with those models blocked in QA and the reason shown. |
| D2 | A category switched off on purpose is never revived: refuse with `category_inactive` ("the category for this code is switched off in /console"). |
| D3 | Everything stays on `feature/packages` until all phases are done; the user merges it into `main` last. |
| D4 | Coupons apply to each package line. |
| D5 | No upgrade pricing: an owned package cannot be bought again, and Whole File is a separate line at its full price. |
| D6 | The migration gives a paid product still at the 0.00 placeholder (draft, pending review, waiting for price, rejected) an **unpriced** Whole File package; free (`free-models/`) products get 0. |
| D7 | Only the five package zips are expected. Any other zip in an upload is not imported: the row warns `extra_file_skipped` and the model's QA notes name the file, so the admin can add it by hand (Media → Packages, with one of the five kinds). Built in Phase 2's import. Older files without a kind (F1, added in the console before packages) are still delivered with Whole File in Phase 4, so no buyer loses a file. |

### Found while building Phase 1

- **F1. Several files per product.** The admin console (`ProductMediaService.add_file`) can attach
  several non-preview files to one product, and downloads deliver all of them today. The migration
  makes the newest `.zip` (else the newest file) the Whole File package; any other files keep a
  blank kind. Decision D7 below.
- **F2. Admin uploads need a kind.** `add_file` must take a `package_kind` for a non-preview file
  (one of the five, refused when the product already has that kind). Added to Phase 2.
- **F3. Ended sales on packages.** `end_expired_discounts` clears ended sales on products only. It
  must also clear them on package rows, record a package price-history row (`sale_ended`), and
  call `sync_summary_price`. Added to Phase 3.

### Found while building Phase 2

- **F4. Live re-uploads.** The import used `price == 0` to spot "a free live model uploaded as
  paid". Unpriced packages make every new paid model's summary price 0, so a normal re-upload
  of a live paid model would have left the store. It now checks for a zip under
  `free-models/`; `price_needed` uses the same rule.
- **F5. The sheet's price is no longer read.** The import drops `price`, `discount_price` and
  `subcategory` (and the `invalid_price` and `sheet_sale_ignored` codes). The
  `gate-failures` fixture now tests a missing GLB checksum instead of a blank price.
- **F6. e2e seeds.** `seed_e2e_pricing` and `seed_e2e_commerce` create a priced Whole File
  package, so the browser e2e flows pass the per-package publish rule.
- **F8. `is_free` on an unpriced paid model.** With no priced package the summary price is 0,
  so `is_free` is true for a paid model waiting for its prices (as it already was with the
  tool's 0.00 placeholder). It only matters once published, and a paid model cannot be
  published below 0.50. Phase 3: the admin product form and the Pricing page must decide
  free/paid by `upload_kind`, never by `is_free`.
- **F9. Phase 2 and 3 are linked.** Until Phase 3, the Pricing page still writes only the
  product price, while publishing now needs a price on every package. So the Pricing page
  cannot publish a newly imported model until Phase 3 ships (D3: nothing is merged before).
  The pricing journey tests (`test_e2e_pricing_journey`) that apply a rule and then publish
  stay red until Phase 3.
### Found while building Phase 3

- **F10. No product form sets a price.** Console create and edit refuse `price`,
  `discount_price` and `discount_ends_at` ("Prices are set per package on the Pricing page");
  the update service's price branch, `_resolve_discount_ends_at`, `_validate_pricing` and
  `_validate_sale_minimum` are deleted. The old product-form sale-end tests went with them; the
  Pricing page's sale rules and the per-package publish check cover the same cases.
- **F11. Price history is per package.** The Pricing page, the import (Free tick, free to paid)
  and the free QA approval each write one history row per package (`package_kind` set); the
  product's summary price follows silently.
- **F12. Rules default to Whole File.** A Pricing page request without `package_kind` prices
  Whole File. The page always sends it.
- **F13. A model may sit in a pending category.** The product service accepts a category that
  waits for approval (otherwise a new category's first model could not be created); approval
  stays blocked until the category is approved.
- **F7. Category Reject (D1).** A rejected category that still has models keeps
  `pending_approval` and gets `rejected_at` (migration `categories/0004`). New uploads with its
  code are refused (`category_rejected`) until it is approved or merged.

### Found while building Phase 4

- **F14. `owned` and `in_cart` are not in the product page response.** The public product detail
  is cached for everyone (`PublicCatalogCacheMixin`), so it cannot carry per-user flags. It lists
  the packages; the page reads ownership from My Downloads (`package_kinds` on each entitlement)
  and the cart from the cart API, as it already did for whole products.
- **F15. `user_owns_catalog_item` stays, with one meaning.** It answers "owns the plugin, or at
  least one package of the model". Reviews need exactly that (any owned package allows a review),
  and so do the rollback rehearsal and the Stripe smoke. The cart, checkout and downloads check
  each package with `owned_package_kinds` / `owned_line_keys`.
- **F16. Cart lines are keyed by package everywhere.** `line_key` = `(product_type, product_id,
  package_kind)`: cart snapshots, the checkout selection (`items[].package_kind`), the checkout
  fingerprint, the webhook's cart clean-up and order file lists.
- **F17. Cart buttons outside the product page.** A model has no single "Add to cart" any more:
  the product image's cart icon is gone, and a model on the wishlist links to its page
  ("Choose packages"). The shared buy box (`CommerceCtaGroup`) now serves plugins only.
- **F18. Old order lines.** A model line from before packages shows "All packages" in the order
  pages, and its files are every file of the model (including files without a kind, D7).
- **F19. Smoke scripts.** `rollback_rehearsal`, `stripe_smoke` and `load_smoke` buy a priced Whole
  File package (the load smoke buys the product's cheapest priced package).

D7 (extra files) was answered on 2026-11-16; see Decisions above.

## Decisions as first asked (kept for the record)

| # | Question | The two sources / options | Recommendation |
|---|---|---|---|
| D1 | What does **Reject** do to a pending category? | PKG §3b: it stays hidden; its models stay in QA, cannot be approved, and the Imports panel says why. CAT §4: it deletes the category, only when it has no products (otherwise 400 "Merge it into another category or delete its products first"). | Combine them: with no products, delete it; with products, mark it rejected (hidden). Its models stay in QA, blocked, with the reason shown. Needs a `rejected` state (or `pending_approval` + a `rejected_at`). |
| D2 | A category with this code (or name) exists but an admin **turned it off** on purpose (inactive, not pending). | CAT: keep refusing with `category_unmapped`, never revive it silently. PKG: silent on this. | Refuse with a new reason `category_inactive` ("the category for this code is switched off in /console"), so it is not confused with "not found". |
| D3 | When may it be merged into `main`? | Phase 2 alone already fixes "models not reaching the admin", and its publish rule means nothing unpriced can go live. But until Phase 3 ships, the old Pricing page cannot publish **any** model waiting for a price. | Merge after Phase 2 if you need models in QA now and can pause publishing for a few days. Otherwise merge after Phase 4. |
| D4 | **Coupons** on package lines | Not in either prompt. | A coupon applies to each package line, as it does to a product line today. |
| D5 | **Upgrades**: a buyer who owns GLB Only and wants Whole File | PKG: an owned package cannot be bought again; Whole File is a separate, not-owned line at full price. | Keep PKG's rule (full Whole File price, no difference pricing) for now. |
| D6 | Migration: paid products still at the 0.00 placeholder (`awaiting_price`) | PKG says copy the product price into the `whole` row. | Copy `null` instead of 0.00 for paid products, so they show as "needs a price" on the Pricing page. Free products get 0. |

---

## Source → phase map

| Source section | Phase |
|---|---|
| PKG §0 Why models are not reaching the admin | 2 (causes 1-5), verified above |
| PKG §1 Target workflow | 2 (steps 1-3, 2b, 7), 3 (4-5), 4 (6) |
| PKG §2 Accept the zip names | 1 (constants), 2 |
| PKG §3 Import contract, gate, protect buyers, writing packages | 2 |
| PKG §3b Category from the ID's code | 1 (fields), 2 (logic, API, screens, tests) |
| PKG §3c Options and prices | 1 (labels), 2 (rows), 3 (pricing page), 4 (product page) |
| PKG §4 Data model and migration | 1 |
| PKG §5 Pricing and publishing | 2 (publish rule, QA), 3 (engine, page, bundle check) |
| PKG §6 Storefront | 4 |
| PKG §7 Cart, checkout, entitlements, downloads | 4 |
| PKG §8 Admin pages | 2 (QA page, category block), 3 (prices, history), 4 (orders, payments, downloads) |
| PKG §9 Refused imports visible | 2 |
| PKG §10 Code rules | every phase; final check in 5 |
| PKG §11 Tests | #13 → 1; #1-#7, #14 → 2; #8 → 3; #9-#12 → 4; all → 5 |
| PKG §12 Acceptance test | 5 |
| PKG §13 Pre-flight | 5 |
| PKG §14 What does not change | 5 (checked), every phase (respected) |
| PKG Definition of done | 5 |
| CAT §1 Category fields | 1 |
| CAT §2 Import rule | 2 (replaced by the code rule; "inactive not pending" → D2) |
| CAT §3 Product approve | 2 |
| CAT §4 Admin API | 2 (Reject → D1) |
| CAT §5 Admin console | 2 |
| CAT §6 Docs and tests | 2 |
| CAT After you deploy | 5 |
| CAT Other things #1-#4 | 5 (#1, #3), E10 (#2 done), Phase 1 test (#4) |
