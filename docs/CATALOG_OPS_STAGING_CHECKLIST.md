# Catalog Operations Checklist

## Publishing

- Products are created as drafts, get a package and a preview, are submitted for review
  (`pending_review`), and are published only by the approve action, which records the reviewer.
- Products and plugins in an inactive category are hidden from the storefront and cannot
  be bought.

## Checks

```
docker compose exec web python manage.py audit_published_packages --fail-on-missing
docker compose exec web python manage.py check_catalog_integrity --fail-on-orphans
docker compose exec web python manage.py check_batch_ingest
```

- `audit_published_packages` lists published items whose private package is missing.
- `check_catalog_integrity` finds cart, wishlist and review rows that point at deleted
  items (blocking), and order or download rows that do (advisory only).
- See `batch-ingest-contract.md` for imports.

## Seed data

`seed_e2e_commerce` creates accounts with public passwords and refuses to run unless
`DEPLOYMENT_PROFILE` is `test` or `development`. Never run seed commands on staging or
production data.
