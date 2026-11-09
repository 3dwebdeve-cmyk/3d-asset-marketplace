# Scheduled maintenance checks

The cron installer now schedules `backend/scripts/run_maintenance.sh`. The runner
attempts all nine existing tasks, even if an earlier task exits unsuccessfully.
It logs each task's start, pass/fail and exit code, then prints total successes,
failures and the names of failed tasks. It exits 1 if any task failed, or 0 when
all passed. Detailed command output stays in the maintenance log.

On an existing Linux server, rerun:

```sh
bash backend/scripts/install_maintenance_cron.sh
```

The installer replaces its existing marked cron entry rather than adding a duplicate.
Existing `MAINTENANCE_CRON_SCHEDULE`, `MAINTENANCE_CRON_LOG` and `COMPOSE_FILE`
configuration still applies. Preview the entry without installing it with
`INSTALL_MAINTENANCE_CRON_DRY_RUN=1 bash backend/scripts/install_maintenance_cron.sh`.

Monitor the log and the nonzero result with the deployment's monitoring service.
This change does not configure a new alert recipient or send failure emails.
It handles commands that return a failure; it does not add task timeouts or
overlapping-run locks. Those remain separate scheduling improvements.

The in-web `run_maintenance_loop` already catches failures separately and continues
its own task list. Its existing behavior is unchanged.
