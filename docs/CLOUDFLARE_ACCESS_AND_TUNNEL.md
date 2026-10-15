# Cloudflare Access, Tunnel and HSTS

Three edge controls that only the Cloudflare dashboard can set. They sit in front of
the app's own controls (admin IP allowlist, admin 2FA, rate limits); none of them
replaces those. `marketplace.example.com` stands for your public hostname.

## 1. Cloudflare Tunnel (origin with no open inbound ports)

With a tunnel, the server makes an outbound connection to Cloudflare and accepts no
inbound web traffic, so nobody can reach the origin around the WAF.

1. Zero Trust → Networks → Tunnels → Create a tunnel (cloudflared). Name it
   `marketplace-prod`. Copy the tunnel token.
2. On the server, run `cloudflared` as a service with that token
   (`cloudflared service install <token>`), or as a container on the Compose network.
3. Public hostname: `marketplace.example.com` → `http://localhost:8080` (the published
   `FRONTEND_PORT`), or `http://frontend:80` if cloudflared runs on the Compose network (the container listens on 80).
4. **Real visitor IP (required).** Behind a tunnel, nginx sees cloudflared as the
   peer, not a Cloudflare range, so it ignores `CF-Connecting-IP`. Every visitor would
   then share one IP: rate limits would hit all users at once, and the admin IP
   allowlist would stop working. Add cloudflared's address to the trusted list in
   `frontend/nginx.conf`, next to the Cloudflare ranges:
   ```
   set_real_ip_from 127.0.0.1;        # cloudflared on the host
   # or the Compose network subnet if cloudflared runs as a container, e.g.
   # set_real_ip_from 172.18.0.0/16;
   ```
   Only do this when the tunnel is the **only** way in (step 5); otherwise anything
   on that address could forge the header.
5. Close the inbound ports: in the host firewall or cloud security group, remove 80,
   443 and `FRONTEND_PORT` from inbound rules entirely. Keep SSH limited to your IP.
6. Check: `curl -I http://<server-ip>:8080/` from outside must time out, and the site
   must still load through `https://marketplace.example.com`. Sign in to `/console` and
   confirm the admin IP allowlist sees your real IP (a wrong IP gives "Forbidden").

If you do not use a tunnel, keep the firewall rule from `PRODUCTION_CHECKLIST.md`
(inbound only from Cloudflare ranges) instead.

## 2. Cloudflare Access for the admin console

Access asks for an identity check (email one-time code, or Google) at Cloudflare's
edge before a request reaches the server. A stolen admin password plus 2FA code is
then still not enough without the admin's email account.

1. Zero Trust → Access → Applications → Add → Self-hosted. Name: `Marketplace admin`.
2. Add three destinations on `marketplace.example.com`, all in this one application
   so they share one sign-in cookie:
   - path `console*`
   - path `api/v1/admin/*`
   - path `api/v1/auth/admin/*`
3. Session duration: **12 hours** (longer than the 8-hour admin session, so Access never
   expires in the middle of a console session; if it does, admin API calls fail until
   the page is reloaded).
4. Policy: Action **Allow**, Include → Emails → the administrator addresses only.
   Add Require → Login method → One-time PIN (or your Google identity provider).
   Do not add an "Everyone" or bypass rule.
5. Do **not** protect `/api/v1/auth/login/`, `/api/v1/payments/webhook/` or any other
   path; customers and Stripe must reach them.
6. Check from a private browser window: `/console` shows the Cloudflare sign-in first;
   the shop pages and customer login do not. Then sign in and use the console normally.

Keep `ADMIN_CONSOLE_ALLOWED_IPS` set as well; the app still requires it on staging and
production. Access does its check at the edge only, so it relies on the origin being
closed (section 1 or the firewall rule).

## 3. HSTS and TLS

The app already sends `Strict-Transport-Security: max-age=31536000; includeSubDomains;
preload` from Django (API), nginx and the Worker (pages). Browsers ignore it over plain
http, so local development is unaffected.

In Cloudflare → SSL/TLS:
1. Encryption mode: **Full (strict)**.
2. Edge Certificates: Always Use HTTPS **on**, Minimum TLS Version **1.2**, Automatic
   HTTPS Rewrites **on**.
3. Leave Cloudflare's own HSTS setting off; the origin already sends the header, and two
   different values are confusing.
4. `includeSubDomains` means every subdomain (staging, mail web pages, etc.) must work on
   https. Check them before the first production deploy.
5. Preload list (optional, hard to undo, months to remove): only after the site has run
   on https for a few weeks with no problems, submit the domain at hstspreload.org.

Check: `curl -sI https://marketplace.example.com/ | grep -i strict-transport` shows the
header, and `curl -sI http://marketplace.example.com/` redirects to https.

## Record

| Date | Tunnel on, ports closed | nginx real IP updated | Access app + policy | Full (strict), TLS 1.2 | HSTS header seen | Initials |
|------|-------------------------|-----------------------|---------------------|------------------------|------------------|----------|
|      |                         |                       |                     |                        |                  |          |
