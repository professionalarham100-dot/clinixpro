"""One-shot: remove every known legacy/current demo account and seed
exactly one fresh demo per role. Real test data (non-demo doctors, patients,
appointments, etc.) is preserved.

Usage (from project root):
    python Fyp/cleanup_old_demos.py
"""
import os
import sys
import pymysql
from datetime import date
from werkzeug.security import generate_password_hash
from dotenv import load_dotenv


HERE = os.path.dirname(os.path.abspath(__file__))
ENV_PATH = os.path.join(HERE, 'backend', '.env')
ENV_EXAMPLE_PATH = os.path.join(HERE, 'backend', '.env.example')
if os.path.exists(ENV_PATH):
    load_dotenv(dotenv_path=ENV_PATH, override=True)
elif os.path.exists(ENV_EXAMPLE_PATH):
    load_dotenv(dotenv_path=ENV_EXAMPLE_PATH, override=True)


DB_CONFIG = dict(
    host=os.getenv('DB_HOST', 'localhost'),
    port=int(os.getenv('DB_PORT', 3306)),
    user=os.getenv('DB_USER', 'root'),
    password=os.getenv('DB_PASSWORD', ''),
    database=os.getenv('DB_NAME', 'smart_clinic'),
    charset='utf8mb4',
    cursorclass=pymysql.cursors.DictCursor,
    autocommit=False,
)


# Every known demo / legacy demo email across the codebase.
# Includes the new emails so the script is idempotent (delete then reseed).
LEGACY_EMAILS = [
    # legacy admin
    'admin@hospital.com',
    # legacy doctors
    'dr.amir@hospital.com',
    'dr.sara.cardio@hospital.com',
    'doctor@smartclinic.com',
    'dr.fatima@smartclinic.com',
    'dr.hassan@smartclinic.com',
    # legacy patients
    'patient.demo@clinixpro.com',
    'patient@smartclinic.com',
    'ahmed.hassan@email.com',
    # new targets (will be reseeded after delete)
    'admin@clinixpro.com',
    'doctor@clinixpro.com',
    'patient@clinixpro.com',
]


DEMO_ADMIN = {'email': 'admin@clinixpro.com', 'password': 'Admin@123'}

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
    'gender': 'M',
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


def safe_exec(cursor, sql, params=None, label=None):
    """Run a DELETE/UPDATE that may target a column or table that doesn't exist.
    Swallows MySQL 'unknown column' (1054) and 'no such table' (1146) so the
    cleanup keeps going on partial schemas."""
    try:
        cursor.execute(sql, params or ())
        if cursor.rowcount and label:
            print(f"  - removed {cursor.rowcount} rows from {label}")
        return cursor.rowcount
    except pymysql.err.Error as exc:
        code = exc.args[0] if exc.args else None
        if code in (1054, 1146):
            return 0
        raise


def fetch_ids(cursor, table, id_col, emails):
    placeholders = ','.join(['%s'] * len(emails))
    try:
        cursor.execute(
            f"SELECT {id_col} FROM {table} WHERE email IN ({placeholders})",
            emails,
        )
    except pymysql.err.Error as exc:
        if exc.args and exc.args[0] in (1054, 1146):
            return []
        raise
    return [row[id_col] for row in cursor.fetchall()]


def upsert_user(cursor, email, plain_pw, user_type):
    pw_hash = generate_password_hash(plain_pw)
    cursor.execute(
        "INSERT INTO users (email, password, user_type, status) "
        "VALUES (%s, %s, %s, 'active') "
        "ON DUPLICATE KEY UPDATE password=VALUES(password), user_type=VALUES(user_type), status='active'",
        (email, pw_hash, user_type),
    )


