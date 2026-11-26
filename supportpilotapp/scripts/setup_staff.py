import argparse
import pathlib
import sys
import uuid

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from app.api.auth import hash_password
from app.db.pool import pool

# (naam, email, role)
PEOPLE = [
    ("Piyush", "piyush@cloudnotes.com", "admin"),
    ("Kashish", "kashish@cloudnotes.com", "approver"),
    ("Yash", "yash@cloudnotes.com", "agent"),
    ("Sonu", "sonu@cloudnotes.com", "agent"),
    ("Auditor", "auditor@cloudnotes.com", "viewer"),
]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--password", default="Test@1234")
    args = ap.parse_args()
    if len(args.password) < 6:
        sys.exit("Password kam se kam 6 characters ka hona chahiye")

    pool.open()
    try:
        with pool.connection() as c:
            for name, email, role in PEOPLE:
                pw = hash_password(args.password)
                row = c.execute("select id from staff_users where lower(email)=%s", (email,)).fetchone()
                if row:
                    c.execute(
                        "update staff_users set name=%s, role=%s, password_hash=%s where id=%s",
                        (name, role, pw, row["id"]),
                    )
                    action = "updated"
                else:
                    c.execute(
                        "insert into staff_users (auth_user_id, email, name, role, availability, password_hash, last_seen_at) "
                        "values (%s, %s, %s, %s, 'away', %s, now())",
                        (str(uuid.uuid4()), email, name, role, pw),
                    )
                    action = "created"
                print(f"  {name:<8} {email:<26} {role:<9} -> {action}")

            print("\nAb staff_users table me ye hai:")
            for r in c.execute("select id, name, email, role from staff_users order by id").fetchall():
                print(" ", dict(r))
        print(f"\nSabka password: {args.password}")
    finally:
        pool.close()


if __name__ == "__main__":
    main()