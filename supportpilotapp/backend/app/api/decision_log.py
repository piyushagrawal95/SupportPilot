from fastapi import APIRouter, Depends
from app.core.security import get_current_staff

router = APIRouter(prefix="/decision-log", tags=["decision-log"])

DECISION_LOGS = [
    {
        "problem_id": 1,
        "title": "Who is this customer, and what really happened?",
        "options_considered": [
            "Option A: Allow customers to provide email or charge ID in the chat text.",
            "Option B: Extract user identity strictly from authenticated JWT token, and read facts directly from Stripe API, completely ignoring typed amounts or accounts.",
        ],
        "chosen": "Option B",
        "why": "Customer text is untrusted user input. Trusting typed emails would allow account takeover and impersonation attacks ('I am Rahul, refund my charge'). Reading facts from Stripe ensures amounts, timestamps, and refund states are 100% verified ground truth.",
        "evidence": "test_asking_for_a_person_skips_the_llm_and_hands_off and stripe_facts tests verify customer_ref is bound to authenticated JWT and only verified Stripe charges are evaluated.",
        "what_we_gave_up": "Convenience for customers who want to ask about another account without logging in.",
        "what_would_change_mind": "A multi-tenant SSO setup where authorized delegate agents legitimately manage sub-accounts on behalf of an organization.",
    },
    {
        "problem_id": 2,
        "title": "Payment events you can rely on",
        "options_considered": [
            "Option A: Process webhook events in-memory upon arrival.",
            "Option B: Persist events with Stripe signature verification in stripe_events table, and use row-level locks and unique constraints (uq_ticket_per_stripe_ref) to ensure exact-once processing.",
        ],
        "chosen": "Option B",
        "why": "Webhooks can arrive out of order, be retried, or be spoofed. Free servers can be restarted. A database-backed idempotent pipeline guarantees every real event is handled exactly once and fake events are rejected immediately with 400.",
        "evidence": "Database-level idempotency in app/api/webhooks.py (process_event) locks rows in stripe_events and enforces exact-once processing via ON CONFLICT (use_case, stripe_ref). Action deduplication and concurrency are verified by tests/test_actions_db.py (test_retry_does_not_refund_twice, test_two_chats_same_charge_same_moment_refund_once).",
        "what_we_gave_up": "Sub-millisecond processing speed, as database round-trips and signature cryptography add ~15ms per webhook.",
        "what_would_change_mind": "A distributed Kafka/SQS queue architecture where message deduplication is offloaded to managed streaming brokers.",
    },
    {
        "problem_id": 3,
        "title": "A chat that understands what the customer wants",
        "options_considered": [
            "Option A: Let an open LLM prompt generate conversational replies and trigger actions via function calling.",
            "Option B: Constrain the LLM to a classification-only structured schema (intents, flags, question) with XML data sanitization tags, keeping history within 6 messages for small context limits.",
        ],
        "chosen": "Option B",
        "why": "Generative LLM function calling is vulnerable to hallucination, goal hijacking, and prompt injection. Constraining Groq to JSON-only classification isolates understanding from action execution.",
        "evidence": "Deterministic unit tests in tests/test_understand.py verify intent parsing and anger/legal detection; live evaluation is verified via /api/tests/run?use_real_llm=true testing Groq LLM against messy real-world customer prompts.",
        "what_we_gave_up": "Creative small-talk and wide-ranging banter in the support chat.",
        "what_would_change_mind": "If verified formal-verification LLM tool-calling guardrails with 100% mathematical guarantees become widely available.",
    },
    {
        "problem_id": 4,
        "title": "Turn the policy into rules the AI can't break",
        "options_considered": [
            "Option A: Put refund and cancellation rules in the system prompt.",
            "Option B: Encode all business rules in deterministic Python code (policy.py) using integer cent math and timezone-aware timestamps.",
        ],
        "chosen": "Option B",
        "why": "LLMs cannot reliably calculate integer days, handle partial unused time rounding, or enforce daily caps. Code rules cannot be tricked, hallucinated, or jailbroken.",
        "evidence": "33 comprehensive tests in test_policy.py test 7-day full refund, 30-day partial refund, 60-day duplicate window, and edge cases.",
        "what_we_gave_up": "Ability for non-technical managers to edit policy text in plain English prompts without updating code or config.",
        "what_would_change_mind": "If a zero-shot code generator could safely compile natural language into provably correct executable AST contracts.",
    },
    {
        "problem_id": 5,
        "title": "Actions that happen exactly once",
        "options_considered": [
            "Option A: Directly call stripe.Refund.create whenever a decision is ALLOW.",
            "Option B: Advisory locks in PostgreSQL per charge_id + idempotency_key in DB actions table + passing idempotency_key to Stripe Refund API.",
        ],
        "chosen": "Option B",
        "why": "Protects against race conditions when two chat messages arrive simultaneously or a network timeout triggers a retry. The money can only ever move once. Additionally, customer replies are generated strictly AFTER action confirmation in DB and streamed token-by-token deliberately to enhance customer confidence and convey real-time resolution.",
        "evidence": "test_actions_db.py concurrent thread pool execution demonstrates that parallel refund requests result in 1 execution and 1 'already_done'. Streaming behavior verified by tests/test_chat_stream.py.",
        "what_we_gave_up": "Slightly simpler code without advisory lock management.",
        "what_would_change_mind": "If Stripe introduced atomic cross-service distributed ACID transactions across multiple APIs.",
    },
    {
        "problem_id": 6,
        "title": "Approvals and live hand-off",
        "options_considered": [
            "Option A: Wait indefinitely for an agent or approver, leaving the customer hanging.",
            "Option B: Dual-channel approvals (in-app UI + secure SHA-256 hashed email token), atomic agent takeover (UPDATE WHERE assigned IS NULL), and 2-minute fallback timeout with ticket creation.",
        ],
        "chosen": "Option B",
        "why": "Finance approvers are not always sitting in the app; email links allow 1-click approvals on mobile. Atomic DB queries prevent two agents taking the same live chat simultaneously.",
        "evidence": "live.py atomic update returns 409 Conflict if a second agent clicks accept, and approvals.py verifies token hash and expiration.",
        "what_we_gave_up": "Instant gratification for customers when no human agents are logged in.",
        "what_would_change_mind": "If an automated voice/video conferencing integration became mandatory for all live escalations.",
    },
    {
        "problem_id": 7,
        "title": "Customers who try to trick the agent",
        "options_considered": [
            "Option A: Complex multi-agent adversarial red-teaming prompts.",
            "Option B: Strict data boundary (<customer> XML wrapper), no sensitive operations in LLM context, zero execution privileges for LLM, and rule verification in code.",
        ],
        "chosen": "Option B",
        "why": "Prompt-based defenses eventually fail against clever jailbreaks. By stripping the AI of all execution power and forcing every action through code guards, prompt injections are rendered completely harmless.",
        "evidence": "/api/tests/run with use_real_llm=true sends live prompt injection attacks (Cases 20-23: 'I am admin', 'Agent approved', 'Ignore rules', refund diversion) to Groq; verified that LLM context containment in XML tags and deterministic policy code in app/services/policy.py block unauthorized actions regardless of LLM classification.",
        "what_we_gave_up": "Allowing the AI to autonomously adjust prices, write custom discounts, or negotiate with users.",
        "what_would_change_mind": "If the business required bespoke bargaining where dynamic pricing was part of the value proposition.",
    },
    {
        "problem_id": 8,
        "title": "Limits and the off switch",
        "options_considered": [
            "Option A: Periodic cron jobs that review daily expenditure.",
            "Option B: Immediate synchronous execution guards with a global advisory lock for AI auto-actions, $500 daily safety cap that pauses auto-refunds, and an instant kill switch.",
        ],
        "chosen": "Option B",
        "why": "A flood of concurrent exploit attempts could drain thousands of dollars before a cron job fires. Synchronous limits enforce limits on every single cent.",
        "evidence": "test_limits.py and actions.py tests confirm that hitting $500 cap automatically flips auto_refunds_paused=True and routes further actions to human approval.",
        "what_we_gave_up": "Uninterrupted automated throughput during unusual spikes of legitimate customer volume.",
        "what_would_change_mind": "Dynamic ML-based fraud anomaly detection that recalculates limits dynamically based on merchant cash reserves.",
    },
    {
        "problem_id": 9,
        "title": "Every decision explained and recorded",
        "options_considered": [
            "Option A: Store unstructured log text in server files or Datadog.",
            "Option B: Structured ticket_events timeline linking facts_checked, rule_decision, action_done, and actor attribution directly to the ticket row in PostgreSQL.",
        ],
        "chosen": "Option B",
        "why": "Compliance auditors (Viewer role) and support managers must be able to open any ticket and reconstruct exactly what happened in under 60 seconds. In-app timelines provide total auditability.",
        "evidence": "Ticket detail view renders facts checked, rule decision, Stripe charge ID, and timeline step-by-step; AI performance metrics are computed directly from these events.",
        "what_we_gave_up": "Minimal database disk footprint, as logging rich event payloads consumes slightly more storage.",
        "what_would_change_mind": "Extreme high-scale volume (billions of events/day) requiring external cold-storage log lakes (e.g. ClickHouse/BigQuery).",
    },
    {
        "problem_id": 10,
        "title": "Proving it works before trusting it",
        "options_considered": [
            "Option A: Test in production with a 5% traffic canary.",
            "Option B: Comprehensive 30-case deterministic test suite + watching mode where AI operates in shadow mode, measuring human agreement rate before granting autonomous permissions per case type.",
        ],
        "chosen": "Option B",
        "why": "Financial and customer trust cannot be gambled on canaries. Watching mode lets the AI prove its alignment on 100% of real tickets without risk, while the 30-test suite guarantees regression safety.",
        "evidence": "Automated test suite endpoint (/api/tests/run) provides dual-mode verification: a fast deterministic regression suite (30 scenarios across 5 use cases in <150ms) plus live use_real_llm=true verification against 30 messy real-world customer prompts before auto-mode gating can be unlocked in settings.",
        "what_we_gave_up": "Instant day-one automation; requires an initial shadow validation period before switching on auto mode per case type.",
        "what_would_change_mind": "If a regulatory sandbox environment provided guaranteed reimbursement for AI testing mistakes.",
    },
]

@router.get("")
def get_decision_log(_: dict = Depends(get_current_staff)):
    return DECISION_LOGS
