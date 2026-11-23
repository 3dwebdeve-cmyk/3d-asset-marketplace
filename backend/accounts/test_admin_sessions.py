"""Console -> Security: an administrator's signed-in browsers, signing them out, and the
browser / network checks on every administrator refresh."""

from __future__ import annotations

from django.conf import settings
from django.core import mail
from django.core.cache import cache
from django.test import SimpleTestCase, override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from accounts import sessions
from accounts.models import ActivityLog, Role, User, UserSession
from accounts.session_binding import browser_family, same_place
from accounts.test_admin_step_up import _AdminSessionMixin

CHROME_131 = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)
CHROME_132 = CHROME_131.replace("131.0.0.0", "132.0.0.0")
CHROME_ANDROID_EMULATION = (
    "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36"
)
EDGE_131 = CHROME_131 + " Edg/131.0.0.0"
FIREFOX = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0"
IPHONE_SAFARI = (
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 "
    "(KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"
)
OFFICE_IP = "203.0.113.10"
HOME_IP = "198.51.100.7"


class BrowserFamilyTests(SimpleTestCase):
    def test_families(self) -> None:
        for user_agent, family in (
            (CHROME_131, "chrome"),
            (CHROME_132, "chrome"),
            (CHROME_ANDROID_EMULATION, "chrome"),
            (EDGE_131, "edge"),
            (FIREFOX, "firefox"),
            (IPHONE_SAFARI, "safari"),
            (CHROME_131 + " OPR/115.0.0.0", "opera"),
        ):
            with self.subTest(user_agent=user_agent):
                self.assertEqual(browser_family(user_agent), family)

    def test_unknown_clients_compare_without_versions(self) -> None:
        self.assertEqual(browser_family("curl/8.4.0"), browser_family("curl/8.9.1"))
        self.assertNotEqual(browser_family("curl/8.4.0"), browser_family("python-requests/2.32"))

    def test_same_place(self) -> None:
        self.assertTrue(same_place(OFFICE_IP, OFFICE_IP))
        self.assertFalse(same_place(OFFICE_IP, HOME_IP))
        # Devices rotate their own IPv6 address inside one /64 network.
        self.assertTrue(same_place("2001:db8:1:2::10", "2001:db8:1:2:abcd::99"))
        self.assertFalse(same_place("2001:db8:1:2::10", "2001:db8:1:3::10"))
        self.assertTrue(same_place("", OFFICE_IP))


class _BrowserClients(_AdminSessionMixin):
    def _browser(self, user_agent: str = CHROME_131, ip: str = OFFICE_IP) -> APIClient:
        return APIClient(HTTP_USER_AGENT=user_agent, REMOTE_ADDR=ip)

    def _sign_in_as(self, user: User, user_agent: str = CHROME_131, ip: str = OFFICE_IP) -> APIClient:
        return self._sign_in(user, self._browser(user_agent, ip))

    def _copy(self, client: APIClient, user_agent: str, ip: str = OFFICE_IP) -> APIClient:
        """Another browser holding ``client``'s refresh cookie."""
        copy = self._browser(user_agent, ip)
        cookie = settings.JWT_REFRESH_COOKIE_NAME
        copy.cookies[cookie] = client.cookies[cookie].value
        return copy

    def _refresh(self, client: APIClient):
        response = client.post(reverse("accounts:token-refresh"), {}, format="json")
        if response.status_code == status.HTTP_200_OK:
            client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['access']}")
        return response


