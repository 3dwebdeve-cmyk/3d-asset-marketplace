# Local Development with Docker Compose

`docker-compose.yml` is secure by default (production profile, SSL redirect, HSTS,
SMTP email, Django admin off). Local development needs relaxed values, which live in
an override file that Compose loads automatically.

## One-time setup

```
cp .env.example .env                      # then fill in SECRET_KEY and DB_PASSWORD
cp docker-compose.override.example.yml docker-compose.override.yml
docker compose up --build
```

`docker-compose.override.yml` is gitignored. It switches the stack to the
`development` profile, plain HTTP, console email, localhost frontend URLs and the
Django admin.

## End-to-end stack

The E2E overlay carries its own local values, so it does not need the override file:

```
docker compose -f docker-compose.yml -f docker-compose.e2e.yml up --build -d
docker compose -f docker-compose.yml -f docker-compose.e2e.yml exec web python manage.py seed_e2e_commerce
```

## Servers

Never create `docker-compose.override.yml` on staging or production. Use
`COMPOSE_FILE=docker-compose.yml:docker-compose.prod.yml`. The release and rollback
scripts refuse to run when an override file is present and `COMPOSE_FILE` is unset.
