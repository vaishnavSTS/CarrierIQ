"""What STS charges for the Compliance tab's services, and the website's service ids
(skytransportsolutions.com's invoice catalog). A service listed here is paid online: the client
picks an option, CarrierSafetyScan creates the invoice on the website and opens its payment page.
A service not listed (drug & alcohol consortium, criminal background check: no website service id
yet) is asked for the old way, and STS follows up.

Edit prices and ids here; nothing else holds them.
"""

from dataclasses import dataclass, field
from decimal import Decimal

from app.core.exceptions import ValidationError
from app.models.enums import ComplianceService


@dataclass(frozen=True)
class PriceOption:
    key: str
    label: str
    amount: Decimal  # per unit (per driver for driver files)
    min_units: int = 1  # trucks or drivers this option starts at (for suggesting one)
    max_units: int | None = None


@dataclass(frozen=True)
class ServicePrice:
    service_id: int  # the website's catalog id
    options: tuple[PriceOption, ...]
    per_driver: bool = False  # driver files: the option's amount is per driver
    note: str | None = None  # shown before paying
    too_big: str | None = None  # above the last option: contact STS


def _usd(value: str) -> Decimal:
    return Decimal(value)


PRICES: dict[ComplianceService, ServicePrice] = {
    ComplianceService.DOT_MC_AUTHORITY: ServicePrice(
        28,
        (
            PriceOption("ASSISTANCE", "DOT / MC authority assistance", _usd("50")),
            PriceOption("REINSTATEMENT", "MC reinstatement", _usd("175")),
            PriceOption("REVOKED", "MC revoked (new authority)", _usd("400")),
        ),
        note="Not sure if your MC is up for reinstatement or revoked? Pick the closest; STS checks "
        "it and contacts you if the price changes.",
    ),
    ComplianceService.UCR: ServicePrice(
        1,
        (
            PriceOption("TRUCKS_1_2", "1–2 trucks", _usd("100"), 0, 2),
            PriceOption("TRUCKS_3_5", "3–5 trucks", _usd("277"), 3, 5),
            PriceOption("TRUCKS_6_20", "6–20 trucks", _usd("418"), 6, 20),
            PriceOption("TRUCKS_21_100", "21–100 trucks", _usd("1360"), 21, 100),
        ),
        too_big="More than 100 trucks? Contact STS for UCR filing.",
    ),
    ComplianceService.CA_MCP: ServicePrice(
        12,
        (
            PriceOption("TRUCKS_1", "1 truck", _usd("350"), 0, 1),
            PriceOption("TRUCKS_2_4", "2–4 trucks", _usd("450"), 2, 4),
            PriceOption("TRUCKS_5_10", "5–10 trucks", _usd("730"), 5, 10),
        ),
        note="Subject to change for suspensions and penalty fees.",
        too_big="More than 10 trucks? Contact STS for the MCP.",
    ),
    ComplianceService.DRIVER_FILES: ServicePrice(
        14,
        (
            PriceOption("DRIVERS_1_5", "1–5 drivers", _usd("50"), 1, 5),
            PriceOption("DRIVERS_6_15", "6–15 drivers", _usd("40"), 6, 15),
            PriceOption("DRIVERS_16_PLUS", "16 or more drivers", _usd("35"), 16, None),
        ),
        per_driver=True,
    ),
    ComplianceService.MVR: ServicePrice(26, (PriceOption("MVR", "MVR report", _usd("35")),)),
    ComplianceService.GOOD_STANDING: ServicePrice(
        40,
        (
            PriceOption("OTHER_STATE", "Corporation in another state", _usd("50")),
            PriceOption("DELAWARE", "Delaware corporation", _usd("75")),
        ),
    ),
}

MAX_DRIVERS = 500


@dataclass(frozen=True)
class Quote:
    service_id: int
    option: PriceOption
    quantity: int  # drivers for driver files, else 1
    total: Decimal = field(init=False)

    def __post_init__(self) -> None:
        object.__setattr__(self, "total", self.option.amount * self.quantity)


def fits(option: PriceOption, units: int) -> bool:
    return units >= option.min_units and (option.max_units is None or units <= option.max_units)


def suggest(price: ServicePrice, units: int | None) -> str | None:
    """The option that fits a fleet or driver count (from FMCSA's census), if any."""
    if units is None or not any(o.max_units is not None for o in price.options):
        return None
    return next((o.key for o in price.options if fits(o, units)), None)


def quote(service: ComplianceService, option_key: str, drivers: int | None) -> Quote:
    price = PRICES.get(service)
    if price is None:
        raise ValidationError("This service isn't paid online yet; ask STS for help instead")
    option = next((o for o in price.options if o.key == option_key), None)
    if option is None:
        raise ValidationError("Choose one of the options")
    if not price.per_driver:
        return Quote(price.service_id, option, 1)
    if drivers is None or not 1 <= drivers <= MAX_DRIVERS:
        raise ValidationError(f"Enter the number of drivers (1 to {MAX_DRIVERS})")
    if not fits(option, drivers):
        raise ValidationError(f"{drivers} drivers isn't in “{option.label}”; pick the matching one")
    return Quote(price.service_id, option, drivers)
