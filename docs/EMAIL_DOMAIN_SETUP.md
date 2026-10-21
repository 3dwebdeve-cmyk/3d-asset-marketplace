# Email Domain Setup (Brevo + Cloudflare DNS)

Account emails (verification, password reset, receipts) must reach the inbox, not spam. Gmail and
Yahoo now reject or spam-folder mail that is not authenticated for the domain in its "From" address.

The rule: **send from the shop's own domain** (for example `noreply@assethive3d.com`) and prove to
mailbox providers that Brevo may send for it. A `@gmail.com` sender sent through Brevo always fails
this check; `check_email_config` refuses it in production.

## 1. Authenticate the domain in Brevo

1. Brevo → Settings → Senders, domains & dedicated IPs → **Domains** → Add a domain →
   `assethive3d.com`.
2. Choose to add the records yourself (or "Authenticate with Cloudflare" if Brevo offers it; it adds
   the same records for you).
3. Brevo lists 3 or 4 records. Keep that page open.

## 2. Add the records in Cloudflare

Cloudflare → `assethive3d.com` → DNS → Records → Add record, once for each record Brevo lists.
Copy the type, name and value exactly; they are specific to your account.

| What it is | Type | Name | Notes |
|---|---|---|---|
| Brevo ownership code | TXT | `@` | Value starts with `brevo-code:` |
| DKIM (signs each email) | CNAME (or TXT) | e.g. `brevo1._domainkey`, `brevo2._domainkey` | **Proxy status: DNS only (grey cloud).** A proxied (orange) CNAME breaks DKIM |
| DMARC (policy) | TXT | `_dmarc` | Start with `p=none`, see step 4 |
| SPF (if Brevo lists one) | TXT | `@` | See below |

**SPF: only one record per domain.** If an SPF record (`v=spf1 ...`) already exists, for example
from Cloudflare Email Routing or Google Workspace, do not add a second one. Merge them into one:

```
v=spf1 include:_spf.mx.cloudflare.net include:spf.brevo.com ~all
```

(Keep the `include:` parts you already had, add Brevo's, and keep one `~all` at the end.)

Back in Brevo, press **Authenticate this email domain**. DNS changes usually show within minutes;
allow up to a few hours.

## 3. Set the sender on Render

Backend service → Environment:

| Name | Value |
|---|---|
| `DEFAULT_FROM_EMAIL` | `AssetHive3D <noreply@assethive3d.com>` |

Add the same address in Brevo → Senders. Save and deploy.

Replies: `noreply@` has no mailbox. If customers may reply to a receipt, use an address that
exists (Cloudflare Email Routing can forward `support@assethive3d.com` to the team inbox for free).

## 4. Check

1. Register a new account with a Gmail address, or with a shell run
   `python manage.py check_email_config --fail-on-warnings --send-test-email you@gmail.com`.
2. In Gmail, open the email → ⋮ → **Show original**. SPF, DKIM and DMARC must all say **PASS**,
   and DKIM must name `assethive3d.com`.
3. Optional: send one email to the address shown on mail-tester.com; aim for 9/10 or more.

## 5. Tighten DMARC later

After 2 to 4 weeks with all emails passing (Brevo → Statistics, and no spam complaints), change
the `_dmarc` record's `p=none` to `p=quarantine`. This tells inboxes to spam-folder mail that
pretends to be from your domain. `p=reject` is the final step, once you are sure every service that
sends as `@assethive3d.com` is authenticated.

## Record

| Date | Domain authenticated in Brevo | Sender set on Render | Gmail shows SPF/DKIM/DMARC PASS | DMARC policy | Initials |
|------|-------------------------------|----------------------|---------------------------------|--------------|----------|
|      |                               |                      |                                 | none         |          |