def purge(cursor):
    print("Looking up demo entities...")
    doctor_ids = fetch_ids(cursor, 'doctors', 'doctor_id', LEGACY_EMAILS)
    patient_ids = fetch_ids(cursor, 'patients', 'patient_id', LEGACY_EMAILS)
    user_ids = fetch_ids(cursor, 'users', 'user_id', LEGACY_EMAILS)
    print(f"  - {len(user_ids)} users, {len(doctor_ids)} doctors, {len(patient_ids)} patients to remove")

    cursor.execute("SET FOREIGN_KEY_CHECKS=0")

    # Doctor-scoped dependents.
    if doctor_ids:
        ph = ','.join(['%s'] * len(doctor_ids))
        for table, col in [('appointments', 'doctor_id'),
                           ('medical_records', 'doctor_id'),
                           ('prescriptions', 'doctor_id'),
                           ('tasks', 'doctor_id'),
                           ('tasks', 'assigned_to')]:
            safe_exec(cursor, f"DELETE FROM {table} WHERE {col} IN ({ph})", doctor_ids,
                      label=f"{table} ({col})")

    # Patient-scoped dependents.
    if patient_ids:
        ph = ','.join(['%s'] * len(patient_ids))
        for table, col in [('appointments', 'patient_id'),
                           ('medical_records', 'patient_id'),
                           ('prescriptions', 'patient_id'),
                           ('billing', 'patient_id'),
                           ('tasks', 'patient_id')]:
            safe_exec(cursor, f"DELETE FROM {table} WHERE {col} IN ({ph})", patient_ids,
                      label=f"{table} ({col})")

    # User-scoped dependents.
    if user_ids:
        ph = ','.join(['%s'] * len(user_ids))
        for table, col in [('activity_logs', 'user_id'),
                           ('messages', 'from_user_id'),
                           ('messages', 'to_user_id')]:
            safe_exec(cursor, f"DELETE FROM {table} WHERE {col} IN ({ph})", user_ids,
                      label=f"{table} ({col})")

    # Email-keyed tables.
    ph_email = ','.join(['%s'] * len(LEGACY_EMAILS))
    safe_exec(cursor, f"DELETE FROM doctor_applications WHERE email IN ({ph_email})",
              LEGACY_EMAILS, label="doctor_applications")
    safe_exec(cursor, f"DELETE FROM password_reset_codes WHERE email IN ({ph_email})",
              LEGACY_EMAILS, label="password_reset_codes")
    safe_exec(cursor, f"DELETE FROM pending_registrations WHERE email IN ({ph_email})",
              LEGACY_EMAILS, label="pending_registrations")

    # Finally remove the entity rows themselves.
    if doctor_ids:
        ph = ','.join(['%s'] * len(doctor_ids))
        cursor.execute(f"DELETE FROM doctors WHERE doctor_id IN ({ph})", doctor_ids)
        print(f"  - removed {cursor.rowcount} doctor rows")
    if patient_ids:
        ph = ','.join(['%s'] * len(patient_ids))
        cursor.execute(f"DELETE FROM patients WHERE patient_id IN ({ph})", patient_ids)
        print(f"  - removed {cursor.rowcount} patient rows")
    if user_ids:
        ph = ','.join(['%s'] * len(user_ids))
        cursor.execute(f"DELETE FROM users WHERE user_id IN ({ph})", user_ids)
        print(f"  - removed {cursor.rowcount} user rows")

    cursor.execute("SET FOREIGN_KEY_CHECKS=1")


def seed(cursor):
    print("\nSeeding three fresh demo accounts...")

    upsert_user(cursor, DEMO_ADMIN['email'], DEMO_ADMIN['password'], 'admin')
    print(f"  + admin    {DEMO_ADMIN['email']}")

    cursor.execute(
        """
        INSERT INTO doctors (
            name, email, phone, specialization, qualification, license_number,
            department, consultation_fee, is_available, experience_years, bio,
            office_hours_start, office_hours_end, status
        ) VALUES (
            %(name)s, %(email)s, %(phone)s, %(specialization)s, %(qualification)s,
            %(license_number)s, %(department)s, %(consultation_fee)s, TRUE,
            %(experience_years)s, %(bio)s, %(office_hours_start)s,
            %(office_hours_end)s, 'active'
        )
        """,
        DEMO_DOCTOR,
    )
    upsert_user(cursor, DEMO_DOCTOR['email'], DEMO_DOCTOR['password'], 'doctor')
    print(f"  + doctor   {DEMO_DOCTOR['email']}")

    cursor.execute(
        """
        INSERT INTO patients (
            name, email, phone, dob, gender, address, city, state, postal_code,
            blood_group, allergies, medical_history, emergency_contact_name,
            emergency_contact_phone, status
        ) VALUES (
            %(name)s, %(email)s, %(phone)s, %(dob)s, %(gender)s, %(address)s,
            %(city)s, %(state)s, %(postal_code)s, %(blood_group)s, %(allergies)s,
            %(medical_history)s, %(emergency_contact_name)s,
            %(emergency_contact_phone)s, 'active'
        )
        """,
        DEMO_PATIENT,
    )
    upsert_user(cursor, DEMO_PATIENT['email'], DEMO_PATIENT['password'], 'patient')
    print(f"  + patient  {DEMO_PATIENT['email']}")


def main():
    print(f"Connecting to MySQL @ {DB_CONFIG['host']}:{DB_CONFIG['port']} db={DB_CONFIG['database']}")
    try:
        connection = pymysql.connect(**DB_CONFIG)
    except Exception as exc:
        print(f"ERROR: cannot connect to MySQL: {exc}")
        sys.exit(1)

    try:
        with connection.cursor() as cursor:
            purge(cursor)
            seed(cursor)
        connection.commit()
        print("\nSUCCESS: demo accounts ready.\n")
        print("Login credentials:")
        print("  Admin    email: admin@clinixpro.com     password: Admin@123")
        print("  Doctor   email: doctor@clinixpro.com    password: Doctor@123")
        print("  Patient  email: patient@clinixpro.com   password: Patient@123")
    except Exception as exc:
        connection.rollback()
        print(f"ERROR: cleanup failed, transaction rolled back: {exc}")
        sys.exit(2)
    finally:
        connection.close()


if __name__ == '__main__':
    main()