@override_settings(ADMIN_MFA_REQUIRED=True, ADMIN_STEP_UP_REQUIRED=True)
class AdminSessionsPanelTests(_BrowserClients, APITestCase):
    def setUp(self) -> None:
        cache.clear()
        self._start_clock()
        self.admin = self._make_admin("panel-admin@example.com")
        self.laptop = self._sign_in_as(self.admin)
        self.phone = self._sign_in_as(self.admin, CHROME_ANDROID_EMULATION, HOME_IP)
        self.list_url = reverse("accounts:admin-sessions")
        self.others_url = reverse("accounts:admin-sessions-sign-out-others")

    def _session_of(self, client: APIClient) -> str:
        current = [row for row in client.get(self.list_url).data["results"] if row["current"]]
        self.assertEqual(len(current), 1)
        return current[0]["id"]

    def _confirm(self, client: APIClient) -> None:
        response = client.post(
            reverse("accounts:admin-step-up"), {"code": self._code(self.admin)}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self._next_step()

    def test_lists_this_administrator_browsers_and_marks_this_one(self) -> None:
        response = self.laptop.get(self.list_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        rows = response.data["results"]
        self.assertEqual(len(rows), 2)
        self.assertEqual([row["current"] for row in rows].count(True), 1)
        laptop_row = next(row for row in rows if row["current"])
        self.assertEqual(laptop_row["user_agent"], CHROME_131)
        self.assertEqual(laptop_row["ip_address"], OFFICE_IP)
        self.assertEqual(
            {"id", "user_agent", "ip_address", "created_at", "last_used_at", "current"},
            set(laptop_row),
        )

    def test_other_administrators_and_ended_sessions_are_not_listed(self) -> None:
        colleague = self._make_admin("colleague@example.com")
        self._sign_in_as(colleague)
        UserSession.objects.filter(pk=self._session_of(self.phone)).update(
            revoked_at="2026-01-01T00:00:00Z"
        )

        rows = self.laptop.get(self.list_url).data["results"]

        self.assertEqual(len(rows), 1)
        self.assertTrue(rows[0]["current"])

    def test_customers_cannot_see_the_panel(self) -> None:
        customer = User.objects.create_user(
            email="panel-customer@example.com",
            full_name="Customer",
            password="Customer-Pass-2026!",
            role=Role.objects.get(role_name="Customer"),
            email_verified=True,
        )
        client = APIClient()
        client.force_authenticate(customer)

        self.assertEqual(client.get(self.list_url).status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(client.post(self.others_url).status_code, status.HTTP_403_FORBIDDEN)

    def test_signing_out_another_browser_asks_for_a_code_then_ends_it_at_once(self) -> None:
        phone_session = self._session_of(self.phone)
        url = reverse("accounts:admin-session-detail", args=[phone_session])

        refused = self.laptop.delete(url)
        self.assertEqual(refused.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(refused.data["code"], "step_up_required")
        self.assertEqual(self.phone.get(self.list_url).status_code, status.HTTP_200_OK)

        self._confirm(self.laptop)
        response = self.laptop.delete(url)

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(self.phone.get(self.list_url).status_code, status.HTTP_401_UNAUTHORIZED)
        refresh = self._refresh(self.phone)
        self.assertEqual(refresh.data["code"], "session_ended")
        self.assertEqual(
            UserSession.objects.get(pk=phone_session).revoked_reason,
            sessions.REASON_SIGNED_OUT_REMOTELY,
        )
        self.assertTrue(
            ActivityLog.objects.filter(
                actor=self.admin, action="admin_session_signed_out", target_id=phone_session
            ).exists()
        )
        self.assertEqual(self.laptop.get(self.list_url).status_code, status.HTTP_200_OK)

    def test_this_browser_is_signed_out_with_sign_out_not_here(self) -> None:
        self._confirm(self.laptop)

        response = self.laptop.delete(
            reverse("accounts:admin-session-detail", args=[self._session_of(self.laptop)])
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["code"], "current_session")

    def test_cannot_sign_out_another_administrator(self) -> None:
        colleague = self._make_admin("colleague@example.com")
        colleague_browser = self._sign_in_as(colleague)
        colleague_session = UserSession.objects.get(user=colleague).pk
        self._confirm(self.laptop)

        response = self.laptop.delete(
            reverse("accounts:admin-session-detail", args=[colleague_session])
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(colleague_browser.get(self.list_url).status_code, status.HTTP_200_OK)

    def test_sign_out_all_other_browsers(self) -> None:
        tablet = self._sign_in_as(self.admin, FIREFOX)
        self.assertEqual(self.laptop.post(self.others_url).data["code"], "step_up_required")
        self._confirm(self.laptop)

        response = self.laptop.post(self.others_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["signed_out"], 2)
        self.assertEqual(self.phone.get(self.list_url).status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(tablet.get(self.list_url).status_code, status.HTTP_401_UNAUTHORIZED)
        rows = self.laptop.get(self.list_url).data["results"]
        self.assertEqual(len(rows), 1)
        self.assertTrue(rows[0]["current"])

    @override_settings(ADMIN_STEP_UP_REQUIRED=False)
    def test_without_step_up_it_signs_out_directly(self) -> None:
        self.assertEqual(self.laptop.post(self.others_url).data["signed_out"], 1)


@override_settings(ADMIN_MFA_REQUIRED=True, ADMIN_SESSION_BROWSER_LOCK=True, ADMIN_SESSION_IP_ALERTS=True)
class AdminSessionBindingTests(_BrowserClients, APITestCase):
    def setUp(self) -> None:
        cache.clear()
        self._start_clock()
        self.admin = self._make_admin("binding-admin@example.com")
        self.me_url = reverse("accounts:admin-me")
        self.cookie = settings.JWT_REFRESH_COOKIE_NAME

    def _session(self) -> UserSession:
        return UserSession.objects.get(user=self.admin)

    def test_same_browser_after_an_update_keeps_the_session(self) -> None:
        browser = self._sign_in_as(self.admin, CHROME_131)
        browser.defaults["HTTP_USER_AGENT"] = CHROME_132

        self.assertEqual(self._refresh(browser).status_code, status.HTTP_200_OK)

    def test_chrome_device_emulation_keeps_the_session(self) -> None:
        browser = self._sign_in_as(self.admin, CHROME_131)
        browser.defaults["HTTP_USER_AGENT"] = CHROME_ANDROID_EMULATION

        self.assertEqual(self._refresh(browser).status_code, status.HTTP_200_OK)

    def test_a_different_browser_ends_the_session_for_everyone(self) -> None:
        chrome = self._sign_in_as(self.admin, CHROME_131)
        mail.outbox.clear()

        response = self._refresh(self._copy(chrome, EDGE_131))

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(response.data["code"], "session_ended")
        self.assertEqual(response.cookies[self.cookie].value, "")
        self.assertEqual(self._session().revoked_reason, sessions.REASON_BROWSER_CHANGED)
        # The browser that signed in is signed out too: the session is the thing that ended.
        self.assertEqual(chrome.get(self.me_url).status_code, status.HTTP_401_UNAUTHORIZED)
        alerts = [m for m in mail.outbox if "a different browser used it" in m.subject]
        self.assertEqual(len(alerts), 1)
        self.assertIn("Edg/131.0.0.0", alerts[0].body)
        self.assertTrue(
            ActivityLog.objects.filter(
                actor=self.admin, action="admin_session_ended_browser_changed"
            ).exists()
        )

    def test_emulating_an_iphone_counts_as_a_different_browser(self) -> None:
        # Documented: DevTools' iPhone mode reports Safari. Use a private window for that.
        chrome = self._sign_in_as(self.admin, CHROME_131)
        chrome.defaults["HTTP_USER_AGENT"] = IPHONE_SAFARI

        self.assertEqual(self._refresh(chrome).status_code, status.HTTP_401_UNAUTHORIZED)

    @override_settings(ADMIN_SESSION_BROWSER_LOCK=False)
    def test_browser_lock_can_be_turned_off(self) -> None:
        chrome = self._sign_in_as(self.admin, CHROME_131)

        self.assertEqual(self._refresh(self._copy(chrome, EDGE_131)).status_code, status.HTTP_200_OK)

    def test_a_session_without_a_recorded_browser_adopts_this_one(self) -> None:
        browser = self._sign_in_as(self.admin, CHROME_131)
        UserSession.objects.filter(user=self.admin).update(user_agent="")

        self.assertEqual(self._refresh(browser).status_code, status.HTTP_200_OK)
        self.assertEqual(self._session().user_agent, CHROME_131)
        browser.defaults["HTTP_USER_AGENT"] = FIREFOX
        self.assertEqual(self._refresh(browser).status_code, status.HTTP_401_UNAUTHORIZED)

    def test_a_new_network_sends_one_alert_and_keeps_the_session(self) -> None:
        browser = self._sign_in_as(self.admin, CHROME_131, OFFICE_IP)
        mail.outbox.clear()
        browser.defaults["REMOTE_ADDR"] = HOME_IP

        first = self._refresh(browser)
        second = self._refresh(browser)

        self.assertEqual(first.status_code, status.HTTP_200_OK)
        self.assertEqual(second.status_code, status.HTTP_200_OK)
        self.assertEqual(self._session().ip_address, HOME_IP)
        alerts = [m for m in mail.outbox if "different network" in m.subject]
        self.assertEqual(len(alerts), 1)
        self.assertIn(OFFICE_IP, alerts[0].body)
        self.assertIn(HOME_IP, alerts[0].body)
        self.assertTrue(
            ActivityLog.objects.filter(actor=self.admin, action="admin_session_ip_changed").exists()
        )

    def test_same_ipv6_network_sends_no_alert(self) -> None:
        browser = self._sign_in_as(self.admin, CHROME_131, "2001:db8:1:2::10")
        mail.outbox.clear()
        browser.defaults["REMOTE_ADDR"] = "2001:db8:1:2:abcd::99"

        self.assertEqual(self._refresh(browser).status_code, status.HTTP_200_OK)
        self.assertFalse([m for m in mail.outbox if "different network" in m.subject])

    @override_settings(ADMIN_SESSION_IP_ALERTS=False)
    def test_network_alerts_can_be_turned_off(self) -> None:
        browser = self._sign_in_as(self.admin, CHROME_131, OFFICE_IP)
        mail.outbox.clear()
        browser.defaults["REMOTE_ADDR"] = HOME_IP

        self.assertEqual(self._refresh(browser).status_code, status.HTTP_200_OK)
        self.assertFalse([m for m in mail.outbox if "different network" in m.subject])

    def test_customers_are_not_checked(self) -> None:
        customer = User.objects.create_user(
            email="binding-customer@example.com",
            full_name="Customer",
            password="Customer-Pass-2026!",
            role=Role.objects.get(role_name="Customer"),
            email_verified=True,
        )
        browser = self._browser(CHROME_131)
        login = browser.post(
            reverse("accounts:login"),
            {"email": customer.email, "password": "Customer-Pass-2026!"},
            format="json",
        )
        self.assertEqual(login.status_code, status.HTTP_200_OK, login.data)
        mail.outbox.clear()

        response = self._refresh(self._copy(browser, EDGE_131, HOME_IP))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse([m for m in mail.outbox if "administrator session" in m.subject])
