"""Explicit scanner readiness check, separate from application startup."""
import socket

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = "Require a configured, reachable ClamAV scanner before enabling package uploads."

    def handle(self, *args, **options):
        host = settings.PACKAGE_SCAN_HOST
        if not host:
            raise CommandError(
                "PACKAGE_SCAN_HOST is not configured. Production package uploads remain blocked."
            )
        try:
            with socket.create_connection((host, settings.PACKAGE_SCAN_PORT), timeout=5) as connection:
                connection.sendall(b"zPING\0")
                response = b""
                while b"\0" not in response and b"\n" not in response and len(response) < 64:
                    chunk = connection.recv(64)
                    if not chunk:
                        break
                    response += chunk
        except OSError as exc:
            raise CommandError("Package scanner is unreachable. Package uploads remain blocked.") from exc
        if response.rstrip(b"\0\n") != b"PONG":
            raise CommandError("Package scanner returned an invalid readiness response.")
        self.stdout.write("package scanner reachable; verify signatures and scan limits before release")
