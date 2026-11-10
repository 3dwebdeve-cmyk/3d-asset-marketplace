# Pricing pipeline

How a model gets from upload to the shop, and how prices and sales work. This file is the
contract for the code; change it together with the code.

## Flow

```
Model Uploader -> R2 + import
  Free tick (zip under free-models/)        Paid (zip under models/, private bucket)
    QA, Free section                          QA, Paid section (suggested price = sheet price)
      Approve -> published (free download)      Approve quality -> awaiting_price
      Reject  -> rejected                       Reject -> rejected
                                              Pricing page, "Waiting for price"   (Part 2)
                                                Save prices, then Publish selected -> published
  Live models -> Pricing page, "Live models": sales and normal-price changes   (Part 2)
  Re-upload of a live model -> stays published, pending_update -> QA (its section) -> Approve keeps
  the price, Reject takes it off the store
```

## Part 1 (foundation): rules

### Free or paid ("upload kind")

A model is **free** when any of its sellable files (`ProductFile.is_preview=False`) has a
`storage_path` under `free-models/` (`config.media.is_free_model_path`). Otherwise it is **paid**.
The admin API sends this as `upload_kind: "free" | "paid"`. A paid model cannot be made free on
the website: its zip is in the private bucket. Re-upload it with the Free tick instead. An admin
`PATCH` that sets price 0 on a paid upload is refused (400), and the product form does not offer
Free for a paid upload.

A **live free model uploaded again as paid** (its zip moves to the private bucket) leaves the
store: it goes to `pending_review` (row warning `free_to_paid_off_sale`) and then through QA and
the Pricing page like a new paid model. It cannot stay a free download. For the same reason, QA
approving a live update of a paid upload whose price is 0 sends it to `awaiting_price`.

### Statuses

`Product.Status.AWAITING_PRICE = "awaiting_price"` ("Waiting for price"): a paid model that passed
the QA quality check.

| From | To | How |
|---|---|---|
| `pending_review` (free) | `published` | QA approve (`POST /admin/products/<id>/approve/`) |
| `pending_review` (paid) | `awaiting_price` | QA approve. Runs every publish check except the price |
| `published` + `pending_update` | `published` | QA approve (flag cleared, price kept) |
| `pending_review`, `awaiting_price`, live update | `rejected` | QA reject (reason required) |
| `awaiting_price` | `published` | Pricing page publish only (Part 2) |
| `awaiting_price` | `pending_review` | Re-upload by the Model Uploader only (not an admin edit) |
| `published` (free, price 0) | `pending_review` | Re-upload as paid (see above) |
| `awaiting_price` | `draft`, `archived` | Admin edit / archive |

A direct admin edit (`PATCH`) can never set `awaiting_price` or `published`. The approve endpoint
no longer takes `pricing` or `price`; a request that sends them is refused (400). QA never sets
a paid model's price.

Admin list filters: `?status=awaiting_price` lists the waiting models.
`?status=pending_review&kind=free|paid` splits the QA queue (live updates included, by kind).

### The price a buyer pays

There is one rule, in the model:

- `Product.active_discount_price(now=None)`: the sale price while the sale runs, else `None`.
- `Product.effective_price(now=None)`: the running sale price, else `price`.

A sale runs while `discount_price` is set and `discount_ends_at` is null or in the future. Every
place that shows or charges a model's price uses these two methods: checkout (order lines), cart,
wishlist, the public product API (list and detail), and through the API the shop pages and the
Worker's structured data. **Never read `product.discount_price` directly for a buyer.** (Plugins
are unchanged.)

Public API: `discount_price` is the running sale price or `null`; `discount_ends_at` is sent only
while a sale runs (`null` otherwise). Admin API: the stored `discount_price` and
`discount_ends_at`, plus `discount_active` (bool).

Admin `PATCH` accepts `discount_ends_at` (ISO 8601 with time zone, or `null`). It must be in the
future and needs a sale price. Clearing `discount_price` also clears `discount_ends_at`. A time
without a zone is refused (400). A new sale price on a model whose stored sale end has passed
must come with a new `discount_ends_at` (or `null`), so a sale never starts already ended.
A sale price is lower than the normal price and at least the checkout minimum (0.50 USD). The same
rules apply when an admin creates a model. The upload import never takes a sale price from the
sheet (row warning `sheet_sale_ignored`): sales are set on the Pricing page or in the product form.

