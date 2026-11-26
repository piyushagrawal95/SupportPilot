import hashlib
import os
import secrets
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend")))
from app.db.pool import pool

def hash_pw(raw_pwd: str) -> str:
    salt = secrets.token_hex(16)
    key = hashlib.pbkdf2_hmac('sha256', raw_pwd.encode('utf-8'), salt.encode('utf-8'), 100000).hex()
    return f"pbkdf2:sha256:100000${salt}${key}"

pool.open()
with pool.connection() as conn:
    conn.execute("alter table staff_users add column if not exists reset_token_hash text;")
    conn.execute("alter table staff_users add column if not exists reset_token_expires_at timestamptz;")
    
    users = conn.execute("select id, email, role, password_hash from staff_users").fetchall()
    for u in users:
        curr = u['password_hash'] or ''
        if not curr.startswith('pbkdf2:sha256:'):
            role = u['role']
            role_passwords = {
                "admin": "SupportPilotAdmin2026!",
                "agent": "PriyaAgent2026!",
                "approver": "AnitaApprover2026!",
                "viewer": "AuditorViewer2026!",
            }
            raw_pwd = role_passwords.get(role, "SupportPilotSecure2026!")
            hashed = hash_pw(raw_pwd)
            conn.execute("update staff_users set password_hash = %s where id = %s", (hashed, u['id']))
            print(f"Updated user {u['email']} to salted pbkdf2 hash ({role})")
        else:
            print(f"User {u['email']} already has salted pbkdf2 hash")
pool.close()
print("Migration completed successfully.")
