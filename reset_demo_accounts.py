"""Wipe all demo data and seed exactly one demo account per role.

Usage (from project root):
    python Fyp/reset_demo_accounts.py

All clinical data (patients, doctors, appointments, records, prescriptions,
billing, tasks, doctor_applications, password_reset_codes, activity_logs)
is removed, plus every user row, so the database starts clean.

After this runs, exactly three accounts exist:

    Admin     admin@clinixpro.com    Admin@123
    Doctor    doctor@clinixpro.com   Doctor@123
    Patient   patient@clinixpro.com  Patient@123
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


# Order matters: delete children before parents.
WIPE_ORDER = [
    'activity_logs',
    'tasks',
    'billing',
    'prescriptions',
    'medical_records',
    'appointments',
    'doctor_applications',
    'password_reset_codes',
    'patients',
    'doctors',
]


DEMO_ADMIN = {
    'email': 'admin@clinixpro.com',
    'password': 'Admin@123',
}


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


def wipe(cursor):
    cursor.execute("SET FOREIGN_KEY_CHECKS=0")
    print("Wiping clinical tables…")
    for table in WIPE_ORDER:
        try:
            cursor.execute(f"DELETE FROM {table}")
            cursor.execute(f"ALTER TABLE {table} AUTO_INCREMENT=1")
            print(f"  - cleared {table}")
        except pymysql.err.ProgrammingError as exc:
            if exc.args and exc.args[0] == 1146:
                print(f"  - skipped {table} (table not present)")
            else:
                raise

    print("Removing ALL user accounts (admins included)…")
    cursor.execute("DELETE FROM users")
    cursor.execute("ALTER TABLE users AUTO_INCREMENT=1")
    cursor.execute("SET FOREIGN_KEY_CHECKS=1")


def upsert_user(cursor, email, plain_password, user_type):
    pw_hash = generate_password_hash(plain_password)
    cursor.execute(
        "INSERT INTO users (email, password, user_type, status) "
        "VALUES (%s, %s, %s, 'active') "
        "ON DUPLICATE KEY UPDATE password=VALUES(password), user_type=VALUES(user_type), status='active'",
        (email, pw_hash, user_type)
    )


def seed_admin(cursor):
    print("Seeding demo admin…")
    a = DEMO_ADMIN
    upsert_user(cursor, a['email'], a['password'], 'admin')
    print(f"  + admin  [{a['email']}]")


def seed_doctor(cursor):
    print("Seeding demo doctor…")
    d = DEMO_DOCTOR
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
        d,
    )
    upsert_user(cursor, d['email'], d['password'], 'doctor')
    print(f"  + {d['name']}  ({d['specialization']})  [{d['email']}]")


def seed_patient(cursor):
    print("Seeding demo patient…")
    p = DEMO_PATIENT
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
        p,
    )
    upsert_user(cursor, p['email'], p['password'], 'patient')
    print(f"  + {p['name']}  [{p['email']}]")


def main():
    print(f"Connecting to MySQL @ {DB_CONFIG['host']}:{DB_CONFIG['port']} db={DB_CONFIG['database']}")
    try:
        connection = pymysql.connect(**DB_CONFIG)
    except Exception as exc:
        print(f"ERROR: cannot connect to MySQL: {exc}")
        sys.exit(1)

    try:
        with connection.cursor() as cursor:
            wipe(cursor)
            seed_admin(cursor)
            seed_doctor(cursor)
            seed_patient(cursor)
        connection.commit()
        print("\nSUCCESS: demo accounts ready.\n")
        print("Login credentials:")
        print("  Admin    email: admin@clinixpro.com     password: Admin@123")
        print("  Doctor   email: doctor@clinixpro.com    password: Doctor@123")
        print("  Patient  email: patient@clinixpro.com   password: Patient@123")
    except Exception as exc:
        connection.rollback()
        print(f"ERROR: reset failed, transaction rolled back: {exc}")
        sys.exit(2)
    finally:
        connection.close()


if __name__ == '__main__':
    main()
