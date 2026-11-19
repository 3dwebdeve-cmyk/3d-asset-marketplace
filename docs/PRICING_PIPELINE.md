# Pricing pipeline

How a model gets from upload to the shop, and how prices and sales work. This file is the
contract for the code; change it together with the code.

## Flow

```
Model Uploader -> R2 + import (sends hours_spent)
  Free tick (zip under free-models/)        Paid (zip under models/, private bucket)
    QA, Free section                          QA, Paid section
      Approve -> published (free download)      Approve quality -> awaiting_price
      Reject  -> rejected                       Reject -> rejected
                                              Pricing page, "Waiting for price"
                                                tick models, type the rate and the percents,
                                                Calculate, then Publish -> published
  Live models -> Pricing page, "Live models": read-only list
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

## Pricing page API

Code: `products/pricing.py` (rules and calculation), `pricing_serializers.py`, `pricing_views.py`.
All routes are under `/api/v1/admin/products/pricing/`, for administrators with the authenticator
mark only. List and calculate use the `admin_pricing_read` limit (120/min); publish and hours use
`admin_product_write` (60/min). Prices are USD only. At most 200 models per action.

### The formula

```
base price     = hours_spent x rate                          (per model; one rate for the selection)
package price  = round(base price x percent / 100)           (whole dollars, half up)
```

- The admin types **one rate** and **one percent for each of the five packages** (With Light Rig,
  Without Light Rig, With Environment, GLB Only, Whole File). They apply to every ticked model.
- Each model's `hours_spent` comes from the uploader (`docs/batch-ingest-contract.md`) and can be
  edited on the page.
- A model is priced only for the packages it **has**: a model with three packages gets three
  prices, the percents of the other two are not used for it.
- Rate: above 0, at most 100,000. Percent: above 0, at most 200. All five percents are required.

### `GET pricing/?tab=waiting|live`

- **waiting**: `awaiting_price` models. **live**: published paid models. Free uploads never appear.
- Filters: `category_id` (a main category includes its subcategories), `subcategory_id`, `search`
  (name or model ID), `import_batch_id`, `ordering` (`name`, `price`, `polygon_count`,
  `hours_spent`, `created_at`, each also with a leading `-`), `page`, `page_size`.
- Each row: the stored `price`, `discount_price`, `discount_ends_at`, `discount_active`,
  `buyer_pays`, `hours_spent`, `polygon_count`, `category`, `packages` (each with its price and
  sale) and `bundle_warning`. `GET pricing/batches/?tab=` lists the upload batch IDs.

### `POST pricing/calculate/`

Body: `product_ids`, `rate`, `percents` (`{kind: percent}` for all five kinds). Changes nothing.
Returns `rows` (`id`, `name`, `sku`, `hours_spent`, `error`, and `packages` with `kind`, `label`,
`old_price`, `price`), `summary` (`models`, `priced`, `errors`) and `preview_token`.

A row has an `error` and no prices when:
- the model is not waiting for a price, is a free upload, or is not USD;
- it has no hours ("Enter the hours spent first.") or no packages;
- a package would cost less than 0.50 USD after rounding.

### `POST pricing/publish/`

Body: the same as `calculate`, plus `preview_token` (from the calculation the admin saw) and
`confirm_count` (the number of selected models). The server calculates again and refuses with
**409** if the result differs from the token (hours, prices or a percent changed, or the model went
back to QA). Otherwise each model is handled **on its own**, in one transaction:

1. its package prices are saved (a stored sale on the package is cleared) with one
   `ProductPriceChange` row per changed package, source `pricing_page`, one shared `batch_id`;
2. the publish checks run (every package priced, files in storage, category, preview if present);
3. the model goes `published`.

A model that fails any step keeps its old prices and stays waiting, and its `reason` is returned.
Returns `batch_id`, `models`, `published`, `failed` and `results` (`id`, `name`, `sku`, `published`,
`reason`). The audit log gets one `pricing_publish` entry (rate, percents, published and failed IDs).

### `POST pricing/hours/`

Body: `items: [{id, hours_spent}]` (each model once, `null` clears). Hours above 0. Audit entry
`pricing_hours`.


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
- **Filters**: category, subcategory, search by name or model ID, upload batch, sort.
- **List**: tick models on any page, up to 200 in total. Each row shows the model, category,
  polygons, its **hours** (a box in the Waiting tab, saved when it loses focus), each **variation**
  the model has with its price ("Not set" until priced), and the "From" price.
- **Model Pricing box** (Waiting tab, on the left of the list): "Base price = Hours × [rate]" and one
  "[Variation] = Base price × [%]" line for each of the five variations.
- **Calculate prices (N)**: sends the ticked models and the boxes to `calculate`. The new price shows
  beside each variation in the list ("Not set → $80.00"). A model that cannot be priced shows why.
  Changing the selection, a box or any hours clears the calculation.
- **Publish selected (N)**: enabled only after a calculation. A summary first (how many are priced and
  how many will stay waiting), then `publish`, then the results with the reason for each model that
  stayed waiting. A 409 clears the calculation and asks for a new one.
- Models with a pending re-upload show an "Update in QA" label.
- The Live tab is read-only for now (no box, no publish).


### Shop

- **Product page**: the sale price, the normal price crossed out, the "-N%" badge, and
  "Sale ends …" in the visitor's own time when the sale has an end.
- **Product card**: "-N%" instead of "Sale".