An **ended sale is never revived** by an edit: resending its price, removing its end
(`discount_ends_at: null`) or sending its old end clears it instead. Starting it again needs a
sale price in the request together with a new price or a new future end. An unchanged
`discount_ends_at` counts as not sent (forms resend it). The product form loads an ended sale as
"no sale", sends the status only when the admin changed it, and sends the sale end only when it
changed. Migration `products/0014` clears stored sales that are not below the price or are below
0.50. The Django admin cannot change status or prices (read-only there).

The maintenance loop runs `end_expired_discounts`, which clears ended sales (history source
`sale_ended`). It is only housekeeping: an ended sale is already ignored by the rule above.

### Price history

`ProductPriceChange` (table `product_price_changes`): who (`changed_by`, null for the import and
the maintenance loop), when, `source`, `batch_id`, and old and new `price`, `discount_price`,
`discount_ends_at`. Write it with `products.price_history`:

```python
before = PriceState.of(product)
# ... change and save the product ...
record_price_change(product, before, source=ProductPriceChange.Source.ADMIN_EDIT, actor=request.user)
```

Inside the same transaction as the change. Nothing is written when nothing changed. Sources:
`admin_edit`, `qa_approval`, `pricing_page`, `import`, `sale_ended`.

`GET /api/v1/admin/products/<id>/price-history/`: the latest 100 rows, newest first, admins only.

## Part 2: Pricing page API

Code: `products/pricing.py` (rules and calculation), `pricing_serializers.py`, `pricing_views.py`.
All routes are under `/api/v1/admin/products/pricing/`, for administrators with the authenticator
mark only. List and preview use the `admin_pricing_read` limit (120/min); apply and publish use
`admin_product_write` (60/min). Prices are USD only.

### Tabs and filters: `GET pricing/?tab=waiting|live`

- **waiting**: `awaiting_price` models. **live**: published models with a price above 0.
- Free uploads never appear in either tab: they have no price or sale.
- Filters:
  - `category_id`: a main category, which includes its subcategories.
  - `subcategory_id`: exactly that category.
  - `poly=low|mid|high|unknown`.
  - `search`: name, or model ID.
  - `import_batch_id`.
  - `ordering`: `name`, `price`, `polygon_count` or `created_at`, each also with a leading `-`.
  - `page`, `page_size`.
- **Poly levels**: Low is fewer than `low_below` polygons (default 10,000). High is more than
  `high_above` (default 100,000). Mid is between, both ends included. A model with no polygon
  count is Unknown. The page may send its own `low_below` and `high_above`.
- **Each row**:
  - The stored `price`, `discount_price` and `discount_ends_at`.
  - `discount_active` and `buyer_pays`, from the buyer-price rule.
  - `poly_tier`, and `category` (`id`, `name`, `parent_id`).

`GET pricing/batches/?tab=` lists the upload batch IDs in that tab, newest first, at most 50.

### Rules: the body of `preview` and `apply`

`product_ids` (1 to 200 IDs; repeats count once) and `rule`, plus the fields that rule needs:

| `rule` | Fields | Result |
|---|---|---|
| `set_price` | `price` | The normal price. A running sale stays; it must still be below the new price. |
| `tier_price` | `tier_prices: {low, mid, high, unknown}` | A price for each poly level. A model whose level has no price gets an error row. |
| `percent_off` | `percent` (0.01 to 90), `round_99`, `discount_ends_at` | Sale price = price × (100 − percent) / 100, rounded to the cent. |
| `amount_off` | `amount`, `round_99`, `discount_ends_at` | Sale price = price − amount. |
| `remove_sale` | none | The sale and its end are removed. |

- **`round_99`**: moves the sale price down to the nearest .99 (8.40 becomes 7.99; 9.00 becomes
  8.99).
- **`discount_ends_at`**: ISO 8601 with a time zone, in the future. `null` means the sale has no
  end.
- **Stored ended sales**: a sale that has ended counts as no sale and is cleared when the prices
  are saved.

