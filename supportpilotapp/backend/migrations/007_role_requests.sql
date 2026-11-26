-- Migration 007: Role Upgrade Requests
CREATE TABLE IF NOT EXISTS role_requests (
    id SERIAL PRIMARY KEY,
    staff_user_id BIGINT NOT NULL REFERENCES staff_users(id) ON DELETE CASCADE,
    requested_role TEXT NOT NULL CHECK (requested_role IN ('approver', 'admin', 'viewer')),
    reason TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    decided_at TIMESTAMPTZ,
    decided_by BIGINT REFERENCES staff_users(id)
);

CREATE INDEX IF NOT EXISTS idx_role_requests_status ON role_requests(status);
