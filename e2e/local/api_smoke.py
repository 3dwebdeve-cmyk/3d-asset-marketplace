"""Real-server smoke for the Pricing page API (docs/E2E_LOCAL.md, docs/PRICING_PIPELINE.md).

Runs against a local stack started with e2e/local/Start-LocalStack.ps1 (never a real server):
it goes through the real middleware, throttles, routing and JSON handling.

    python e2e/local/api_smoke.py [--base http://127.0.0.1:8001]

Signs in as the seeded admin, lists "Waiting for price", previews and saves a price for
PRC-WAIT-LOW, publishes it and checks the public product API shows it with that price.
Start-LocalStack re-seeds a clean scenario, so run it on a fresh stack. Standard library only.
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.parse
import urllib.request

ADMIN_EMAIL = "e2e-admin@example.com"
ADMIN_PASSWORD = "E2eAdminPass123!"
SKU = "PRC-WAIT-LOW"
PRICE = "12.00"
ALLOWED_HOSTS = {"127.0.0.1", "localhost"}


class SmokeFailure(AssertionError):
    pass


class Client:
    def __init__(self, base: str) -> None:
        self.base = base.rstrip("/")
        self.token: str | None = None

    def call(self, method: str, path: str, body: dict | None = None, *, query: dict | None = None):
        url = f"{self.base}{path}"
        if query:
            url += "?" + urllib.parse.urlencode(query)
        data = None if body is None else json.dumps(body).encode("utf-8")
        request = urllib.request.Request(url, data=data, method=method)
        request.add_header("Accept", "application/json")
        if data is not None:
            request.add_header("Content-Type", "application/json")
        if self.token:
            request.add_header("Authorization", f"Bearer {self.token}")
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                return response.status, _json(response.read()), response.headers
        except urllib.error.HTTPError as exc:
            return exc.code, _json(exc.read()), exc.headers


def _json(raw: bytes):
    try:
        return json.loads(raw.decode("utf-8") or "null")
    except ValueError:
        return raw[:300].decode("utf-8", "replace")


def check(condition: bool, message: str, detail=None) -> None:
    if not condition:
        raise SmokeFailure(f"{message}: {detail!r}" if detail is not None else message)
    print(f"  ok  {message}")


def run(base: str) -> None:
    host = urllib.parse.urlparse(base).hostname
    if host not in ALLOWED_HOSTS:
        raise SystemExit(f"Refusing to run against {base}: local stacks only.")
    client = Client(base)

    print("1. health and anonymous access")
    code, _, _ = client.call("GET", "/api/v1/healthz/")
    check(code == 200, "healthz answers 200", code)
    code, _, _ = client.call("GET", "/api/v1/admin/products/pricing/", query={"tab": "waiting"})
    check(code == 401, "pricing list refuses an anonymous visitor (401)", code)

    print("2. admin sign-in")
    code, body, headers = client.call(
        "POST", "/api/v1/auth/admin/login/", {"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
    )
    check(code == 200, "admin login answers 200", body)
    token = body.get("access") if isinstance(body, dict) else None
    check(bool(token), "admin login returns an access token", body)
    cookies = headers.get_all("Set-Cookie") or []
    print(f"      set-cookie names: {[c.split('=', 1)[0] for c in cookies]}")
    client.token = token

    print("3. waiting tab")
    code, body, _ = client.call(
        "GET", "/api/v1/admin/products/pricing/", query={"tab": "waiting", "search": SKU}
    )
    check(code == 200, "waiting tab answers 200", body)
    rows = [row for row in body["results"] if row["sku"] == SKU]
    check(len(rows) == 1, f"{SKU} is in the waiting tab", body)
    row = rows[0]
    check(row["status"] == "awaiting_price", "it is awaiting_price", row["status"])
    check(row["poly_tier"] == "low", "its poly level is low", row["poly_tier"])
    product_id, slug = row["id"], row["slug"]
    code, body, _ = client.call(
        "GET", "/api/v1/admin/products/pricing/", query={"tab": "waiting", "poly": "low"}
    )
    check(
        code == 200 and product_id in {r["id"] for r in body["results"]},
        "poly=low filter lists it",
        code,
    )
    code, body, _ = client.call("GET", "/api/v1/admin/products/pricing/batches/", query={"tab": "waiting"})
    check(code == 200 and isinstance(body.get("results"), list), "batches list answers", body)
    code, _, _ = client.call("GET", f"/api/v1/products/{slug}/")
    check(code == 404, "it is not on the public store yet", code)

    print("4. preview and save a price")
    rule = {"product_ids": [product_id], "rule": "set_price", "price": PRICE}
    code, body, _ = client.call("POST", "/api/v1/admin/products/pricing/preview/", rule)
    check(code == 200, "preview answers 200", body)
    preview_row = body["rows"][0]
    check(preview_row["error"] == "", "preview row has no error", preview_row)
    check(preview_row["new_price"] == PRICE, f"preview new price is {PRICE}", preview_row)
    check(body["summary"]["changed"] == 1, "preview changes one model", body["summary"])
    token_value = body["preview_token"]

    code, body, _ = client.call(
        "POST", "/api/v1/admin/products/pricing/apply/", {**rule, "preview_token": "0" * 64}
    )
    check(code == 409, "apply with a wrong token is refused (409)", (code, body))
    code, body, _ = client.call(
        "POST", "/api/v1/admin/products/pricing/apply/", {**rule, "preview_token": token_value}
    )
    check(code == 200, "apply answers 200", body)
    check(body["changed"] == 1, "apply saved one model", body)
    batch_id = body["batch_id"]
    code, body, _ = client.call(
        "POST", "/api/v1/admin/products/pricing/apply/", {**rule, "preview_token": token_value}
    )
    check(code == 409, "replaying the same token after the save is refused (409)", (code, body))

    print("5. publish")
    code, body, _ = client.call(
        "POST",
        "/api/v1/admin/products/pricing/publish/",
        {"product_ids": [product_id], "confirm_count": 2},
    )
    check(code == 400, "publish with a wrong confirm_count is refused (400)", (code, body))
    code, body, _ = client.call(
        "POST",
        "/api/v1/admin/products/pricing/publish/",
        {"product_ids": [product_id], "confirm_count": 1},
    )
    check(code == 200, "publish answers 200", body)
    check(body["published"] == 1, "one model published", body)

    print("6. public store and history")
    client_token, client.token = client.token, None
    code, body, headers = client.call("GET", f"/api/v1/products/{slug}/")
    check(code == 200, "public detail answers 200", (code, body))
    check(body["price"] == PRICE, f"public price is {PRICE}", body.get("price"))
    check(body["discount_price"] is None, "no sale shown", body.get("discount_price"))
    check(body["is_free"] is False, "it is not free", body.get("is_free"))
    check("public" in (headers.get("Cache-Control") or ""), "public cache header set", headers.get("Cache-Control"))
    code, body, _ = client.call("GET", "/api/v1/products/", query={"search": "PRC", "page_size": 100})
    listed = [p for p in body.get("results", []) if p["slug"] == slug] if code == 200 else []
    check(len(listed) == 1 and listed[0]["price"] == PRICE, "public list shows it with the price", code)
    client.token = client_token
    code, body, _ = client.call("GET", f"/api/v1/admin/products/{product_id}/price-history/")
    check(code == 200, "price history answers 200", body)
    sources = [(r["source"], r["batch_id"]) for r in body["results"]]
    check(("pricing_page", batch_id) in sources, "history has the pricing_page batch", sources)
    code, body, _ = client.call(
        "GET", "/api/v1/admin/products/pricing/", query={"tab": "live", "search": SKU}
    )
    check(code == 200 and [r["id"] for r in body["results"]] == [product_id], "it is in the live tab", body)

    print("7. seeded sales and the buyer")
    code, body, _ = client.call("GET", "/api/v1/admin/products/pricing/", query={"tab": "live", "page_size": 100})
    live = {row["sku"]: row for row in body["results"]}
    check({"PRC-LIVE", "PRC-LIVE-SALE", "PRC-LIVE-ENDED"} <= set(live), "seeded live models listed", sorted(live))
    check("PRC-LIVE-FREE" not in live, "the free live model is not in the live tab", sorted(live))
    check(live["PRC-LIVE-ENDED"]["discount_active"] is False, "ended sale is not active (admin)", live["PRC-LIVE-ENDED"])
    check(live["PRC-LIVE-ENDED"]["buyer_pays"] == "60.00", "ended sale: buyer pays 60.00", live["PRC-LIVE-ENDED"])
    check(live["PRC-LIVE-SALE"]["buyer_pays"] == "35.00", "running sale: buyer pays 35.00", live["PRC-LIVE-SALE"])
    client.token = None
    sale = client.call("GET", f"/api/v1/products/{live['PRC-LIVE-SALE']['slug']}/")[1]
    check(sale["discount_price"] == "35.00" and sale["discount_ends_at"], "public running sale shown with its end", sale)
    ended = client.call("GET", f"/api/v1/products/{live['PRC-LIVE-ENDED']['slug']}/")[1]
    check(
        ended["discount_price"] is None and ended["discount_ends_at"] is None,
        "public ended sale hidden",
        (ended["discount_price"], ended["discount_ends_at"]),
    )
    code, body, _ = client.call(
        "POST", "/api/v1/auth/login/", {"email": "e2e-buyer@example.com", "password": "E2eBuyerPass123!"}
    )
    check(code == 200 and body.get("access"), "buyer login answers 200", (code, body))
    client.token = body["access"]
    code, _, _ = client.call("GET", "/api/v1/admin/products/pricing/", query={"tab": "waiting"})
    check(code == 403, "pricing list refuses a customer (403)", code)
    code, _, _ = client.call(
        "POST", "/api/v1/admin/products/pricing/publish/", {"product_ids": [product_id], "confirm_count": 1}
    )
    check(code == 403, "publish refuses a customer (403)", code)
    client.call("DELETE", "/api/v1/cart/")
    for sku in ("PRC-LIVE-SALE", "PRC-LIVE-ENDED"):
        code, body, _ = client.call(
            "POST", "/api/v1/cart/", {"product_type": "product", "product_id": live[sku]["id"]}
        )
        check(code in (200, 201), f"buyer adds {sku} to the cart", (code, body))
    code, cart, _ = client.call("GET", "/api/v1/cart/")
    prices = {item["catalog"]["slug"]: item["unit_price"] for item in cart["items"]}
    check(prices.get(live["PRC-LIVE-SALE"]["slug"]) == "35.00", "cart charges the running sale", prices)
    check(prices.get(live["PRC-LIVE-ENDED"]["slug"]) == "60.00", "cart ignores the ended sale", prices)
    check(cart["total"] == "95.00", "cart total is 95.00", cart["total"])
    client.call("DELETE", "/api/v1/cart/")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--base", default="http://127.0.0.1:8001")
    args = parser.parse_args()
    try:
        run(args.base)
    except SmokeFailure as exc:
        print(f"FAIL {exc}")
        return 1
    print("SMOKE PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(main())
