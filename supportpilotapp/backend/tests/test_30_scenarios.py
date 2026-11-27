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


def test_real_llm_mode_fails_on_llm_error(mocker):
    from app.services import understand as u_mod
    from app.services.llm import LLMError

    mocker.patch.object(u_mod, "chat_completion", side_effect=LLMError("LLM provider returned 401: Invalid API key"))
    for tc in TEST_CASES:
        res = _run_single_test(tc, use_real_llm=True)
        assert res["passed"] is False, f"Scenario {tc['id']} should fail when LLMError occurs"
        assert res["actual_outcome"] == "llm_error"


def test_real_llm_mode_fails_on_mismatched_route(mocker):
    from app.api import test_suite
    from app.services.understand import Understanding

    mocker.patch.object(test_suite, "understand", return_value=Understanding(intents=["unclear"]))
    res = _run_single_test(TEST_CASES[0], use_real_llm=True)
    assert res["passed"] is False
    assert "LLM_ROUTE_MISMATCH" in res["actual_rule"]


def test_real_llm_mode_uses_understand_output_for_route(mocker):
    from app.api import test_suite
    from app.services.understand import Understanding

    mocker.patch.object(test_suite, "understand", return_value=Understanding(intents=["duplicate_charge"]))
    assert _run_single_test(TEST_CASES[0], use_real_llm=True)["passed"] is True

    mocker.patch.object(test_suite, "understand", return_value=Understanding(asks_for_human=True))
    assert _run_single_test(TEST_CASES[25], use_real_llm=True)["passed"] is True

    mocker.patch.object(
        test_suite,
        "understand",
        return_value=Understanding(intents=["duplicate_charge", "cancel_subscription"]),
    )
    assert _run_single_test(TEST_CASES[28], use_real_llm=True)["passed"] is True

    mocker.patch.object(test_suite, "understand", return_value=Understanding(intents=["unclear"]))
    assert _run_single_test(TEST_CASES[29], use_real_llm=True)["passed"] is True
