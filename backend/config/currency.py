"""Marketplace currency policy and exact Stripe minor-unit conversion.

Keep the supported set explicit: adding a currency requires precision/refund tests
and verification that the merchant's Stripe account supports it.
"""
from decimal import Decimal, InvalidOperation

SUPPORTED_CURRENCIES = {'USD': 2, 'EUR': 2, 'GBP': 2, 'INR': 2, 'JPY': 0}
# These are presentment-currency floors, not a guarantee of settlement-country
# availability. Stripe remains authoritative for account-specific charge limits.
MINIMUM_CHECKOUT_AMOUNTS = {
    'USD': Decimal('0.50'), 'EUR': Decimal('0.50'), 'GBP': Decimal('0.30'),
    'INR': Decimal('0.50'), 'JPY': Decimal('50'),
}


def normalize_currency(currency: str) -> str:
    normalized = str(currency or '').strip().upper()
    if normalized not in SUPPORTED_CURRENCIES:
        raise ValueError('Unsupported currency. Use USD, EUR, GBP, INR, or JPY.')
    return normalized


def to_minor_units(amount: Decimal, currency: str) -> int:
    currency = normalize_currency(currency)
    try:
        value = Decimal(str(amount))
        units = value * (10 ** SUPPORTED_CURRENCIES[currency])
        if not value.is_finite() or value < 0 or units != units.to_integral_value():
            raise ValueError('Amount must be non-negative and match the currency precision.')
        return int(units)
    except InvalidOperation as exc:
        raise ValueError('Invalid monetary amount.') from exc


def from_minor_units(amount: int, currency: str) -> Decimal:
    currency = normalize_currency(currency)
    if isinstance(amount, bool) or not isinstance(amount, int) or amount < 0:
        raise ValueError('Minor-unit amount must be a non-negative integer.')
    return Decimal(amount) / (10 ** SUPPORTED_CURRENCIES[currency])


def validate_catalog_prices(currency: str, price: Decimal, discount: Decimal | None) -> None:
    to_minor_units(price, currency)
    if discount is not None:
        to_minor_units(discount, currency)


def validate_checkout_amount(amount: Decimal, currency: str) -> None:
    currency = normalize_currency(currency)
    to_minor_units(amount, currency)
    if amount == 0:
        raise ValueError('Free orders are not supported by checkout yet.')
    if amount < MINIMUM_CHECKOUT_AMOUNTS[currency]:
        raise ValueError(f'Checkout minimum is {MINIMUM_CHECKOUT_AMOUNTS[currency]} {currency}.')
