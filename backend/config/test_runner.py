"""Keep migration-seeded roles available when reusing a flushed test database."""
from django.test.runner import DiscoverRunner


class MarketplaceTestRunner(DiscoverRunner):
    def setup_databases(self, **kwargs):
        result = super().setup_databases(**kwargs)
        from accounts.models import Role

        for name, description in (
            ("Administrator", "Platform administrator"),
            ("Customer", "Marketplace customer"),
        ):
            Role.objects.get_or_create(role_name=name, defaults={"description": description})
        return result
