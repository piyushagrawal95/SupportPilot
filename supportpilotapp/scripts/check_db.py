import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend")))
from app.db.pool import pool

pool.open()
with pool.connection() as conn:
    rows = conn.execute("select table_name from information_schema.tables where table_schema='public'").fetchall()
    print("Tables:", [r['table_name'] for r in rows])
    settings = conn.execute("select * from settings").fetchall()
    print("Settings count:", len(settings), "Data:", [dict(s) for s in settings])
    staff = conn.execute("select * from staff_users").fetchall()
    print("Staff users:", [dict(s) for s in staff])
pool.close()
