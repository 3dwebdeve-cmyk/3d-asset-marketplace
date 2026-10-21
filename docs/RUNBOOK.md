# Runbook: what to do when something goes wrong

For whoever looks after the live shop. Each section matches an uptime alert or a line in the daily
report email. Do the steps in order and stop when the problem is gone.

Where things are:
- **Cloudflare** (dashboard → Workers & Pages → `3d-asset-marketplace`): the website and the Worker
  that forwards `/api` calls.
- **Render** (dashboard → the backend web service): the Django backend, its **Logs**, **Events**
  (deploys) and **Environment**. The Postgres database is a separate Render service.
- **Stripe**, **Brevo** (email) and **Cloudflare R2** (files) each have their own dashboard.

## Set up the alerts (once, about 10 minutes)

### Uptime alerts

A free UptimeRobot account (uptimerobot.com, free plan: checks every 5 minutes, email alerts):

1. Add **New monitor → HTTP(s)**: name `Shop`, URL `https://assethive3d.com/`, interval 5 minutes.
2. Add **New monitor → Keyword**: name `Backend`, URL `https://assethive3d.com/api/v1/healthz/`,
   keyword `"status":"ok"` (alert when the keyword is **not** found), interval 5 minutes.
   This check goes through Cloudflare to Render and the database, so it fails if any of them fails.
3. Alert contacts: the team's email (add a second person so alerts are not missed on holidays).
4. Optional: a public status page (Status pages → add both monitors).

Side effect: the 5-minute check keeps Render's free service awake, so visitors no longer wait about
a minute for it to wake up. One always-on free service fits in Render's free hours.

### Daily report email

The backend emails a short report once a day (orders, payments, failed emails, stuck jobs and the
result of the daily tasks). It needs these on Render → backend → Environment:

| Name | Value |
|---|---|
| `RUN_MAINTENANCE_LOOP_IN_WEB` | `true` (runs the daily tasks and sends the report) |
| `OPS_REPORT_RECIPIENTS` | team inboxes, comma separated. If empty, every active Administrator gets it |

The first report arrives about 10 minutes after a deploy, then once a day. The subject says
`all OK` or how many problems need attention; problems are listed at the top. No report for two
days means the daily loop is not running: check the variable above and the Render logs for
`maintenance_run_finished`.

## Uptime alert: Shop is down

1. Open https://assethive3d.com/ yourself (and on a phone using mobile data, to rule out your network).
2. Cloudflare status (cloudflarestatus.com). If Cloudflare has an incident, wait.
3. Cloudflare → Workers & Pages → the Worker → **Deployments**: if the problem started with the
   newest deployment, use **Rollback** on the previous one.
4. Cloudflare → the domain → **DNS** and **SSL/TLS**: nothing should have changed. Domain renewal
   date: Cloudflare → Domain Registration (or your registrar).

## Uptime alert: Backend is down (or pages load but show no products)

1. Open https://assethive3d.com/api/v1/healthz/ . The answer says which part fails:
   - `"database":"error"`: see **Database** below.
   - A Cloudflare error page or 502 "temporarily unavailable": Render is down or restarting.
2. Render → backend service → **Events**: is a deploy running or did one fail? A failed deploy
   leaves the previous version running; the log of the failed deploy says why (often a missing or
   wrong environment variable).
3. Render → **Logs**: look for `Out of memory`, `Worker timeout` or a traceback. Render restarts the
   service by itself after a crash; if it keeps crashing after a deploy, roll back: **Events** →
   the last deploy that worked → **Rollback**.
4. Render status (status.render.com).

### Database

1. Render → the Postgres service: status, storage used, and (free plan) the expiry date. A free
   database is deleted about 30 days after creation unless upgraded.
2. Storage full: upgrade the plan or remove old data. The daily tasks already prune expired records.

## Payments

**An order is stuck** (report: "Checkouts waiting for reconciliation", or a customer paid but has no
download):

1. Stripe → Developers → Webhooks → the endpoint → recent deliveries. Errors there mean Stripe could
   not tell the shop about the payment. A 400 means the signing secret on Render
   (`STRIPE_WEBHOOK_SECRET`) is wrong; a 503 means it is not set. Fix it and Stripe retries by
   itself for 3 days.
2. Once webhooks succeed, the order completes on its own. To fix one order by hand, on a shell:
   `python manage.py reconcile_checkout <order id>` (shows what it would do), then add `--execute`.

**Many failed card payments** (report: "possibly card testing"): someone may be trying stolen cards.
Stripe → Radar → check the blocked payments, and see `STRIPE_RADAR.md` for blocking rules.

**Report says "Last Stripe event received: never" or days ago, but there were sales:** the webhook
is not reaching the shop; see step 1 above.

## Disputes

A customer's bank is reversing a payment. Stripe → Payments → Disputes → respond with the evidence
(order, download history from the admin console, licence terms) before the deadline Stripe shows.
The customer's download access is removed automatically while the dispute is open.

## Emails do not arrive

1. Brevo → Transactional → Logs: was the email sent, bounced or blocked?
2. Brevo → Senders & domains: the domain must show as authenticated (`EMAIL_DOMAIN_SETUP.md`).
3. Brevo → account: the free plan sends 300 emails a day; above that, mail waits until the next day.
4. Report says background jobs "waiting too long": the job processor is not running. Render →
   Environment must have `RUN_BACKGROUND_JOBS_IN_WEB=true`; the log shows
   `Starting the background job processor` after each deploy.
5. Report says jobs "gave up after all retries": usually a wrong `BREVO_API_KEY` or a Brevo outage.
   Fix the cause; the affected emails (for example a password reset) can be requested again by the
   customer.

## A daily task failed

The report names the task. Render → Logs, search for `maintenance_task_failed task=<name>`; the
lines just before it show the error.
- `check_payment_reconciliation` or `reconcile_stripe_payments`: the shop and Stripe disagree about
  a payment. The log names the payment and order; fix it as under **Payments**.
- `prune_expired_records` or `manage_background_jobs`: usually a short database problem; if it fails
  again the next day, see **Database**.

## After fixing anything

Note what happened, when, and what fixed it (a shared document is enough). The same problem twice is
a sign something needs a permanent fix.
