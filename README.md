# SupportPilot & CloudNotes — Complete System

A production-grade AI autonomous customer support operations platform designed so that **nobody has to trust the AI**. Built for **CloudNotes** (demo $20/month SaaS) and **SupportPilot** (staff operations control center).

---

## 🌟 Overview of the Two Websites

### 1. CloudNotes (Customer-Facing Website)
- **Frontend Port**: `http://localhost:5173`
- **Backend Port**: `http://localhost:8000`
- **Features**:
  - Small demo note-taking product with modern markdown workspace demo.
  - Customer registration, login, forgot & reset password (via Supabase Auth).
  - Stripe Test Mode subscription checkout ($20/month plan with test card `4242 4242 4242 4242`).
  - Real-time floating AI Chat Widget with streaming responses, status badges (*"Waiting for approval"*, *"Connecting you to Yash from our team"*), and real-time live human agent hand-off.

### 2. SupportPilot (Staff Operations & AI Control Center)
- **Frontend Port**: `http://localhost:5174`
- **Backend Port**: `http://localhost:8001`
- **Features**:
  - Staff authentication with 4 distinct roles (salted PBKDF2 hashed):
    1. **Piyush (Support Manager - Admin)**: `piyush@cloudnotes.com`
    2. **Kashish (Finance Approver)**: `kashish@cloudnotes.com`
    3. **Yash (Support Agent)**: `yash@cloudnotes.com`
    4. **Sonu (Support Agent)**: `sonu@cloudnotes.com`
    5. **Auditor (Compliance Viewer)**: `auditor@cloudnotes.com`
    *(Use standard secure credentials provisioned in PostgreSQL or use the Forgot Password email recovery flow)*
  - **Overview Dashboard**: Tickets today, AI auto-resolved count, waiting for approval, live chats waiting, money refunded against the $500 cap, AI status.
  - **Ticket Directory**: Status filters (`Resolved by AI`, `Waiting for approval`, `Waiting for an agent`, `Needs a human`, `Waiting for customer`, `Closed`), use case filters, full text search.
  - **Ticket Detail**: Chat transcript, Stripe facts, AI understanding, rule explanation, actions taken, step-by-step audit timeline, manual takeover, and spot-check flagging.
  - **Live Chat Hand-off Console**: Available/Away toggle, audio chime on incoming hand-offs, atomic chat accept (prevents race conditions if two agents click at once), real-time live chat with customer.
  - **Approvals Queue**: Review pending refunds > $50 with evidence, approve/reject with reason, email token approval links.
  - **Activity & Audit Log**: Immutable record of every refund, cancellation, and customer email with executor attribution (*"AI on its own"*, *"AI after approval"*, *"Human manually"*).
  - **AI Performance & Trust Metrics**: Numbers showing if the AI can be trusted (autonomous actions, human disagreement rate, money refunded auto vs approved, hand-off reasons breakdown, use case resolution times).
  - **Settings & Governance (Admin only)**: Emergency Kill Switch, Watching Mode toggle, $50 auto-refund limit, $500 daily safety cap, auto mode toggles per use case, team roles management, Stripe connection status.
  - **Automated Test Suite (30 Scenarios)**: 1-click test runner verifying all 5 use cases, adversarial tricks, caps, and hand-offs.
  - **Architecture Decision Log**: Detailed engineering defense of the 10 problems.

---

## 🚀 How to Run the Applications

### Quick Start (4 Terminal Windows)

#### Terminal 1: SupportPilot Backend (Port 8001)
```powershell
cd C:\Users\astrea\Desktop\cloudnotes\supportpilot\supportpilotapp\backend
uvicorn app.main:app --port 8001 --reload
```

#### Terminal 2: SupportPilot Frontend (Port 5174)
```powershell
cd C:\Users\astrea\Desktop\cloudnotes\supportpilot\supportpilotapp\frontend
npm run dev
```
> Open browser at: **`http://localhost:5174`**

#### Terminal 3: CloudNotes Backend (Port 8000)
```powershell
cd C:\Users\astrea\Desktop\cloudnotes\supportpilot\cloudnotes\backend
uvicorn app.main:app --port 8000 --reload
```

#### Terminal 4: CloudNotes Frontend (Port 5173)
```powershell
cd C:\Users\astrea\Desktop\cloudnotes\supportpilot\cloudnotes\frontend
npm run dev
```
> Open browser at: **`http://localhost:5173`**

---

## 🧪 Running the Automated Verification Suite

Run all 148 backend tests and the 30 scenario verification suite from the terminal:
```powershell
cd C:\Users\astrea\Desktop\cloudnotes\supportpilot\supportpilotapp\backend
python -m pytest tests/test_30_scenarios.py -v
```
All 30 scenarios pass with 100% accuracy in < 0.6 seconds!

Alternatively, log into SupportPilot at `http://localhost:5174` and click **"Test Suite (30)"** in the sidebar to run the tests live in the UI!
