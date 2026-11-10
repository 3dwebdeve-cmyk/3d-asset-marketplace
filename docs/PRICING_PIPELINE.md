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
A sale price is lower than the normal price and at least the checkout minimum (0.50 USD).

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

## Part 2 (Pricing page API) and Part 3 (screens)

Not built yet. See the plan in `MANUAL_STEPS.md`. Fixed decisions: USD only; poly levels Low
< 10,000, Mid 10,000-100,000, High > 100,000 (from `polygon_count`; none = Unknown); at most 200
models per action; at most 90% off; over 50% off needs a typed confirmation; the server
calculates every price; sale end chosen in the admin's local time (IST), stored in UTC; two
steps (save, then publish with a summary); live models allow sales and normal-price changes.
