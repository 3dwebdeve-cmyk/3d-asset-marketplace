# Backups and a Restore Rehearsal on Render

The shop's data (accounts, orders, payments, the catalog) lives in the Render Postgres database.
Product files and images live in Cloudflare R2. A backup only counts once a restore has been tried,
so do the rehearsal below when the paid database starts, and again every three months.

(`BACKUP_RESTORE_DRILL.md` is for a self-hosted Docker server and does not apply on Render.)

## What exists today

| Plan | Backups |
|---|---|
| Render free Postgres | **None**, and the database is deleted about 30 days after it was created. Use the manual copy below until it is upgraded. |
| Render paid Postgres | Automatic. Render keeps a recent history you can restore to a chosen moment (point-in-time recovery) and daily exports you can download. Check the length of the history in the database's **Recovery** page; it depends on the plan. |
| Cloudflare R2 (files) | Stored redundantly by Cloudflare, but a deleted file cannot be brought back. Keep the original model and plugin files the team uploads in company storage as well. |

## Manual copy (free plan, or an extra copy before risky changes)

On a trusted computer with PostgreSQL's tools installed (`pg_dump` version 16 or newer):

1. Render → the Postgres service → **Connect** → copy the **External Database URL**. It contains the
   database password: do not paste it into chats, documents or the repository.
2. Run:
   ```
   pg_dump --format=custom --no-owner --file=assethive-YYYY-MM-DD.dump "<External Database URL>"
   ```
3. The file contains customer accounts and orders. Store it encrypted (for example in a password
   manager's file storage or an encrypted drive), never in the repository, email or a shared folder.
   Keep the last few and delete older ones.

## Restore rehearsal (about 30 minutes, paid plan)

This restores into a **new, separate** database; the live shop is not touched.

1. Write down a few numbers from the live database first. Render → Postgres → **Shell** (or `psql`
   with the External Database URL):
   ```
   SELECT (SELECT count(*) FROM users) AS users, (SELECT count(*) FROM orders) AS orders,
          (SELECT count(*) FROM products) AS products, (SELECT max(created_at) FROM orders) AS last_order;
   ```
2. Render → Postgres → **Recovery** → restore to a moment about an hour ago. Render creates a new
   database with its own name; wait until it shows **Available**.
3. Run the same query on the **new** database. The counts should match, apart from anything created
   in the last hour.
4. Note the date, the time it took, and the result in the table below.
5. Delete the new database (it is billed while it exists): Render → the restored database →
   Settings → Delete.

To rehearse from a manual copy instead: create an empty database (locally or a temporary Render
one) and run `pg_restore --no-owner --dbname="<its URL>" assethive-YYYY-MM-DD.dump`, then step 3.

## A real restore (data was lost or damaged)

1. Put a notice on the team channel; stop admin changes.
2. Restore into a new database as in steps 2 and 3 above, to a moment **before** the damage.
3. Render → backend service → Environment → set `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER` and
   `DB_PASSWORD` to the new database's values (its **Connect** page, internal connection) →
   **Save, rebuild and deploy**. Note the old values first, so you can switch back.
4. Check the shop: sign in, open an order, open a product, `https://assethive3d.com/api/v1/healthz/`.
5. Orders paid between the restore point and now exist in Stripe but not in the database. Compare
   with Stripe → Payments for that period and fix them with `reconcile_checkout` (`RUNBOOK.md`,
   Payments). Keep the old database until everything is checked, then delete it.

## Record

| Date | Type (rehearsal / manual copy / real) | Restored to | Counts matched | Time taken | Initials |
|------|----------------------------------------|-------------|----------------|------------|----------|
|      |                                        |             |                |            |          |
