# Rollback rehearsal (Phase K2)

**Related:** [`PRODUCTION_CHECKLIST.md`](PRODUCTION_CHECKLIST.md) §4.

Practice once on **staging** before production cutover.

---

## 1. Preconditions

1. Deploy with **immutable** image tags (not only `:latest`), e.g. `…-web:sha-abc` and `…-web:sha-def`.
2. Take a Postgres backup (`backup_postgres.sh`) before the rehearsal deploy.
3. Note current Stripe webhook idempotency behavior (events stored).

---

## 2. Rehearsal steps

1. Deploy tag **B** (new) over tag **A** (known good).
2. Smoke healthz + login.
3. Roll back to tag **A** (`docker compose up -d --no-deps web worker frontend` with previous tags).
4. Confirm healthz + catalog + one Stripe **test** checkout still fulfills.
5. Replay or wait for a Stripe retry → still idempotent (no double entitlement).

Do **not** reverse destructive migrations on the rehearsal DB; follow expand/contract policy in PRODUCTION_CHECKLIST §4.2.

---

## 3. Sign-off

| Item | Staging date | Initials |
|------|--------------|----------|
| Immutable tags used | | |
| Rollback to previous web/worker/frontend | | |
| Healthz + checkout after rollback | | |
| Webhook idempotency OK | | |
