# Project Status

## 2026-10-07 — Checkout return keeps the session and offers the model download

- Status: Complete
- Root cause: Stripe sends the buyer back with a full page load. The access token lives only in memory, so the app rotates the httpOnly refresh cookie on startup. In development, React StrictMode starts that rotation twice. The second request presents the already-blacklisted refresh token, and that 401 deleted the replacement cookie, so the success page treated the buyer as signed out.
- Implementation: Refresh rotation is single-flight. A blacklisted refresh token is still rejected and does not issue a new session, but that 401 no longer deletes the replacement cookie. Expired or malformed cookies are still cleared. Session restore retries once when the failure is a rotated token. The paid success card has a Download model button that uses the existing authenticated catalog download.
- Database changes: None.
- API surface changes: None. No endpoints added, modified, or removed.
- Security review:
  - Reuse of a rotated refresh token still returns 401 and does not mint a new access token.
  - Expired and malformed refresh cookies are still cleared.
  - Download model only appears for a paid order that already includes server-built file rows, and it calls the existing owner-only download endpoint.
  - Absolute download links are reduced to an `/api/v1/downloads/` path before the request, so the bearer token is not sent to another host. Other paths and path traversal are rejected.
- Definition of Done:
  - Root cause identified and fixed with the existing cookie refresh and order download flow.
  - Regression coverage added for overlapping refresh calls, blacklisted-cookie reuse, malformed-cookie clearing, the success-card Download model button, and unsafe download URLs.
  - Backend authentication API tests: 17/17 passed.
  - Frontend checkout, session, and download tests: passed.
  - Django system check: passed.
  - Django migration check: no changes detected.
  - Frontend lint on the touched files: passed.
  - Frontend production build: passed.
  - Browser check: a full reload of `/checkout/success` for a paid order stayed signed in and showed Download model. The click reached the existing download endpoint. The sample `tree` file returned 404 because the stored object is missing; the session stayed signed in.

## 2026-10-05 — Product comments submission fix

- Status: Complete
- Branch: `bug-fix-2026-10-05`
- Root causes:
  - The product-page UI allowed any signed-in user to post, but the API still required a completed paid purchase and returned `403 not_purchased`.
  - The button and API also required a star rating, so a user typing only a comment could never submit it.
- Implementation: Authenticated users can post text-only comments on published items. Ratings are optional, but a submission must contain a comment or a rating. Unrated comments render without stars and are excluded from rating averages/counts.
- Database changes: Added `reviews.0002_review_rating_nullable` to allow `Review.rating` to be null.
- API surface changes: No endpoints added or removed. `POST /api/v1/reviews/` now accepts omitted/null `rating`, and `GET /api/v1/reviews/eligibility/` reflects authenticated posting access.
- Security review:
  - Posting still requires JWT authentication.
  - The existing `review_write` user throttle remains enabled for POST requests.
  - Only published catalog items accept comments; draft/unavailable items remain blocked.
  - Rating-range and text-length validation, ORM-based writes, per-user/item uniqueness, and admin hide/delete moderation remain enforced.
  - Empty submissions are rejected by both serializer and service validation.
  - Accepted product decision: ratings/comments are no longer purchase-verified, matching the current UI invitation to all signed-in users.
- Definition of Done:
  - Root cause identified and fixed using the existing review implementation.
  - Regression coverage added for a text-only comment by an authenticated user without a purchase and for empty-submission rejection.
  - Backend review suite: 14/14 passed.
  - Product details frontend suite: 13/13 passed.
  - Django system check: passed.
  - Django migration check: no changes detected.
  - Frontend production build: passed.
  - Frontend lint: passed with four pre-existing warnings in unrelated files.
