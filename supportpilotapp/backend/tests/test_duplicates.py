from datetime import datetime, timedelta, timezone

from app.domain.duplicates import find_duplicates
from app.domain.facts import ChargeFacts

T0 = datetime(2026, 11, 20, 10, 0, tzinfo=timezone.utc)


def c(charge_id, minutes, amount=2000, refunded=0):
    """Ek charge jo T0 ke `minutes` minute baad hua."""
    return ChargeFacts(charge_id, amount, refunded, T0 + timedelta(minutes=minutes))


def ids(charges):
    return [x.charge_id for x in charges]


def test_two_same_charges_one_minute_apart_second_is_duplicate():
    assert ids(find_duplicates([c("a", 0), c("b", 1)])) == ["b"]


def test_single_charge_is_not_a_duplicate():
    assert find_duplicates([c("a", 0)]) == []


def test_three_charges_in_a_row_first_is_original_rest_are_duplicates():
    assert ids(find_duplicates([c("a", 0), c("b", 1), c("c", 2)])) == ["b", "c"]


def test_different_amounts_are_never_duplicates():
    assert find_duplicates([c("a", 0), c("b", 1, amount=5000)]) == []


def test_charges_more_than_10_minutes_apart_are_not_duplicates():
    assert find_duplicates([c("a", 0), c("b", 11)]) == []


def test_exactly_10_minutes_apart_is_still_a_duplicate():
    assert ids(find_duplicates([c("a", 0), c("b", 10)])) == ["b"]


def test_long_chain_is_measured_from_the_original_not_from_the_previous_charge():
    # 0, 8, 16 minute: 8 wala duplicate hai, 16 wala naya original (pehle se 16 min door)
    assert ids(find_duplicates([c("a", 0), c("b", 8), c("c", 16)])) == ["b"]


def test_duplicate_that_is_already_fully_refunded_is_not_listed_again():
    assert find_duplicates([c("a", 0), c("b", 1, refunded=2000)]) == []


def test_normal_monthly_renewal_is_not_a_duplicate():
    assert find_duplicates([c("a", 0), c("b", 60 * 24 * 30)]) == []


def test_input_order_does_not_matter():
    assert ids(find_duplicates([c("b", 1), c("a", 0)])) == ["b"]