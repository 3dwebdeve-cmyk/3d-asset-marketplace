# Load Smoke Checklist

A light check of the critical paths: health, product list, product detail, search, public
CDN URLs, and checkout session creation (Stripe is mocked, so nothing is charged).

```
docker compose exec web python manage.py check_load_smoke
docker compose exec web python manage.py check_load_smoke --iterations 20 --fail-on-warnings
```

- Fails on non-success responses, or on query counts that suggest an N+1 problem
  (list 6, detail 8, search 12 queries).
- Latency over 2 seconds is reported as advisory only, because hardware varies.
- `--iterations` (1 to 200) repeats list, detail and search to report p50 and p95 latency.
- With R2 on, catalog image and preview URLs must sit under `R2_PUBLIC_BASE_URL`.

Run it on staging with `DEBUG=False` and record the result.

| Date | Host | Iterations | p95 (ms) | Result | Initials |
|------|------|------------|----------|--------|----------|
|      |      |            |          |        |          |