A row has an `error`, and nothing for it can be saved, when:

- the model is not waiting for a price and not live, or it is a free upload;
- a price or sale price would be below 0.50;
- the sale price would not be below the price, or would take more than 90% off;
- a new normal price would not be above a running sale (remove the sale first);
- a sale rule is used on a model with no price yet.

### `POST pricing/preview/`

Changes nothing. Returns:

- `rows`: each row has the old and new price, sale price and sale end, `amount_off`,
  `percent_off`, `buyer_pays`, `poly_tier`, `changed` and `error`.
- `summary`:
  - `models`, `changed`, `errors`;
  - `buyer_pays_before` and `buyer_pays_after`, totals over the rows without errors;
  - `needs_confirmation`: true when a sale takes more than 50% off.
- `preview_token`: a hash of the rule, plus each model's current prices and the calculated result.

### `POST pricing/apply/` (Step 1, Save)

Send the same body as the preview, plus `preview_token`, plus `confirm_count` when the preview
needed confirmation. `confirm_count` is the number of selected models, typed by the admin.

- The rows are locked in ID order, recalculated, and refused with **409** if the token differs:
  something changed since the preview, or a sale ended.
- Any row error refuses the whole save (400). The response body maps each model ID to a list with
  its error (the API's usual field-error shape).
- Otherwise every changed model is saved in one transaction.
- One `ProductPriceChange` row is written per changed model, with source `pricing_page`, the admin
  as actor, and one shared `batch_id`.
- The audit log gets one `pricing_apply` entry: the batch, the rule and the IDs.
- Statuses do not change.

Returns `batch_id`, `models`, `changed` and `unchanged`.

### `POST pricing/publish/` (Step 2)

Body: `product_ids` (1 to 200) and `confirm_count`, which must equal the number of models; the
page shows a summary first. Each model is checked and saved on its own.

- **Published**: an `awaiting_price` model that is a paid upload, has a price of at least 0.50,
  has no running sale that breaks the sale rules, and passes every publish check (files, preview,
  category and so on).
- **Not published**: any other model stays where it is, and its `reason` is returned.

Returns `models`, `published`, `failed`, and `results` (`id`, `name`, `sku`, `published`,
`reason`). The audit log gets one `pricing_publish` entry.

## Part 3: screens

### QA queue: Free and Paid sections

`/console/products?status=pending_review&kind=free|paid`. The default is Free.

- **Sections**: two tabs with counts, and a Free or Paid label on each row.
- **Free model**: approving it publishes it as a free download.
- **Paid model**: approving it ("Approve quality → send to Pricing") moves it to Waiting for price.

### Pricing page: `/console/pricing`

Console menu item "Pricing". Code: `pages/Admin/AdminPricingPage.tsx`, `api/pricingApi.ts`,
`types/pricing.ts`.

- **Tabs**: "Waiting for price" and "Live models" (`?tab=live`), each with a count.
- **Filters**: category, subcategory, poly level, search by name or model ID, upload batch, sort,
  and "Poly level limits" for the Low and High limits.
- **Table**: tick models on any page, up to 200 in total. Each row shows the price, the running
  sale and its end, and what the buyer pays.
- **Calculator**:
  - "Set the price": one price for all, or a price by poly level.
  - "Give a sale": % off or $ off, the .99 ending, and an optional end in the admin's local
    time, sent as UTC.
  - "Remove the sale".
- **Calculate preview**: shows the server's rows and totals. Any change to the selection or the
  rule clears the preview.
- **Save prices** (Step 1):
  - Only enabled when no row has an error and something changes.
  - A sale above 50% off needs the number of models typed in first.
  - A 409 answer clears the preview and asks for a new one.
- **Publish selected** (Waiting tab only, Step 2):
  - A summary first: how many models, their total, and how many have no price yet.
  - Then the results, with the reason for each model that stayed waiting.
- Models with a pending re-upload show an "Update in QA" label.

### Shop

- **Product page**: the sale price, the normal price crossed out, the "-N%" badge, and
  "Sale ends …" in the visitor's own time when the sale has an end.
- **Product card**: "-N%" instead of "Sale".
