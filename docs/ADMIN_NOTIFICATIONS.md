# Admin notifications and model approval reminders

The admin header bell polls every 60 seconds while the panel is open in the browser.
It shows the latest 30 active notifications with a total unread count. Read state is
per administrator. Opening a notification marks it read and opens its admin record.
Models leave the active notification list when approved, rejected or otherwise
removed from pending review. A later submission creates a new review notification.
Paid orders, disputed payments and checkouts needing reconciliation also create
notifications. Repeated saves/webhook retries do not create duplicate events.

## Reminder email

Models pending review for at least 72 hours are included in a one-time reminder to
`3dwebdeve@gmail.com`, configurable with `ADMIN_REVIEW_REMINDER_EMAIL`. Reading the
bell notification does not approve a model or suppress the email. Approval/rejection
before delivery does suppress it. Reminders are grouped in batches of up to 100 models.

The daily schedule means delivery occurs on the first scheduled run after 72 hours,
not necessarily at exactly 72 hours. Already-pending models are added by the migration,
using their last update time as the best available historical review date.

## Deployment

1. Deploy backend and run `python manage.py migrate --noinput` before serving it.
2. Deploy the frontend.
3. Keep `process_background_jobs` running and configure real outbound email.
4. For the existing in-web maintenance loop, enable `RUN_MAINTENANCE_LOOP_IN_WEB=True`.
   The loop now queues overdue approval reminders daily. A sleeping web host cannot
   promise delivery while asleep; use an always-on worker or external scheduler for that.
5. For cron deployments, reinstall `backend/scripts/install_maintenance_cron.sh` to
   include the new reminder command, or schedule `python manage.py send_review_reminders`
   daily. Do not run it just as a test on production: it queues real reminder emails.

The worker rechecks pending status before sending and records successful delivery so
later jobs skip those models. Provider failures use the existing retry queue. As with
ordinary email delivery, a crash after provider acceptance but before the database
commits can cause a duplicate on retry. Failed deliveries appear in mail logs/jobs.
This implementation does not send a real test email during development.
