"""Probe real dependency health; never accept a redirect as healthy."""
import http.client
import json

connection = http.client.HTTPConnection("127.0.0.1", 8000, timeout=4)
connection.request("GET", "/api/v1/healthz/", headers={"X-Forwarded-Proto": "https"})
response = connection.getresponse()
payload = json.loads(response.read())
if response.status != 200 or payload.get("status") != "ok":
    raise SystemExit("API dependency health check failed")
