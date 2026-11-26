"""Problem 10: 30-Scenario Automated Verification Suite.

Guarantees zero regressions across all 5 use cases, adversarial tricks, financial caps,
and hand-offs as required by the SupportPilot specifications.
"""
import pytest
from app.api.test_suite import TEST_CASES, _run_single_test


@pytest.mark.parametrize("test_case", TEST_CASES, ids=[f"scenario_{tc['id']}_{tc['name'][:25].replace(' ', '_')}" for tc in TEST_CASES])
def test_scenario(test_case):
    res = _run_single_test(test_case)
    assert res["passed"], (
        f"Test {res['id']} failed: Expected rule={res['expected_rule']} outcome={res['expected_outcome']}, "
        f"got rule={res['actual_rule']} outcome={res['actual_outcome']}"
    )


def test_entire_suite_pass_rate():
    passed = 0
    for tc in TEST_CASES:
        res = _run_single_test(tc)
        if res["passed"]:
            passed += 1
    assert passed == len(TEST_CASES) == 30
