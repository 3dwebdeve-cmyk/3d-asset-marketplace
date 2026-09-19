# Cloudflare R2 staging checklist (Phase C) — both buckets

**Scope:** Configure **public** + **private** R2 buckets so previews/thumbnails and paid packages work. Live cutover still follows `docs/PRODUCTION_CHECKLIST.md`.

**Related:** `backend/config/storages.py`, `backend/config/media.py` (`resolve_private_download`), `python manage.py migrate_local_media_to_r2`, `python manage.py verify_r2`, `python manage.py audit_published_packages`.

---

## 1. Create both buckets

In Cloudflare Dashboard → R2:

1. Create **public** bucket (example name: `3dam-public`) — thumbnails, preview GLBs, gallery, avatars.
2. Create **private** bucket (example name: `3dam-private`) — paid `package.zip` / plugin zips, custom-project files, optional Postgres backups.
3. Enable a public access URL / custom domain for the **public** bucket only. Copy that base URL into `R2_PUBLIC_BASE_URL` (no trailing slash).
4. Create an API token with Object Read & Write on both buckets. Copy Account ID + Access Key ID + Secret.

Do **not** make the private bucket publicly listable or CDN-fronted.

---

## 2. Env (never commit secrets)

In root `.env` and/or `backend/.env`:

```env
R2_ACCOUNT_ID=<cloudflare_account_id>
R2_ACCESS_KEY_ID=<token_access_key>
R2_SECRET_ACCESS_KEY=<token_secret>
R2_ENDPOINT_URL=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
R2_PUBLIC_BUCKET=3dam-public
R2_PRIVATE_BUCKET=3dam-private
R2_PUBLIC_BASE_URL=https://pub-xxxxxxxx.r2.dev
R2_SIGNED_URL_EXPIRY=300
```

`R2_ENABLED` is derived: all of the above (except expiry) must be set. Tests force R2 off.

Restart `runserver` / Compose `web` + `worker` after changes.

---

## 3. Verify connectivity

```bash
# Local venv
cd backend && python manage.py verify_r2
cd backend && python manage.py verify_r2 --smoke-presign

# Compose (R2_* must be in root `.env` — Compose does not load backend/.env)
docker compose exec web python manage.py verify_r2
docker compose exec web python manage.py verify_r2 --smoke-presign
```

Expect: `R2 OK public=ok private=ok`. With `--smoke-presign`, also expect signed JSON (no `storage_path`), a successful GET of the throwaway object, and cleanup. Fix credentials/bucket names if the command exits non-zero.

**Compose note:** copy the same `R2_*` values (including `R2_SIGNED_URL_EXPIRY`) into the repo-root `.env` used by `docker-compose.yml`, then recreate `web` + `worker`.

---

## 4. Migrate leftover local MEDIA (if any)

```bash
python manage.py migrate_local_media_to_r2 --dry-run
python manage.py migrate_local_media_to_r2
```

Requires `R2_ENABLED`. Copies public + private catalog/custom-project objects and rewrites public URLs.

---

## 5. Audit published SKUs

```bash
python manage.py audit_published_packages
python manage.py audit_published_packages --fail-on-missing
```

Every **published** product/plugin must have a resolvable private package object. Fix missing uploads or unpublish before launch. QA approve (products) and draft→published (plugins) now refuse publish when the object is missing.

---

## 6. Smoke (happy path)

1. Upload / import a product with preview + private package (or ensure package exists on private R2).
2. Approve / publish → appears in public catalog.
3. Complete a **test-mode** purchase (see `docs/STRIPE_SANDBOX_CHECKLIST.md`).
4. Entitled download returns signed JSON (`download_url` + `expires_in`) when R2 is on — never `storage_path` in API responses.
5. Confirm public thumbnail/preview URLs use `R2_PUBLIC_BASE_URL`.

---

## Operator checkboxes

- [ ] Both buckets created; private not public
- [ ] All `R2_*` set on web + worker (root `.env` for Compose); `verify_r2` OK
- [ ] `verify_r2 --smoke-presign` OK (signed JSON, no `storage_path`)
- [ ] Local leftovers migrated (if needed)
- [ ] `audit_published_packages --fail-on-missing` clean (after catalog exists)
- [ ] Paid download smoke (optional full purchase) + `storage_path` omitted from public APIs
