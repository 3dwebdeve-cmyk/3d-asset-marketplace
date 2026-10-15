# Stripe Radar Rules

Downloads unlock as soon as Stripe confirms payment, so fraud must be stopped
**before** the charge. A Radar "review" does not hold a digital order: the buyer has
already downloaded by the time anyone looks. Prefer **block** for anything you would
not want to fulfil.

What the app already does: checkout rate limits (10 per minute, 30 per day per
account), verified email before checkout, licenses revoked on refund or dispute, and a
daily comparison with Stripe (`reconcile_stripe_payments`, see
`STRIPE_SANDBOX_CHECKLIST.md`).

## Free Radar (every Stripe account)

Dashboard → Radar → Rules:
1. Keep **Block if :risk_level: = 'highest'** on (default).
2. Settings → turn on Stripe's card-testing protection if it is offered.
3. Payments → Settings: require CVC and postal code checks where available.

## Custom rules (Radar for Fraud Teams, paid add-on)

Add them in this order, test each in test mode first ("Test rule" shows which past
payments it would have caught), and note the date below.

| Rule | Why |
|---|---|
| `Block if :risk_level: = 'elevated'` | No manual review is possible before download |
| `Block if :cvc_check: = 'fail'` | Wrong security code |
| `Block if :address_zip_check: = 'fail'` | Wrong postal code (when the card network checks it) |
| `Block if :risk_score: > 65` | Tighten later if fraud gets through; loosen if real buyers are blocked |
| `Review if :card_country: != :ip_country:` | Common for travellers; review only, to watch the pattern |
| `Review if :is_anonymous_ip:` | VPN, Tor or proxy |

Velocity rules (card testing, many cards from one buyer): in the rule editor, pick the
attributes for **declined charges per IP address per hour** and **cards per email per
day**, and block above about 3. The editor lists the exact attribute names for your
account.

Lists: add emails, card fingerprints or IPs that charged back to the
`Block if :email: in @blocklist` style lists. Disputes appear in the admin console and
in the daily reconciliation.

## Review regularly

- Weekly at first: Radar → Reviews and blocked payments. A real customer blocked means a
  rule is too strict.
- Monthly: dispute rate (Payments → Disputes). Card networks start penalties near 0.75%.

## Record

| Date | Rules added or changed | Tested in test mode | Initials |
|------|------------------------|---------------------|----------|
|      |                        |                     |          |
