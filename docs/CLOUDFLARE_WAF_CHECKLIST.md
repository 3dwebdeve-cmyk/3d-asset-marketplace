# Cloudflare WAF / bot protection (Phase H3)

**Scope:** Edge bot protection in front of Nginx. Keep Django/DRF throttles as a second layer — do not disable them.

---

## 1. Enable at Cloudflare

1. Put the public hostname behind Cloudflare (proxied / orange cloud).
2. Enable **Bot Fight Mode** or Super Bot Fight (plan-dependent).
3. Enable **WAF** managed rules (OWASP / Cloudflare managed).
4. Rate-limit rule (optional): challenge or block burst traffic to `/api/v1/auth/login/` and `/api/v1/auth/register/`.

---

## 2. Preserve app throttles

DRF still enforces login/register/checkout throttles via Redis. Cloudflare is complementary, not a replacement.

---

## 3. Smoke

- [ ] Anonymous browse works through Cloudflare
- [ ] Legitimate login succeeds
- [ ] Scripted login flood is challenged/blocked at edge **or** returns app 429
- [ ] Stripe webhook endpoint still reachable from Stripe IPs (allowlist / skip challenge on `/api/v1/payments/webhook/`)

---

## 4. Sign-off

| Env | Date | Initials |
|-----|------|----------|
| Staging | | |
| Production | | |
