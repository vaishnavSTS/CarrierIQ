"""Which inspections count toward FMCSA's out-of-service rates.

FMCSA divides vehicle out-of-service orders by inspections that examined the vehicle (Levels I,
II, V and VI) and driver out-of-service orders by inspections that examined the driver (Levels I,
II, III and VI). A Level III (driver-only) inspection therefore never counts toward the vehicle
rate. An inspection with no recorded level is counted in both, as before.

National averages are the figures FMCSA publishes on SAFER for comparison.
"""

VEHICLE_LEVELS = frozenset({1, 2, 5, 6})
DRIVER_LEVELS = frozenset({1, 2, 3, 6})

NATIONAL_VEHICLE_OOS_RATE = 0.2226  # FMCSA SAFER national average
NATIONAL_DRIVER_OOS_RATE = 0.0667  # FMCSA SAFER national average


def examines_vehicle(level: int | None) -> bool:
    return level is None or level in VEHICLE_LEVELS


def examines_driver(level: int | None) -> bool:
    return level is None or level in DRIVER_LEVELS
