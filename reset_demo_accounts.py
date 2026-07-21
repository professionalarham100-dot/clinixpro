#!/usr/bin/env python3
"""
ClinixPro — data-only reset to a clean testing state.

Wipes application/test data, resets auto-increments, and reseeds ONLY the
three demo accounts used by the project:

  admin@clinixpro.com   / Admin@123   (admin)
  doctor@clinixpro.com  / Doctor@123  (doctor)
  patient@clinixpro.com / Patient@123 (patient)

Does not modify schema, application source, or configuration.
Safe to run standalone, or via POST /api/admin/refresh-demo-data.
"""

from __future__ import annotations

import json
import os
import sys
from datetime import date

import pymysql
from dotenv import load_dotenv
from werkzeug.security import generate_password_hash

# Prefer backend/.env (same as the Flask app).
_HERE = os.path.dirname(os.path.abspath(__file__))
_BACKEND_ENV = os.path.join(_HERE, "backend", ".env")
if os.path.isfile(_BACKEND_ENV):
    load_dotenv(_BACKEND_ENV, override=True)
else:
    load_dotenv(override=True)

DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = int(os.getenv("DB_PORT", "3306"))
DB_USER = os.getenv("DB_USER", "root")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")
DB_NAME = os.getenv("DB_NAME", "smart_clinic")

DEMO_ADMIN_EMAIL = "admin@clinixpro.com"
DEMO_DOCTOR_EMAIL = "doctor@clinixpro.com"
DEMO_PATIENT_EMAIL = "patient@clinixpro.com"
DEMO_ADMIN_PASSWORD = "Admin@123"
DEMO_DOCTOR_PASSWORD = "Doctor@123"
DEMO_PATIENT_PASSWORD = "Patient@123"

# Tables that hold runtime/test data (order does not matter with FK checks off).
WIPE_TABLES = (
    "activity_logs",
    "billing",
    "prescriptions",
    "medical_records",
    "appointments",
    "messages",
    "tasks",
    "support_tickets",
    "password_reset_codes",
    "pending_registrations",
    "doctor_applications",
    "patient_uploaded_records",
    "staff",
    "patients",
    "doctors",
    "users",
)

JSON_DATA_FILES = (
    os.path.join(_HERE, "backend", "data", "tickets.json"),
    os.path.join(_HERE, "backend", "data", "chat_messages.json"),
    os.path.join(_HERE, "backend", "backend", "data", "tickets.json"),
    os.path.join(_HERE, "backend", "backend", "data", "chat_messages.json"),
)


def _table_exists(cursor, table_name: str) -> bool:
    cursor.execute(
        """
        SELECT COUNT(*) AS c
        FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = %s AND TABLE_NAME = %s AND TABLE_TYPE = 'BASE TABLE'
        """,
        (DB_NAME, table_name),
    )
    row = cursor.fetchone()
    if isinstance(row, dict):
        return int(row.get("c") or 0) > 0
    return int(row[0] if row else 0) > 0


def _column_exists(cursor, table_name: str, column_name: str) -> bool:
    cursor.execute(
        """
        SELECT COUNT(*) AS c
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = %s AND TABLE_NAME = %s AND COLUMN_NAME = %s
        """,
        (DB_NAME, table_name, column_name),
    )
    row = cursor.fetchone()
    if isinstance(row, dict):
        return int(row.get("c") or 0) > 0
    return int(row[0] if row else 0) > 0


DEMO_DOCTOR = {
    'name': 'Dr. Demo Doctor',
    'email': 'doctor@clinixpro.com',
    'phone': '+92-300-1112233',
    'specialization': 'General Physician',
    'qualification': 'MBBS, FCPS (Medicine)',
    'license_number': 'PMC-DEMO-001',
    'department': 'Internal Medicine',
    'consultation_fee': 1500.00,
    'experience_years': 8,
    'bio': 'General physician with focus on chronic care and preventive medicine.',
    'office_hours_start': '09:00:00',
    'office_hours_end': '17:00:00',
    'password': 'Doctor@123',
}


DEMO_PATIENT = {
    'name': 'Demo Patient',
    'email': 'patient@clinixpro.com',
    'phone': '+92-321-7778899',
    'dob': date(1995, 6, 15),
    'gender': 'Male',
    'address': '12 Demo Street, Block A',
    'city': 'Karachi',
    'state': 'Sindh',
    'postal_code': '74000',
    'blood_group': 'O+',
    'allergies': 'None reported',
    'medical_history': 'No significant past medical history.',
    'emergency_contact_name': 'Family Member',
    'emergency_contact_phone': '+92-321-0001111',
    'password': 'Patient@123',
}


def wipe(cursor) -> None:
    """Delete all application data and reset auto-increments."""
    cursor.execute("SET FOREIGN_KEY_CHECKS=0")
    try:
        for table in WIPE_TABLES:
            if not _table_exists(cursor, table):
                continue
            cursor.execute(f"TRUNCATE TABLE `{table}`")
            cursor.execute(f"ALTER TABLE `{table}` AUTO_INCREMENT = 1")
    finally:
        cursor.execute("SET FOREIGN_KEY_CHECKS=1")


def seed_admin(cursor) -> None:
    cursor.execute(
        """
        INSERT INTO users (email, password, user_type, status)
        VALUES (%s, %s, 'admin', 'active')
        """,
        (DEMO_ADMIN_EMAIL, generate_password_hash(DEMO_ADMIN_PASSWORD)),
    )


