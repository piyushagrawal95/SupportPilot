import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from app.api.auth import verify_password
from app.db.pool import pool

pool.open()
with pool.connection() as c:
    rows = c.execute("select id, email, role, password_hash from staff_users order by id").fetchall()
    print("Is database me staff:")
    for r in rows:
        ok = verify_password(r["password_hash"], "Test@1234")
        print(f"  id={r['id']} {r['email']:<26} role={r['role']:<9} Test@1234 chalega? {ok}")
pool.close()