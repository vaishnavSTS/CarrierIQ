"""Contact matching helpers (pure)."""

from app.ingestion.contact_match import (
    ADDRESS,
    BUILDING,
    OFFICER,
    PHONE,
    build_where,
    classify,
    keys_for,
    normalize_street,
    street_base,
)

KEYS = keys_for(
    ["(360) 479-4800"], "ops@united.test", "1770 NE Fuson Rd Ste 4", "98311-3729", ["Craig Smith"]
)


def test_street_base_drops_the_unit() -> None:
    assert street_base("7799 VALLEY VIEW ST G103") == "7799 VALLEY VIEW ST"
    assert street_base("7799 VALLEY VIEW ST APT H103") == "7799 VALLEY VIEW ST"
    assert street_base("4460 W SHAW AVE # 435") == "4460 W SHAW AVE"
    assert street_base("955 W SR 206") == "955 W SR 206"


def test_where_matches_every_detail_and_both_phone_forms() -> None:
    where = build_where(KEYS)

    assert where is not None
    assert "phone in ('3604794800', '13604794800')" in where
    assert "upper(email_address) = 'OPS@UNITED.TEST'" in where
    assert "(upper(phy_street) like '1770 %' AND phy_zip like '98311%')" in where
    assert "upper(company_officer_1) in ('CRAIG SMITH')" in where


def test_values_cannot_change_the_query() -> None:
    keys = keys_for([], "a'b@x.test", "1 O'HARA ST", "60601", ["JOE D'ANGELO_%"])

    where = build_where(keys)

    assert where is not None
    # Quotes, % and _ inside values are removed: only the filter's own quotes remain.
    assert "D'ANGELO" not in where and "'JOE DANGELO'" in where
    assert "'AB@X.TEST'" in where and "like '1 %'" in where


def test_nothing_to_match() -> None:
    assert build_where(keys_for([], None, None, None, ["AB"])) is None  # too-short officer


def test_classify() -> None:
    same_unit = {"phy_street": "1770 NE FUSON RD STE 4", "phy_zip": "98311", "phone": "13604794800"}
    other_unit = {"phy_street": "1770 NE FUSON RD STE 9", "phy_zip": "98311"}
    other_zip = {"phy_street": "1770 NE FUSON RD STE 4", "phy_zip": "10001"}
    officer = {"company_officer_2": "craig smith"}

    assert classify(same_unit, KEYS).kinds == {ADDRESS, PHONE}
    assert classify(other_unit, KEYS).kinds == {BUILDING}
    assert classify(other_zip, KEYS).kinds == set()
    assert classify(officer, KEYS).kinds == {OFFICER}


def test_same_address_written_differently() -> None:
    """FMCSA stores addresses as typed: Vanek Brothers and Vanek Re-Ship (real records)."""
    keys = keys_for([], None, "3920 SOUTH LOOMIS", "60609", [])
    assert normalize_street("3920 South Loomis Street") == "3920 S LOOMIS ST"

    match = classify({"phy_street": "3920 S LOOMIS", "phy_zip": "60609"}, keys)

    assert match.kinds == {"address"}
    assert match.values["address"] == "3920 S LOOMIS"  # as FMCSA has the other record