def seed_doctor(cursor) -> None:
    cursor.execute(
        """
        INSERT INTO users (email, password, user_type, status)
        VALUES (%s, %s, 'doctor', 'active')
        """,
        (DEMO_DOCTOR_EMAIL, generate_password_hash(DEMO_DOCTOR_PASSWORD)),
    )

    columns = [
        "name", "email", "phone", "specialization", "qualification",
        "license_number", "department", "consultation_fee", "is_available",
        "experience_years", "status",
    ]
    values = [
        "Dr. Demo Doctor",
        DEMO_DOCTOR_EMAIL,
        "03001234567",
        "General Medicine",
        "MBBS",
        "DEMO001",
        "General Medicine",
        500.00,
        True,
        5,
        "active",
    ]

    optional = {
        "office_hours_start": "09:00:00",
        "office_hours_end": "17:00:00",
        "availability_days": "Mon,Tue,Wed,Thu,Fri",
        "slot_duration_minutes": 30,
        "profile_onboarding_complete": 1,
        "photo_data": None,
        "bio": None,
    }
    for col, val in optional.items():
        if _column_exists(cursor, "doctors", col):
            columns.append(col)
            values.append(val)

    placeholders = ", ".join(["%s"] * len(values))
    col_sql = ", ".join(f"`{c}`" for c in columns)
    cursor.execute(
        f"INSERT INTO doctors ({col_sql}) VALUES ({placeholders})",
        tuple(values),
    )


def seed_patient(cursor) -> None:
    cursor.execute(
        """
        INSERT INTO users (email, password, user_type, status)
        VALUES (%s, %s, 'patient', 'active')
        """,
        (DEMO_PATIENT_EMAIL, generate_password_hash(DEMO_PATIENT_PASSWORD)),
    )

    columns = ["name", "email", "phone", "dob", "status"]
    values = ["Demo Patient", DEMO_PATIENT_EMAIL, "03009876543", "1995-01-01", "active"]

    optional = {
        "gender": "Female",
        "blood_group": "O+",
        "photo_data": None,
        "address": None,
        "allergies": None,
        "medical_history": None,
    }
    for col, val in optional.items():
        if _column_exists(cursor, "patients", col):
            columns.append(col)
            values.append(val)

    placeholders = ", ".join(["%s"] * len(values))
    col_sql = ", ".join(f"`{c}`" for c in columns)
    cursor.execute(
        f"INSERT INTO patients ({col_sql}) VALUES ({placeholders})",
        tuple(values),
    )


def clear_json_caches() -> None:
    """Clear file-backed tickets / chat caches created during testing."""
    for path in JSON_DATA_FILES:
        try:
            os.makedirs(os.path.dirname(path), exist_ok=True)
            with open(path, "w", encoding="utf-8") as fh:
                json.dump([], fh)
        except Exception as exc:
            print(f"[reset] warning: could not clear {path}: {exc}")


def connect():
    return pymysql.connect(
        host=DB_HOST,
        port=DB_PORT,
        user=DB_USER,
        password=DB_PASSWORD,
        database=DB_NAME,
        charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor,
        autocommit=False,
    )


def run_reset() -> None:
    print(f"[reset] Connecting to {DB_HOST}:{DB_PORT}/{DB_NAME} as {DB_USER} …")
    conn = connect()
    try:
        with conn.cursor() as cursor:
            print("[reset] Wiping application data …")
            wipe(cursor)
            print("[reset] Seeding demo admin …")
            seed_admin(cursor)
            print("[reset] Seeding demo doctor …")
            seed_doctor(cursor)
            print("[reset] Seeding demo patient …")
            seed_patient(cursor)

            cursor.execute("SELECT email, user_type, status FROM users ORDER BY user_id")
            users = cursor.fetchall()
            cursor.execute("SELECT COUNT(*) AS c FROM appointments")
            appts = cursor.fetchone()["c"]
            cursor.execute("SELECT COUNT(*) AS c FROM medical_records")
            records = cursor.fetchone()["c"]
            cursor.execute("SELECT COUNT(*) AS c FROM prescriptions")
            rxs = cursor.fetchone()["c"]
            cursor.execute("SELECT COUNT(*) AS c FROM billing")
            bills = cursor.fetchone()["c"]
            cursor.execute("SELECT COUNT(*) AS c FROM messages")
            msgs = cursor.fetchone()["c"]
            cursor.execute("SELECT COUNT(*) AS c FROM patient_uploaded_records")
            uploads = cursor.fetchone()["c"]
            cursor.execute("SELECT COUNT(*) AS c FROM pending_registrations")
            pending = cursor.fetchone()["c"]
            cursor.execute("SELECT COUNT(*) AS c FROM password_reset_codes")
            otps = cursor.fetchone()["c"]
            cursor.execute("SELECT COUNT(*) AS c FROM doctor_applications")
            apps = cursor.fetchone()["c"]

        conn.commit()
        clear_json_caches()

        print("[reset] Done.")
        print("[reset] Users remaining:")
        for u in users:
            print(f"  - {u['email']} ({u['user_type']}) [{u['status']}]")
        print(
            "[reset] Generated data counts → "
            f"appointments={appts}, records={records}, prescriptions={rxs}, "
            f"billing={bills}, messages={msgs}, uploads={uploads}, "
            f"pending_regs={pending}, otps={otps}, doctor_apps={apps}"
        )
        print("[reset] Demo logins:")
        print(f"  admin   {DEMO_ADMIN_EMAIL} / {DEMO_ADMIN_PASSWORD}")
        print(f"  doctor  {DEMO_DOCTOR_EMAIL} / {DEMO_DOCTOR_PASSWORD}")
        print(f"  patient {DEMO_PATIENT_EMAIL} / {DEMO_PATIENT_PASSWORD}")
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    try:
        run_reset()
    except Exception as exc:
        print(f"[reset] FAILED: {exc}", file=sys.stderr)
        sys.exit(1)
