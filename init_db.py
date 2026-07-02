"""
init_db.py - Run schema.sql against Railway MySQL on startup.
"""
import os
import sys
import time
from dotenv import load_dotenv

env_path = os.path.join(os.path.dirname(__file__), 'backend', '.env')
if os.path.exists(env_path):
    load_dotenv(env_path, override=True)

DB_HOST = os.getenv('DB_HOST', 'localhost')
DB_PORT = int(os.getenv('DB_PORT', 3306))
DB_USER = os.getenv('DB_USER', 'root')
DB_PASSWORD = os.getenv('DB_PASSWORD', '')
DB_NAME = os.getenv('DB_NAME', 'smart_clinic')
SCHEMA_FILE = os.path.join(os.path.dirname(__file__), 'database', 'schema.sql')


def wait_for_mysql(retries=15, delay=3):
    import pymysql
    for attempt in range(1, retries + 1):
        try:
            conn = pymysql.connect(
                host=DB_HOST, port=DB_PORT,
                user=DB_USER, password=DB_PASSWORD,
                connect_timeout=5,
            )
            conn.close()
            print(f"[init_db] MySQL reachable on attempt {attempt}")
            return True
        except Exception as e:
            print(f"[init_db] Attempt {attempt}/{retries} - MySQL not ready: {e}")
            if attempt < retries:
                time.sleep(delay)
    return False


def run_schema():
    import pymysql
    if not os.path.isfile(SCHEMA_FILE):
        print(f"[init_db] Schema file not found at {SCHEMA_FILE}, skipping.")
        return

    with open(SCHEMA_FILE, 'r', encoding='utf-8') as f:
        schema_sql = f.read()

    schema_sql = schema_sql.replace('smart_clinic', DB_NAME)

    conn = pymysql.connect(
        host=DB_HOST, port=DB_PORT,
        user=DB_USER, password=DB_PASSWORD,
        autocommit=True, charset='utf8mb4',
    )
    try:
        cursor = conn.cursor()
        statements = [s.strip() for s in schema_sql.split(';') if s.strip()]
        executed = 0
        for stmt in statements:
            lines = [l for l in stmt.split('\n') if l.strip() and not l.strip().startswith('--')]
            if not lines:
                continue
            try:
                cursor.execute(stmt)
                executed += 1
            except pymysql.err.OperationalError as e:
                if e.args[0] in (1050, 1060, 1061):
                    pass
                else:
                    print(f"[init_db] Warning: {e}")
            except Exception as e:
                print(f"[init_db] Warning: {e}")
        print(f"[init_db] Schema applied - {executed} statements executed.")
    finally:
        conn.close()


if __name__ == '__main__':
    if not wait_for_mysql():
        print("[init_db] WARNING: MySQL not reachable - app will start in fallback mode.")
        sys.exit(0)
    try:
        run_schema()
    except Exception as e:
        print(f"[init_db] Schema init error: {e}")
        sys.exit(0)
