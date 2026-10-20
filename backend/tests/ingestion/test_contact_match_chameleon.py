"""Chameleon-check matching: DUNS, mailing addresses and past values (pure)."""

from app.ingestion.contact_match import (
    ADDRESS,
    DUNS,
    MAILING,
    PAST_ADDRESS,
    PAST_PHONE,
    PHONE,
    build_where,
    classify,
    keys_for,
    normalize_duns,
)

KEYS = keys_for(
    ["(360) 479-4800"],
    None,
    "1770 NE Fuson Rd",
    "98311-3729",
    [],
    duns="053826913",
    mailing=("PO Box 12 Main St", "98312"),
    past_phones=["(206) 555-0100", "360-479-4800"],  # the second is still current
    past_addresses=[("44 Old Mill Rd", "98001"), ("1770 NE Fuson Rd", "98311")],
)


def test_duns_is_nine_digits_and_placeholders_are_ignored() -> None:
    assert normalize_duns("53826913") == "053826913"  # the census drops leading zeros
    assert normalize_duns("05-382-6913") == "053826913"
    assert normalize_duns("000000000") == ""
    assert normalize_duns("999999999") == ""
    assert normalize_duns("123456789") == ""
    assert normalize_duns("12") == ""
    assert normalize_duns(None) == ""


def test_past_values_exclude_current_ones() -> None:
    assert KEYS.past_phones == ("2065550100",)
    assert KEYS.past_addresses == (("44 OLD MILL RD", "98001"),)


def test_where_adds_duns_mailing_and_past_values() -> None:
    where = build_where(KEYS)

    assert where is not None
    assert "dun_bradstreet_no in ('053826913', '53826913')" in where
    assert "'2065550100'" in where and "'12065550100'" in where  # past phone, both forms
    # Their mailing address against this carrier's physical address ...
    assert (
        "(upper(carrier_mailing_street) like '1770 %' AND carrier_mailing_zip like '98311%')"
        in where
    )
    # ... and their physical address against its past address.
    assert "(upper(phy_street) like '44 %' AND phy_zip like '98001%')" in where


def test_duns_values_cannot_change_the_query() -> None:
    keys = keys_for([], None, None, None, [], duns="05382'6913 OR 1=1")

    assert keys.duns == ""  # not 7-9 digits once the rest is stripped
    assert build_where(keys) is None


def test_classify_duns_mailing_and_past() -> None:
    same_duns = {"dun_bradstreet_no": "53826913"}
    mailing_to_physical = {
        "carrier_mailing_street": "1770 NE FUSON ROAD",
        "carrier_mailing_zip": "98311",
    }
    physical_to_mailing = {"phy_street": "PO BOX 12 MAIN STREET", "phy_zip": "98312"}
    old_phone = {"cell_phone": "2065550100"}
    old_address = {"phy_street": "44 OLD MILL ROAD", "phy_zip": "98001-1000"}

    assert classify(same_duns, KEYS).kinds == {DUNS}
    assert classify(mailing_to_physical, KEYS).kinds == {MAILING}
    assert classify(physical_to_mailing, KEYS).kinds == {MAILING}
    assert classify(old_phone, KEYS).kinds == {PAST_PHONE}
    assert classify(old_address, KEYS).values[PAST_ADDRESS] == "44 OLD MILL ROAD"


def test_same_physical_address_is_not_also_a_mailing_match() -> None:
    both = {
        "phy_street": "1770 NE FUSON RD",
        "phy_zip": "98311",
        "carrier_mailing_street": "1770 NE FUSON RD",
        "carrier_mailing_zip": "98311",
        "phone": "3604794800",
    }

    assert classify(both, KEYS).kinds == {ADDRESS, PHONE}
