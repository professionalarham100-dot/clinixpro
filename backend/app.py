"""
Smart Clinical Management System - Backend
Flask REST API Server with Advanced Features
"""

from flask import Flask, jsonify, request, send_from_directory, Response
from flask.json.provider import DefaultJSONProvider
import base64
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash
from functools import wraps
import os
import re
import sys
import jwt
import json
import pymysql
import secrets
from dotenv import load_dotenv
from datetime import datetime, timedelta, date, time
from decimal import Decimal
GROQ_IMPORT_ERROR = None
try:
    from groq import Groq
except Exception as e:
    Groq = None
    GROQ_IMPORT_ERROR = str(e)

try:
    from flask_mail import Mail, Message
except ImportError:
    Mail = None
    Message = None

# Initialize Flask app
app = Flask(__name__)


class _ClinixJSONProvider(DefaultJSONProvider):
    """JSON provider that knows how to serialize MySQL/Decimal types.

    PyMySQL returns DECIMAL as ``decimal.Decimal``, TIME as
    ``datetime.timedelta``, DATE as ``datetime.date`` and DATETIME/TIMESTAMP as
    ``datetime.datetime``. Stock JSON encoding chokes on Decimal and timedelta,
    which crashed ``/api/auth/me`` and ``/api/doctors`` with a 500 once the
    doctors table actually had office hours and consultation fees populated.
    """

    @staticmethod
    def default(obj):
        if isinstance(obj, Decimal):
            return float(obj)
        if isinstance(obj, timedelta):
            total = int(obj.total_seconds())
            sign = '-' if total < 0 else ''
            total = abs(total)
            hours, remainder = divmod(total, 3600)
            minutes, seconds = divmod(remainder, 60)
            return f"{sign}{hours:02d}:{minutes:02d}:{seconds:02d}"
        if isinstance(obj, time):
            return obj.isoformat(timespec='seconds')
        if isinstance(obj, datetime):
            return obj.isoformat(sep=' ', timespec='seconds')
        if isinstance(obj, date):
            return obj.isoformat()
        if isinstance(obj, (bytes, bytearray)):
            try:
                return obj.decode('utf-8')
            except Exception:
                return obj.hex()
        return DefaultJSONProvider.default(obj)


app.json = _ClinixJSONProvider(app)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, 'data')
FRONTEND_DIR = os.path.normpath(os.path.join(BASE_DIR, '..', 'frontend'))
TICKETS_FILE = os.path.join(DATA_DIR, 'tickets.json')
CHAT_MESSAGES_FILE = os.path.join(DATA_DIR, 'chat_messages.json')

# Load environment variables from backend directory first.
# Prefer `.env`, but also support `.env.example` for local setups.
ENV_FILE = os.path.join(BASE_DIR, '.env')
if os.path.exists(ENV_FILE):
    load_dotenv(dotenv_path=ENV_FILE, override=True)

DB_HOST = os.getenv('DB_HOST', 'localhost')
DB_PORT = int(os.getenv('DB_PORT', 3306))
DB_USER = os.getenv('DB_USER', 'root')
DB_PASSWORD = os.getenv('DB_PASSWORD', '')
DB_NAME = os.getenv('DB_NAME', 'smart_clinic')
GROQ_API_KEY = os.getenv('GROQ_API_KEY', '').strip()

# Load configuration
_jwt_secret_from_env = os.getenv('JWT_SECRET_KEY')
if not _jwt_secret_from_env:
    print("[WARNING] JWT_SECRET_KEY is not set in .env. Generating an ephemeral secret for this process. "
          "Tokens will not survive a restart — set JWT_SECRET_KEY in .env for production.")
    _jwt_secret_from_env = secrets.token_hex(32)
app.config['JWT_SECRET_KEY'] = _jwt_secret_from_env
# Allow up to 16 MB for patient-uploaded records (photos / PDFs / etc.)
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024

# Server start time, used by /api/admin/system-info for the settings panel.
SERVER_START_TIME = datetime.now()

# Flask-Mail (Gmail SMTP)
app.config['MAIL_SERVER'] = os.getenv('MAIL_SERVER', 'smtp.gmail.com')
app.config['MAIL_PORT'] = int(os.getenv('MAIL_PORT', '587'))
app.config['MAIL_USE_TLS'] = os.getenv('MAIL_USE_TLS', 'true').strip().lower() in ('1', 'true', 'yes', 'on')
app.config['MAIL_USERNAME'] = os.getenv('MAIL_USERNAME', '').strip()
app.config['MAIL_PASSWORD'] = os.getenv('MAIL_PASSWORD', '').strip()
app.config['MAIL_DEFAULT_SENDER'] = (
    os.getenv('MAIL_DEFAULT_SENDER', '').strip() or app.config['MAIL_USERNAME'] or 'noreply@clinixpro.local'
)
mail = None
if Mail and app.config.get('MAIL_USERNAME') and app.config.get('MAIL_PASSWORD'):
    mail = Mail(app)

# Initialize extensions
# CORS: allow localhost for dev + Railway/production origins from env.
_cors_origins = [
    "http://127.0.0.1:5501",
    "http://localhost:5501",
    re.compile(r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$"),
    re.compile(r"^https://.*\.up\.railway\.app$"),
]
_extra_origin = os.getenv('CORS_ORIGINS', '').strip()
if _extra_origin and _extra_origin not in ('*', ''):
    _cors_origins.append(_extra_origin)

CORS(app, resources={
    r"/api/*": {
        "origins": _cors_origins,
        "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        "allow_headers": ["Content-Type", "Authorization"],
        "expose_headers": ["Content-Type", "Authorization"],
        "supports_credentials": True,
        "max_age": 3600
    }
})

# Mock database for demo purposes (fallback when MySQL is unavailable).
# Exactly one demo account per role. Keep these in sync with reset_demo_accounts.py.
mock_users = {
    'admin@clinixpro.com': {
        'user_id': 1,
        'password': generate_password_hash('Admin@123'),
        'user_type': 'admin',
        'name': 'Admin User'
    },
    'doctor@clinixpro.com': {
        'user_id': 2,
        'password': generate_password_hash('Doctor@123'),
        'user_type': 'doctor',
        'name': 'Dr. Demo Doctor'
    },
    'patient@clinixpro.com': {
        'user_id': 3,
        'password': generate_password_hash('Patient@123'),
        'user_type': 'patient',
        'name': 'Demo Patient'
    }
}

mock_patients = [
    {'patient_id': 1, 'name': 'Ali Ahmed', 'email': 'ali@gmail.com', 'phone': '03001234567', 'dob': '1990-05-15', 'gender': 'Male', 'blood_type': 'O+'},
    {'patient_id': 2, 'name': 'Mariam Hassan', 'email': 'mariam@gmail.com', 'phone': '03007654321', 'dob': '1992-08-22', 'gender': 'Female', 'blood_type': 'B+'},
    {'patient_id': 3, 'name': 'Hassan Khan', 'email': 'hassan@gmail.com', 'phone': '03009876543', 'dob': '1988-12-10', 'gender': 'Male', 'blood_type': 'A+'},
]

mock_doctors = [
    {'doctor_id': 1, 'name': 'Dr. Ahmed Hassan', 'specialty': 'Cardiology', 'phone': '03001111111', 'email': 'doctor@smartclinic.com', 'experience': '10 years'},
    {'doctor_id': 2, 'name': 'Dr. Fatima Ali', 'specialty': 'Pediatrics', 'phone': '03002222222', 'email': 'dr.fatima@smartclinic.com', 'experience': '8 years'},
    {'doctor_id': 3, 'name': 'Dr. Hassan Khan', 'specialty': 'Orthopedics', 'phone': '03003333333', 'email': 'dr.hassan@smartclinic.com', 'experience': '12 years'},
]

mock_appointments = [
    {'appointment_id': 1, 'patient_id': 1, 'doctor_id': 1, 'appointment_date': '2026-04-05 10:00', 'reason': 'Checkup', 'status': 'scheduled'},
    {'appointment_id': 2, 'patient_id': 2, 'doctor_id': 2, 'appointment_date': '2026-04-05 14:00', 'reason': 'Follow-up', 'status': 'completed'},
]

mock_medical_records = [
    {'record_id': 1, 'patient_id': 1, 'doctor_id': 1, 'diagnosis': 'Hypertension', 'symptoms': 'High blood pressure', 'treatment_plan': 'Medication and exercise', 'date_created': datetime.now().isoformat()},
    {'record_id': 2, 'patient_id': 2, 'doctor_id': 2, 'diagnosis': 'Common Cold', 'symptoms': 'Cough, fever', 'treatment_plan': 'Rest and fluids', 'date_created': datetime.now().isoformat()},
]

mock_prescriptions = [
    {'prescription_id': 1, 'patient_id': 1, 'doctor_id': 1, 'medication': 'Lisinopril', 'dosage': '10mg', 'frequency': 'Once daily', 'duration': '30 days', 'date_issued': datetime.now().isoformat()},
    {'prescription_id': 2, 'patient_id': 2, 'doctor_id': 2, 'medication': 'Paracetamol', 'dosage': '500mg', 'frequency': 'As needed', 'duration': '5 days', 'date_issued': datetime.now().isoformat()},
]

mock_billing = [
    {'billing_id': 1, 'patient_id': 1, 'amount': 5000, 'status': 'paid', 'description': 'Consultation Fee', 'date': datetime.now().isoformat()},
    {'billing_id': 2, 'patient_id': 2, 'amount': 3000, 'status': 'pending', 'description': 'Lab Tests', 'date': datetime.now().isoformat()},
]

mock_tasks = [
    {'task_id': 1, 'title': 'Follow-up with patient Ali Ahmed', 'status': 'Pending', 'assigned_to': 1, 'due_date': '2026-04-06'},
    {'task_id': 2, 'title': 'Review lab reports', 'status': 'In Progress', 'assigned_to': 1, 'due_date': '2026-04-05'},
]

mock_messages = []
PATIENT_DOB_SENTINEL = '2000-01-01'

# Auto-increment counters
next_appointment_id = 3
next_medical_record_id = 3
next_prescription_id = 3
next_billing_id = 3
next_task_id = 3
next_message_id = 3
_mysql_available = None
_mysql_log_printed = False

def get_db_connection():
    return pymysql.connect(
        host=DB_HOST,
        port=DB_PORT,
        user=DB_USER,
        password=DB_PASSWORD,
        database=DB_NAME,
        cursorclass=pymysql.cursors.DictCursor,
        autocommit=True
    )

def mysql_ready():
    global _mysql_available, _mysql_log_printed
    if _mysql_available is True:
        return True
    try:
        conn = get_db_connection()
        conn.close()
        _mysql_available = True
        if not _mysql_log_printed:
            print(f"MySQL Connected (host={DB_HOST}, db={DB_NAME}, user={DB_USER})")
            _mysql_log_printed = True
        return True
    except Exception:
        _mysql_available = False
        return False

def db_select(query, params=None):
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute(query, params or ())
            return cursor.fetchall()
    finally:
        conn.close()

def db_select_one(query, params=None):
    rows = db_select(query, params)
    return rows[0] if rows else None

def db_execute(query, params=None):
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute(query, params or ())
            return cursor.lastrowid, cursor.rowcount
    finally:
        conn.close()


def _mysql_column_exists(table_name, column_name):
    if not mysql_ready():
        return False
    row = db_select_one(
        """
        SELECT COUNT(*) AS c FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA=%s AND TABLE_NAME=%s AND COLUMN_NAME=%s
        """,
        (DB_NAME, table_name, column_name),
    )
    return int(row.get('c', 0) or 0) > 0


def _doctor_applications_add_bio_column():
    if not mysql_ready():
        return
    if _mysql_column_exists('doctor_applications', 'bio'):
        return
    try:
        db_execute("ALTER TABLE doctor_applications ADD COLUMN bio TEXT NULL")
    except Exception:
        pass


def ensure_doctors_profile_schema():
    """Add columns used for doctor first-login profile completion."""
    if not mysql_ready():
        return
    if not _mysql_column_exists('doctors', 'photo_data'):
        try:
            db_execute("ALTER TABLE doctors ADD COLUMN photo_data LONGTEXT NULL")
        except Exception:
            pass
    if not _mysql_column_exists('doctors', 'profile_onboarding_complete'):
        try:
            db_execute(
                "ALTER TABLE doctors ADD COLUMN profile_onboarding_complete TINYINT(1) NOT NULL DEFAULT 1"
            )
        except Exception:
            pass
    if not _mysql_column_exists('doctors', 'availability_days'):
        try:
            db_execute("ALTER TABLE doctors ADD COLUMN availability_days VARCHAR(160) NULL")
        except Exception:
            pass


def send_clinixpro_email(to_email, subject, body_text):
    """Send notification email when SMTP is configured."""
    if not to_email or not mail or not Message:
        return False
    try:
        msg = Message(subject=subject, recipients=[to_email], body=body_text)
        mail.send(msg)
        return True
    except Exception as exc:
        print(f"[ClinixPro] Email send failed: {exc}")
        return False


def ensure_support_tickets_table():
    """Create support ticket table when missing (MySQL mode)."""
    if not mysql_ready():
        return
    db_execute(
        """
        CREATE TABLE IF NOT EXISTS support_tickets (
            id INT PRIMARY KEY AUTO_INCREMENT,
            ticket_code VARCHAR(32) UNIQUE NOT NULL,
            name VARCHAR(120) NOT NULL,
            email VARCHAR(120) NOT NULL,
            phone VARCHAR(30),
            category VARCHAR(60) NOT NULL,
            subject VARCHAR(255) NOT NULL,
            message TEXT NOT NULL,
            status VARCHAR(32) NOT NULL DEFAULT 'open',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_email (email),
            INDEX idx_status (status),
            INDEX idx_created (created_at)
        )
        """
    )


def ensure_messages_table():
    """Create messages table when missing (MySQL mode)."""
    if not mysql_ready():
        return
    db_execute(
        """
        CREATE TABLE IF NOT EXISTS messages (
            message_id INT PRIMARY KEY AUTO_INCREMENT,
            from_user_id INT NOT NULL,
            from_user_type VARCHAR(20) NOT NULL,
            from_name VARCHAR(120),
            to_user_id INT NOT NULL,
            to_user_type VARCHAR(20),
            to_name VARCHAR(120),
            subject VARCHAR(255) NOT NULL,
            message TEXT NOT NULL,
            is_read TINYINT(1) DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_to_user (to_user_id),
            INDEX idx_from_user (from_user_id),
            INDEX idx_read (is_read)
        )
        """
    )


def _message_row_to_dict(row):
    """Normalize a messages-table row into the shape returned by the messaging API."""
    if not row:
        return None
    created = row.get('created_at')
    try:
        timestamp = created.isoformat() if hasattr(created, 'isoformat') else (str(created) if created else None)
    except Exception:
        timestamp = None
    return {
        'message_id': row.get('message_id'),
        'from_user_id': row.get('from_user_id'),
        'from_user_type': row.get('from_user_type'),
        'from_name': row.get('from_name'),
        'to_user_id': row.get('to_user_id'),
        'to_user_type': row.get('to_user_type'),
        'to_name': row.get('to_name'),
        'subject': row.get('subject'),
        'message': row.get('message'),
        'read': bool(row.get('is_read')),
        'timestamp': timestamp,
    }

def ensure_doctor_applications_table():
    """Create pending doctor application table when missing (MySQL mode)."""
    if not mysql_ready():
        return
    db_execute(
        """
        CREATE TABLE IF NOT EXISTS doctor_applications (
            application_id INT PRIMARY KEY AUTO_INCREMENT,
            first_name VARCHAR(80) NOT NULL,
            last_name VARCHAR(80) NOT NULL,
            email VARCHAR(120) NOT NULL,
            phone VARCHAR(30) NOT NULL,
            password_hash VARCHAR(255) NOT NULL,
            medical_license_number VARCHAR(80) NOT NULL,
            specialization VARCHAR(120) NOT NULL,
            clinic_name VARCHAR(150),
            experience_years INT DEFAULT 0,
            license_document_name VARCHAR(255),
            license_document_data LONGTEXT,
            city VARCHAR(80),
            status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
            rejection_reason TEXT,
            reviewed_by INT,
            reviewed_at TIMESTAMP NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uniq_doctor_app_email (email),
            UNIQUE KEY uniq_doctor_app_license (medical_license_number),
            INDEX idx_doctor_app_status (status),
            INDEX idx_doctor_app_created (created_at)
        )
        """
    )
    _doctor_applications_add_bio_column()


def ensure_patients_gender_schema():
    """Migrate the patients.gender column to ENUM('Male','Female','Other').

    The original schema shipped with ENUM('M','F','Other') which rejected the
    full-word values sent by the redesigned profile editor ('Male'/'Female').
    This helper:
      1) backfills any legacy 'M'/'F' rows to 'Male'/'Female'
      2) widens the ENUM to accept both legacy AND full-word values, then
         normalizes the column so future writes only use full-word values

    Safe to run on every startup — each step is idempotent.
    """
    if not mysql_ready():
        return
    try:
        # 1) Expand the ENUM to a superset so both legacy and new values
        # are valid during the transition. NULL becomes the default so
        # "unset" is representable.
        db_execute(
            "ALTER TABLE patients MODIFY COLUMN gender "
            "ENUM('M','F','Male','Female','Other') DEFAULT NULL"
        )
    except Exception:
        # Older MySQL servers / locked tables — ignore; the column likely
        # already accepts the new values.
        pass
    try:
        # 2) Backfill legacy single-letter rows to the new vocabulary.
        db_execute("UPDATE patients SET gender='Male'   WHERE gender='M'")
        db_execute("UPDATE patients SET gender='Female' WHERE gender='F'")
    except Exception:
        pass
    try:
        # 3) Final shape — drop the legacy values now that no rows use them.
        db_execute(
            "ALTER TABLE patients MODIFY COLUMN gender "
            "ENUM('Male','Female','Other') DEFAULT NULL"
        )
    except Exception:
        pass


def ensure_password_reset_table():
    """Create password reset code table when missing (MySQL mode)."""
    if not mysql_ready():
        return
    db_execute(
        """
        CREATE TABLE IF NOT EXISTS password_reset_codes (
            id INT PRIMARY KEY AUTO_INCREMENT,
            email VARCHAR(120) NOT NULL,
            code_hash VARCHAR(255) NOT NULL,
            expires_at DATETIME NOT NULL,
            used TINYINT(1) NOT NULL DEFAULT 0,
            attempts INT NOT NULL DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_pwd_reset_email (email),
            INDEX idx_pwd_reset_expires (expires_at)
        )
        """
    )


def ensure_pending_registrations_table():
    """Create pending registration table for email-verified signups."""
    if not mysql_ready():
        return
    db_execute(
        """
        CREATE TABLE IF NOT EXISTS pending_registrations (
            id INT PRIMARY KEY AUTO_INCREMENT,
            email VARCHAR(120) NOT NULL UNIQUE,
            phone VARCHAR(30),
            user_type VARCHAR(20) NOT NULL,
            payload JSON NOT NULL,
            code_hash VARCHAR(255) NOT NULL,
            expires_at DATETIME NOT NULL,
            attempts INT NOT NULL DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_pending_phone (phone),
            INDEX idx_pending_expires (expires_at)
        )
        """
    )


def ensure_patient_uploaded_records_table():
    """Create the table that stores patient-uploaded historical records
    (lab reports, prescriptions, x-rays, discharge summaries, etc.).

    Files are stored as base64-encoded data URIs in a LONGTEXT column,
    consistent with how doctor application license documents are stored.
    """
    if not mysql_ready():
        return
    db_execute(
        """
        CREATE TABLE IF NOT EXISTS patient_uploaded_records (
            id INT PRIMARY KEY AUTO_INCREMENT,
            patient_id INT NOT NULL,
            title VARCHAR(200) NOT NULL,
            description TEXT,
            record_date DATE,
            category VARCHAR(60) NOT NULL DEFAULT 'other',
            file_name VARCHAR(255),
            file_type VARCHAR(120),
            file_size INT,
            file_data LONGTEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_pur_patient (patient_id),
            INDEX idx_pur_date (record_date),
            INDEX idx_pur_category (category)
        )
        """
    )


def verify_password(stored_password, provided_password):
    """Support hashed passwords and legacy plain-text values."""
    stored = str(stored_password or "")
    provided = str(provided_password or "")
    try:
        if stored and check_password_hash(stored, provided):
            return True
    except Exception:
        pass
    return stored == provided

def ensure_demo_users_in_db():
    """Ensure the admin login exists. Doctor/patient demo accounts are seeded
    by `reset_demo_accounts.py` and should not be auto-recreated here so
    operators can wipe and reseed without the backend reverting passwords."""
    if not mysql_ready():
        return
    demo_accounts = [
        ('admin@clinixpro.com', 'Admin@123', 'admin'),
    ]
    for email, plain_pw, user_type in demo_accounts:
        existing = db_select_one("SELECT user_id FROM users WHERE email=%s", (email,))
        if existing:
            db_execute(
                "UPDATE users SET user_type=%s, status='active' WHERE email=%s",
                (user_type, email)
            )
            continue
        db_execute(
            "INSERT INTO users (email, password, user_type, status) VALUES (%s, %s, %s, 'active')",
            (email, generate_password_hash(plain_pw), user_type)
        )

def get_chat_system_prompt(user_type):
    role = str(user_type or "").strip().lower()
    # IMPORTANT: Every prompt MUST state the assistant's name is "Clio".
    # Avoid the word "navigation" in the persona line — earlier prompts used
    # "navigation assistant" and the LLM hallucinated the name "Nav" from it.
    identity = (
        "Your name is Clio. You are the official AI health assistant for "
        "ClinixPro, a smart clinical management system. If anyone asks who "
        "you are, what your name is, or to introduce yourself, ALWAYS reply "
        "that you are Clio, the ClinixPro AI assistant. Never call yourself "
        "Nav, Navi, or any other name."
    )
    if role == "visitor":
        return (
            identity + " "
            "Help visitors understand what ClinixPro does, how to log in, how "
            "to register, and what features are available for patients and "
            "doctors. Keep responses short, warm, and action-oriented."
        )
    if role == "doctor":
        return (
            identity + " "
            "You are supporting a doctor. Help with clinical information, "
            "drug interactions, treatment guidelines, and medical references. "
            "Always remind the user to verify with current guidelines and "
            "their professional judgment for clinical decisions."
        )
    if role == "admin":
        return (
            identity + " "
            "You are supporting a clinic administrator. Help with user "
            "management, scheduling, billing flow, support tickets, and "
            "clinic operations. Be concise and operationally focused."
        )
    return (
        identity + " "
        "You are supporting a patient. Help them understand symptoms, "
        "medications, and when to see a doctor. Always recommend consulting "
        "a doctor for serious or persistent concerns; you are informational "
        "only and not a diagnostic tool."
    )

def enrich_appointment(appointment):
    """Attach doctor/patient names for UI consumption."""
    doctor_name = next((d.get('name') for d in mock_doctors if int(d.get('doctor_id', -1)) == int(appointment.get('doctor_id', -1))), None)
    patient_name = next((p.get('name') for p in mock_patients if int(p.get('patient_id', -1)) == int(appointment.get('patient_id', -1))), None)
    output = dict(appointment)
    output['doctor_name'] = doctor_name
    output['patient_name'] = patient_name
    return output

# ==================== AUTHENTICATION DECORATOR ====================
# Endpoints a doctor with profile_onboarding_complete=0 is still allowed to hit.
# Everything else returns 403 until the profile is completed.
DOCTOR_ONBOARDING_ALLOWED_PATHS = {
    '/api/auth/me',
    '/api/doctor/profile-onboarding',
    '/api/doctors/profile/complete',
}

def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.headers.get('Authorization')
        
        if not token:
            return jsonify({'error': 'Token is missing'}), 401
        
        try:
            if not token.startswith('Bearer '):
                return jsonify({'error': 'Invalid authorization format'}), 401
            token = token.split(' ')[1]
            data = jwt.decode(token, app.config['JWT_SECRET_KEY'], algorithms=['HS256'])
            current_user_id = data['user_id']
            current_user_type = data['user_type']
        except (jwt.ExpiredSignatureError, jwt.InvalidTokenError, KeyError) as e:
            print(f"[AUTH] token_required rejected token: {type(e).__name__}: {e}")
            return jsonify({'error': 'Invalid token'}), 401

        # Doctors must finish onboarding before they can use the rest of the API.
        if current_user_type == 'doctor' and request.path not in DOCTOR_ONBOARDING_ALLOWED_PATHS:
            if mysql_ready():
                try:
                    row = db_select_one(
                        "SELECT COALESCE(profile_onboarding_complete, 1) AS complete FROM doctors WHERE doctor_id=%s",
                        (current_user_id,)
                    )
                    if row is not None and int(row.get('complete') or 0) == 0:
                        return jsonify({'error': 'Please complete your profile first.'}), 403
                except Exception as onboarding_err:
                    print(f"[AUTH] onboarding check failed: {onboarding_err}")

        return f(current_user_id, current_user_type, *args, **kwargs)
    
    return decorated

# ==================== ROUTES ====================

# ==================== FRONTEND SERVING ====================
@app.route('/', methods=['GET'])
def serve_frontend_index():
    """Serve frontend entry page so root URL loads app."""
    return send_from_directory(FRONTEND_DIR, 'index.html')

@app.route('/favicon.ico', methods=['GET'])
def serve_favicon():
    """Serve favicon if present, otherwise no-content."""
    favicon_path = os.path.join(FRONTEND_DIR, 'favicon.ico')
    if os.path.isfile(favicon_path):
        return send_from_directory(FRONTEND_DIR, 'favicon.ico')
    return ('', 204)

@app.route('/images/<path:filepath>', methods=['GET'])
def serve_images(filepath):
    """Serve image files from images directory."""
    return send_from_directory(os.path.join(FRONTEND_DIR, 'images'), filepath)

@app.route('/<path:filename>', methods=['GET'])
def serve_frontend_asset(filename):
    if str(filename).startswith('api/'):
        return jsonify({'error': 'Endpoint not found'}), 404
    """
    Serve frontend files (html/css/js/images) from frontend directory.
    API routes are explicitly defined above and won't be affected.
    """
    file_path = os.path.join(FRONTEND_DIR, filename)
    if os.path.isfile(file_path):
        return send_from_directory(FRONTEND_DIR, filename)
    return jsonify({'error': 'File not found'}), 404

# ==================== HEALTH CHECK ====================
@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'message': 'Smart Clinical Management System API is running',
        'database': 'mysql' if mysql_ready() else 'fallback'
    }), 200

@app.route('/api/system/db-status', methods=['GET'])
def db_status():
    """Database connectivity/status for runtime diagnostics."""
    connected = mysql_ready()
    response = {
        'database_mode': 'mysql' if connected else 'fallback',
        'mysql_connected': connected,
        'host': DB_HOST,
        'port': DB_PORT,
        'database': DB_NAME
    }
    if not connected:
        response['message'] = 'MySQL is not reachable. Backend is using in-memory fallback data.'
    else:
        response['message'] = 'MySQL connected. Backend is using persistent database storage.'
    return jsonify(response), 200

@app.route('/api/chat', methods=['POST'])
def ai_chat():
    """Role-aware AI chat endpoint using Groq."""
    try:
        data = request.get_json() or {}
        message = str(data.get('message', '')).strip()
        user_type = str(data.get('user_type', 'patient')).strip().lower()
        user_id = data.get('user_id')
        history = data.get('history') or []

        if not message:
            return jsonify({'error': 'Message is required'}), 400

        if not GROQ_API_KEY:
            return jsonify({'error': 'GROQ_API_KEY is not configured on backend'}), 503

        if Groq is None:
            detail = GROQ_IMPORT_ERROR or "groq import failed"
            return jsonify({'error': f'Groq package is not available: {detail}'}), 503

        system_prompt = get_chat_system_prompt(user_type)

        # Build the prompt with the most recent conversation context.
        messages = [{"role": "system", "content": system_prompt}]
        if isinstance(history, list):
            for msg in history[-10:]:  # Last 10 messages max to stay within token limits
                if not isinstance(msg, dict):
                    continue
                role = str(msg.get('role') or '').strip().lower()
                content = str(msg.get('content') or '').strip()
                if role not in ('user', 'assistant') or not content:
                    continue
                messages.append({"role": role, "content": content})
        messages.append({"role": "user", "content": message})

        client = Groq(api_key=GROQ_API_KEY)
        completion = client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=messages,
            max_tokens=500
        )
        response_text = str(getattr(completion.choices[0].message, "content", "") or "").strip()
        if not response_text:
            response_text = "I am sorry, I could not generate a response right now."

        return jsonify({'response': response_text}), 200
    except Exception as e:
        return jsonify({'error': f'AI service unavailable: {str(e)}'}), 502

def _generate_verification_code():
    return f"{secrets.randbelow(1000000):06d}"


def _send_verification_email(to_email, full_name, code):
    subject = "Verify your ClinixPro account"
    body = (
        f"Hello {full_name},\n\n"
        f"Welcome to ClinixPro! Please use the verification code below to "
        f"finish creating your account.\n\n"
        f"Your verification code is: {code}\n\n"
        f"This code expires in 15 minutes. If you didn't try to register, "
        f"you can safely ignore this email.\n\n"
        f"— The ClinixPro Team"
    )
    return send_clinixpro_email(to_email, subject, body)


# ==================== AUTHENTICATION ====================
@app.route('/api/auth/register', methods=['POST'])
def register():
    """Start a new patient registration. Stores the data in
    `pending_registrations` and emails a 6-digit verification code. The user
    must call /api/auth/verify-registration with that code before the account
    is created. Doctor signups still go through the existing application/
    admin-approval flow."""
    try:
        data = request.get_json() or {}

        required_fields = ['first_name', 'last_name', 'email', 'phone', 'password', 'user_type']
        if not all(field in data for field in required_fields):
            return jsonify({'error': 'Missing required fields'}), 400

        email = str(data.get('email', '')).strip().lower()
        phone = str(data.get('phone', '')).strip()
        password = str(data.get('password', ''))
        user_type = str(data.get('user_type', '')).strip().lower()
        if user_type not in ('patient', 'doctor'):
            return jsonify({'error': 'Invalid user type. Must be patient or doctor.'}), 400
        if user_type == 'doctor':
            return jsonify({'error': 'Doctor registration requires verification. Please complete step 2.'}), 400
        if len(password) < 6:
            return jsonify({'error': 'Password must be at least 6 characters.'}), 400
        if not any(c.isupper() for c in password):
            return jsonify({'error': 'Password must contain at least one uppercase letter.'}), 400
        if not any(c.isdigit() for c in password):
            return jsonify({'error': 'Password must contain at least one number.'}), 400

        if mysql_ready():
            ensure_pending_registrations_table()

            existing = db_select_one("SELECT user_id FROM users WHERE LOWER(email)=%s", (email,))
            if existing:
                return jsonify({'error': 'This email is already registered. Please login.'}), 400
            existing_phone = db_select_one("SELECT patient_id FROM patients WHERE phone=%s", (phone,))
            if existing_phone:
                return jsonify({'error': 'This phone number is already registered.'}), 400
            other_pending_phone = db_select_one(
                "SELECT id FROM pending_registrations WHERE phone=%s AND LOWER(email)<>%s",
                (phone, email)
            )
            if other_pending_phone:
                return jsonify({'error': 'This phone number is already pending verification on another account.'}), 400

            full_name = f"{data['first_name']} {data['last_name']}".strip()
            gender_map = {'male': 'M', 'female': 'F', 'other': 'Other'}
            gender = gender_map.get(str(data.get('gender', 'other')).lower(), 'Other')
            payload = {
                'first_name': data['first_name'],
                'last_name': data['last_name'],
                'full_name': full_name,
                'email': email,
                'phone': phone,
                'password_hash': generate_password_hash(password),
                'gender': gender,
                'dob': data.get('dob', '2000-01-01'),
                'blood_type': data.get('blood_type', 'N/A'),
                'address': data.get('address'),
                'emergency_contact': data.get('emergency_contact'),
            }

            code = _generate_verification_code()
            code_hash = generate_password_hash(code)
            expires_at = datetime.utcnow() + timedelta(minutes=15)

            db_execute(
                """
                INSERT INTO pending_registrations (email, phone, user_type, payload, code_hash, expires_at, attempts)
                VALUES (%s, %s, %s, %s, %s, %s, 0)
                ON DUPLICATE KEY UPDATE
                    phone=VALUES(phone),
                    user_type=VALUES(user_type),
                    payload=VALUES(payload),
                    code_hash=VALUES(code_hash),
                    expires_at=VALUES(expires_at),
                    attempts=0,
                    created_at=CURRENT_TIMESTAMP
                """,
                (email, phone, user_type, json.dumps(payload), code_hash, expires_at)
            )

            sent = _send_verification_email(email, full_name, code)

            response = {
                'pending': True,
                'email': email,
                'message': "We've sent a 6-digit verification code to your email. Enter it to finish creating your account."
            }
            if not sent and not (app.config.get('MAIL_USERNAME') and app.config.get('MAIL_PASSWORD')):
                print(f"[DEV] Verification code for {email}: {code}")
            return jsonify(response), 200
        
        # Check if user already exists
        if data['email'] in mock_users:
            return jsonify({'error': 'Email already registered'}), 400
        
        # Hash password
        hashed_password = generate_password_hash(data['password'])
        
        # Create new user
        new_user_id = max([u['user_id'] for u in mock_users.values()], default=0) + 1
        mock_users[data['email']] = {
            'user_id': new_user_id,
            'password': hashed_password,
            'user_type': data['user_type'],
            'name': f"{data['first_name']} {data['last_name']}"
        }
        
        # If doctor, add to doctors list
        if data['user_type'] == 'doctor':
            mock_doctors.append({
                'doctor_id': new_user_id,
                'name': f"{data['first_name']} {data['last_name']}",
                'email': data['email'],
                'phone': data['phone'],
                'specialty': 'General',
                'experience': '0 years'
            })
        # If patient, add to patients list
        elif data['user_type'] == 'patient':
            mock_patients.append({
                'patient_id': new_user_id,
                'name': f"{data['first_name']} {data['last_name']}",
                'email': data['email'],
                'phone': data['phone'],
                'dob': data.get('dob', '2000-01-01'),
                'gender': data.get('gender', 'Other'),
                'blood_type': data.get('blood_type', 'Unknown')
            })
        
        return jsonify({'message': 'User registered successfully', 'user_id': new_user_id}), 201
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/auth/verify-registration', methods=['POST'])
def verify_registration():
    """Confirm a pending registration with the emailed code. On success the
    real users + patients rows are created and a welcome email is sent."""
    try:
        data = request.get_json(silent=True) or {}
        email = str(data.get('email') or '').strip().lower()
        code = str(data.get('code') or '').strip()

        if not email or not code:
            return jsonify({'error': 'Email and verification code are required.'}), 400

        if not mysql_ready():
            return jsonify({'error': 'Registration verification is unavailable in demo mode.'}), 503

        ensure_pending_registrations_table()

        record = db_select_one(
            "SELECT id, email, phone, user_type, payload, code_hash, expires_at, attempts "
            "FROM pending_registrations WHERE LOWER(email)=%s",
            (email,)
        )
        if not record:
            return jsonify({'error': 'No pending registration found. Please sign up again.'}), 400

        if record.get('attempts', 0) >= 5:
            db_execute("DELETE FROM pending_registrations WHERE id=%s", (record['id'],))
            return jsonify({'error': 'Too many incorrect attempts. Please sign up again.'}), 429

        expires_at = record.get('expires_at')
        if isinstance(expires_at, str):
            try:
                expires_at = datetime.strptime(expires_at, '%Y-%m-%d %H:%M:%S')
            except Exception:
                expires_at = None
        if not expires_at or expires_at < datetime.utcnow():
            db_execute("DELETE FROM pending_registrations WHERE id=%s", (record['id'],))
            return jsonify({'error': 'Verification code expired. Please sign up again.'}), 400

        if not check_password_hash(record['code_hash'], code):
            db_execute(
                "UPDATE pending_registrations SET attempts=attempts+1 WHERE id=%s",
                (record['id'],)
            )
            return jsonify({'error': 'Invalid verification code.'}), 400

        try:
            payload = json.loads(record['payload']) if isinstance(record['payload'], str) else (record['payload'] or {})
        except Exception:
            payload = {}

        user_type = record.get('user_type', 'patient')
        full_name = payload.get('full_name') or f"{payload.get('first_name', '')} {payload.get('last_name', '')}".strip()
        password_hash = payload.get('password_hash')
        if not password_hash:
            db_execute("DELETE FROM pending_registrations WHERE id=%s", (record['id'],))
            return jsonify({'error': 'Registration data missing. Please sign up again.'}), 400

        existing_user = db_select_one("SELECT user_id FROM users WHERE LOWER(email)=%s", (email,))
        if existing_user:
            db_execute("DELETE FROM pending_registrations WHERE id=%s", (record['id'],))
            return jsonify({'error': 'This email is already registered. Please login.'}), 400

        new_user_id, _ = db_execute(
            "INSERT INTO users (email, password, user_type, status) VALUES (%s, %s, %s, 'active')",
            (email, password_hash, user_type)
        )

        if user_type == 'patient':
            db_execute(
                """
                INSERT INTO patients
                (name, email, phone, dob, gender, blood_group, address, emergency_contact_phone, status)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 'active')
                """,
                (
                    full_name,
                    email,
                    payload.get('phone') or record.get('phone'),
                    payload.get('dob', '2000-01-01'),
                    payload.get('gender', 'Other'),
                    payload.get('blood_type', 'N/A'),
                    payload.get('address'),
                    payload.get('emergency_contact'),
                )
            )

        db_execute("DELETE FROM pending_registrations WHERE id=%s", (record['id'],))

        try:
            send_clinixpro_email(
                email,
                "Welcome to ClinixPro!",
                f"Hi {full_name},\n\n"
                f"Your ClinixPro account is now active — welcome aboard!\n\n"
                f"You can sign in any time at the login page using your "
                f"email and the password you chose.\n\n"
                f"Wishing you good health,\n"
                f"— The ClinixPro Team"
            )
        except Exception:
            pass

        return jsonify({
            'message': 'Account verified. Welcome to ClinixPro!',
            'user_id': new_user_id,
            'name': full_name,
            'email': email,
            'user_type': user_type,
        }), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/auth/resend-verification', methods=['POST'])
def resend_registration_code():
    """Issue a new verification code for an existing pending registration."""
    try:
        data = request.get_json(silent=True) or {}
        email = str(data.get('email') or '').strip().lower()
        if not email:
            return jsonify({'error': 'Email is required.'}), 400

        if not mysql_ready():
            return jsonify({'error': 'Registration verification is unavailable in demo mode.'}), 503

        ensure_pending_registrations_table()

        record = db_select_one(
            "SELECT id, payload FROM pending_registrations WHERE LOWER(email)=%s",
            (email,)
        )
        if not record:
            return jsonify({'error': 'No pending registration found for that email.'}), 400

        try:
            payload = json.loads(record['payload']) if isinstance(record['payload'], str) else (record['payload'] or {})
        except Exception:
            payload = {}

        full_name = payload.get('full_name') or 'there'
        code = _generate_verification_code()
        code_hash = generate_password_hash(code)
        expires_at = datetime.utcnow() + timedelta(minutes=15)

        db_execute(
            "UPDATE pending_registrations SET code_hash=%s, expires_at=%s, attempts=0 WHERE id=%s",
            (code_hash, expires_at, record['id'])
        )

        sent = _send_verification_email(email, full_name, code)

        response = {'message': "A new verification code has been sent to your email."}
        if not sent and not (app.config.get('MAIL_USERNAME') and app.config.get('MAIL_PASSWORD')):
            print(f"[DEV] Verification code for {email}: {code}")
        return jsonify(response), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/auth/register-doctor', methods=['POST'])
def register_doctor_verification():
    """Create pending doctor verification application."""
    try:
        data = request.get_json() or {}
        required_fields = [
            'first_name', 'last_name', 'email', 'phone', 'password',
            'medical_license_number', 'specialization', 'clinic_name',
            'experience_years', 'city', 'bio'
        ]
        if not all(str(data.get(field, '')).strip() for field in required_fields):
            return jsonify({'error': 'Missing required fields for doctor verification.'}), 400

        if not mysql_ready():
            return jsonify({'error': 'Doctor verification requires MySQL mode.'}), 503

        ensure_doctor_applications_table()
        ensure_doctors_profile_schema()

        email = str(data.get('email')).strip().lower()
        phone = str(data.get('phone')).strip()
        license_no = str(data.get('medical_license_number')).strip()

        if db_select_one("SELECT user_id FROM users WHERE email=%s", (email,)):
            return jsonify({'error': 'This email is already registered. Please login.'}), 400
        if db_select_one("SELECT patient_id FROM patients WHERE phone=%s", (phone,)):
            return jsonify({'error': 'This phone number is already registered.'}), 400
        if db_select_one("SELECT doctor_id FROM doctors WHERE email=%s", (email,)):
            return jsonify({'error': 'This email is already registered. Please login.'}), 400
        if db_select_one("SELECT doctor_id FROM doctors WHERE license_number=%s", (license_no,)):
            return jsonify({'error': 'This medical license number is already registered.'}), 400

        existing_app = db_select_one(
            "SELECT application_id, status FROM doctor_applications WHERE email=%s OR medical_license_number=%s",
            (email, license_no)
        )
        if existing_app:
            existing_status = existing_app.get('status')
            if existing_status == 'pending':
                return jsonify({'error': 'Your application is already under review.'}), 400
            if existing_status == 'rejected':
                # Allow re-application after rejection: clear the old record so
                # the INSERT below can proceed.
                db_execute(
                    "DELETE FROM doctor_applications WHERE application_id=%s",
                    (existing_app.get('application_id'),)
                )
            elif existing_status == 'approved':
                return jsonify({'error': 'This doctor is already registered. Please login.'}), 400
            else:
                return jsonify({'error': 'A verification record already exists for this doctor.'}), 400

        password_hash = generate_password_hash(str(data.get('password')))
        experience_years = int(data.get('experience_years') or 0)
        bio_text = str(data.get('bio')).strip()
        if len(bio_text) < 20:
            return jsonify({'error': 'Short bio must be at least 20 characters.'}), 400
        has_bio_col = _mysql_column_exists('doctor_applications', 'bio')
        if has_bio_col:
            app_id, _ = db_execute(
                """
                INSERT INTO doctor_applications
                (first_name, last_name, email, phone, password_hash, medical_license_number, specialization,
                 clinic_name, experience_years, license_document_name, license_document_data, city, bio, status)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'pending')
                """,
                (
                    str(data.get('first_name')).strip(),
                    str(data.get('last_name')).strip(),
                    email,
                    phone,
                    password_hash,
                    license_no,
                    str(data.get('specialization')).strip(),
                    str(data.get('clinic_name')).strip(),
                    experience_years,
                    str(data.get('license_document_name') or '').strip() or None,
                    str(data.get('license_document_data') or '').strip() or None,
                    str(data.get('city')).strip(),
                    bio_text
                )
            )
        else:
            app_id, _ = db_execute(
                """
                INSERT INTO doctor_applications
                (first_name, last_name, email, phone, password_hash, medical_license_number, specialization,
                 clinic_name, experience_years, license_document_name, license_document_data, city, status)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'pending')
                """,
                (
                    str(data.get('first_name')).strip(),
                    str(data.get('last_name')).strip(),
                    email,
                    phone,
                    password_hash,
                    license_no,
                    str(data.get('specialization')).strip(),
                    str(data.get('clinic_name')).strip(),
                    experience_years,
                    str(data.get('license_document_name') or '').strip() or None,
                    str(data.get('license_document_data') or '').strip() or None,
                    str(data.get('city')).strip()
                )
            )
        admin_email = app.config.get('MAIL_USERNAME')
        if admin_email:
            send_clinixpro_email(
                admin_email,
                "New Doctor Application — ClinixPro",
                f"A new doctor has applied for verification.\n\n"
                f"Name: {data.get('first_name')} {data.get('last_name')}\n"
                f"Email: {email}\n"
                f"Specialization: {data.get('specialization')}\n"
                f"License No: {license_no}\n"
                f"City: {data.get('city')}\n\n"
                f"Login to admin panel to review and approve or reject.\n\n"
                f"— ClinixPro System"
            )
        return jsonify({
            'message': 'Application submitted! We will review within 24 hours.',
            'application_id': app_id,
            'status': 'pending'
        }), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/auth/login', methods=['POST'])
def login():
    """Login user"""
    try:
        data = request.get_json()
        
        if not data.get('email') or not data.get('password'):
            return jsonify({'error': 'Missing email or password'}), 400
        
        email = data.get('email')
        password = data.get('password')

        if mysql_ready():
            ensure_doctor_applications_table()
            ensure_doctors_profile_schema()
            ensure_demo_users_in_db()
            user = db_select_one("SELECT user_id, email, password, user_type, status FROM users WHERE email=%s", (email,))
            if not user:
                pending_application = db_select_one(
                    "SELECT application_id FROM doctor_applications WHERE email=%s AND status='pending'",
                    (email,)
                )
                if pending_application:
                    return jsonify({'error': 'Your application is under review. You will be notified once verified.'}), 403
                return jsonify({'error': 'Invalid credentials'}), 401
            if user.get('user_type') == 'doctor':
                user_status_row = db_select_one("SELECT status FROM users WHERE user_id=%s", (user['user_id'],)) or {}
                user_status = str(user_status_row.get('status', '')).lower()
                if user_status != 'active':
                    return jsonify({'error': 'Your doctor account is not active yet.'}), 403
            if not verify_password(user.get('password'), password):
                return jsonify({'error': 'Invalid credentials'}), 401
            # Upgrade legacy plain-text password storage to hashed value on successful login.
            if str(user.get('password') or "") == str(password):
                db_execute(
                    "UPDATE users SET password=%s WHERE user_id=%s",
                    (generate_password_hash(password), user['user_id'])
                )
            if str(user.get('status') or '').lower() == 'inactive':
                return jsonify({'error': 'Your account has been deactivated. Please contact the administrator.'}), 403

            effective_user_id = user['user_id']
            name = email
            if user['user_type'] == 'doctor':
                d = db_select_one("SELECT doctor_id, name FROM doctors WHERE email=%s", (email,))
                if d and d.get('name'):
                    name = d['name']
                    effective_user_id = d.get('doctor_id', effective_user_id)
            elif user['user_type'] == 'patient':
                p = db_select_one("SELECT patient_id, name FROM patients WHERE email=%s", (email,))
                if p and p.get('name'):
                    name = p['name']
                    effective_user_id = p.get('patient_id', effective_user_id)
            elif user['user_type'] == 'admin':
                s = db_select_one("SELECT staff_id, name FROM staff WHERE email=%s AND role='admin'", (email,))
                if s and s.get('name'):
                    name = s['name']
                    effective_user_id = s.get('staff_id', effective_user_id)

            token = jwt.encode({
                'user_id': effective_user_id,
                'user_type': user['user_type'],
                'exp': datetime.utcnow() + timedelta(hours=24)
            }, app.config['JWT_SECRET_KEY'], algorithm='HS256')
            response_body = {
                'token': token,
                'user_id': effective_user_id,
                'user_type': user['user_type'],
                'name': name,
                'message': 'Login successful'
            }
            if user['user_type'] == 'doctor':
                doc_flags = db_select_one(
                    """
                    SELECT COALESCE(profile_onboarding_complete, 1) AS complete
                    FROM doctors WHERE doctor_id=%s
                    """,
                    (effective_user_id,)
                ) or {}
                response_body['doctor_profile_complete'] = int(doc_flags.get('complete', 1) or 1) == 1
            return jsonify(response_body), 200
        
        # Check mock users
        if email not in mock_users:
            return jsonify({'error': 'Invalid credentials'}), 401
        
        user = mock_users[email]
        if not check_password_hash(user['password'], password):
            return jsonify({'error': 'Invalid credentials'}), 401
        
        # Generate JWT token
        token = jwt.encode({
            'user_id': user['user_id'],
            'user_type': user['user_type'],
            'exp': datetime.utcnow() + timedelta(hours=24)
        }, app.config['JWT_SECRET_KEY'], algorithm='HS256')
        
        body = {
            'token': token,
            'user_id': user['user_id'],
            'user_type': user['user_type'],
            'name': user['name'],
            'message': 'Login successful'
        }
        if user['user_type'] == 'doctor':
            body['doctor_profile_complete'] = True
        return jsonify(body), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/auth/me', methods=['GET'])
@token_required
def auth_me(current_user_id, current_user_type):
    """Validate token and return current user info."""
    try:
        if mysql_ready():
            user = db_select_one("SELECT user_id, email, user_type FROM users WHERE user_id=%s", (current_user_id,))
            payload = {
                'user_id': current_user_id,
                'user_type': current_user_type,
                'name': None
            }
            if current_user_type == 'doctor':
                ensure_doctors_profile_schema()
                doctor = db_select_one(
                    """
                    SELECT doctor_id, name, email, phone, specialization, license_number, department,
                           consultation_fee, experience_years, bio, office_hours_start, office_hours_end,
                           availability_days, is_available, status,
                           COALESCE(profile_onboarding_complete, 1) AS profile_onboarding_complete
                    FROM doctors WHERE doctor_id=%s
                    """,
                    (current_user_id,),
                )
                if doctor:
                    payload['name'] = doctor.get('name')
                    payload['profile'] = doctor
                    payload['doctor_profile_complete'] = int(doctor.get('profile_onboarding_complete', 1) or 1) == 1
                elif user:
                    payload['name'] = user.get('email')
            elif current_user_type == 'patient':
                # Joined query: token user_id maps to users; patient profile linked by email or patient_id.
                row = db_select_one(
                    """
                    SELECT u.user_id, u.email AS user_email, u.user_type,
                           p.patient_id, p.name, p.email AS patient_email, p.phone, p.blood_group,
                           p.dob, p.address, p.emergency_contact_phone, p.gender
                    FROM users u
                    LEFT JOIN patients p
                        ON p.email = u.email OR p.patient_id = u.user_id
                    WHERE u.user_id = %s
                    """,
                    (current_user_id,)
                )
                if not row:
                    # Fallback: token id may directly equal patient_id with no users row.
                    direct_patient = db_select_one(
                        """
                        SELECT patient_id, name, email, phone, blood_group, dob, address,
                               emergency_contact_phone, gender
                        FROM patients
                        WHERE patient_id=%s
                        """,
                        (current_user_id,)
                    )
                    if direct_patient:
                        payload['name'] = direct_patient.get('name')
                        payload['profile'] = {
                            'patient_id': direct_patient.get('patient_id'),
                            'name': direct_patient.get('name'),
                            'email': direct_patient.get('email'),
                            'phone': direct_patient.get('phone'),
                            'blood_group': direct_patient.get('blood_group'),
                            'dob': str(direct_patient['dob'])[:10] if direct_patient.get('dob') else None,
                            'address': direct_patient.get('address'),
                            'emergency_contact_phone': direct_patient.get('emergency_contact_phone'),
                            'gender': direct_patient.get('gender')
                        }
                else:
                    payload['name'] = row.get('name')
                    payload['profile'] = {
                        'patient_id': row.get('patient_id'),
                        'name': row.get('name'),
                        'email': row.get('patient_email') or row.get('user_email'),
                        'phone': row.get('phone'),
                        'blood_group': row.get('blood_group'),
                        'dob': str(row['dob'])[:10] if row.get('dob') else None,
                        'address': row.get('address'),
                        'emergency_contact_phone': row.get('emergency_contact_phone'),
                        'gender': row.get('gender')
                    }
            elif current_user_type == 'admin':
                staff = db_select_one("SELECT * FROM staff WHERE email=%s", ((user or {}).get('email'),))
                payload['name'] = (staff or {}).get('name') or (user or {}).get('email')
                if staff:
                    payload['profile'] = staff
            return jsonify(payload), 200

        user = None
        for _email, user_info in mock_users.items():
            if int(user_info.get('user_id', -1)) == int(current_user_id):
                user = user_info
                break

        payload = {
            'user_id': current_user_id,
            'user_type': current_user_type,
            'name': user.get('name') if user else None
        }

        if current_user_type == 'doctor':
            doctor = next((d for d in mock_doctors if int(d.get('doctor_id', -1)) == int(current_user_id)), None)
            if doctor:
                payload['profile'] = doctor
        elif current_user_type == 'patient':
            patient = next((p for p in mock_patients if int(p.get('patient_id', -1)) == int(current_user_id)), None)
            if patient:
                payload['profile'] = patient

        return jsonify(payload), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/auth/forgot-password', methods=['POST'])
def forgot_password():
    """Send a 6-digit verification code to the user's email so they can reset
    their password. Always returns the same success message regardless of
    whether the email exists, to avoid leaking account existence."""
    try:
        data = request.get_json(silent=True) or {}
        email = str(data.get('email') or '').strip().lower()

        if not email:
            return jsonify({'error': 'Email is required'}), 400

        generic_response = {
            'message': "If an account exists for that email, we've sent a 6-digit verification code. It will expire in 15 minutes."
        }

        ensure_password_reset_table()

        user = None
        if mysql_ready():
            user = db_select_one(
                "SELECT user_id, email FROM users WHERE LOWER(email)=%s",
                (email,)
            )
        else:
            # mock_users is a dict keyed by email, not a list.
            for email_key, user_info in mock_users.items():
                if str(email_key).strip().lower() == email:
                    user = {'user_id': user_info.get('user_id'), 'email': email_key}
                    break

        if not user:
            return jsonify(generic_response), 200

        code = f"{secrets.randbelow(1000000):06d}"
        code_hash = generate_password_hash(code)
        expires_at = datetime.utcnow() + timedelta(minutes=15)

        if mysql_ready():
            db_execute(
                "UPDATE password_reset_codes SET used=1 WHERE email=%s AND used=0",
                (email,)
            )
            db_execute(
                "INSERT INTO password_reset_codes (email, code_hash, expires_at) VALUES (%s, %s, %s)",
                (email, code_hash, expires_at)
            )

        subject = "ClinixPro password reset code"
        body = (
            f"Hello,\n\n"
            f"We received a request to reset your ClinixPro password.\n\n"
            f"Your verification code is: {code}\n\n"
            f"This code will expire in 15 minutes. If you didn't request this, "
            f"you can safely ignore this email — your password will remain unchanged.\n\n"
            f"— The ClinixPro Team"
        )
        sent = send_clinixpro_email(email, subject, body)

        response = dict(generic_response)
        if not sent and not (app.config.get('MAIL_USERNAME') and app.config.get('MAIL_PASSWORD')):
            print(f"[DEV] Verification code for {email}: {code}")
        return jsonify(response), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/auth/reset-password', methods=['POST'])
def reset_password():
    """Verify the reset code and update the user's password."""
    try:
        data = request.get_json(silent=True) or {}
        email = str(data.get('email') or '').strip().lower()
        code = str(data.get('code') or '').strip()
        new_password = str(data.get('new_password') or '')

        if not email or not code or not new_password:
            return jsonify({'error': 'Email, code, and new password are required.'}), 400
        if len(new_password) < 6:
            return jsonify({'error': 'New password must be at least 6 characters.'}), 400

        ensure_password_reset_table()

        if not mysql_ready():
            return jsonify({'error': 'Password reset is unavailable in demo mode.'}), 503

        user = db_select_one(
            "SELECT user_id, email FROM users WHERE LOWER(email)=%s",
            (email,)
        )
        if not user:
            return jsonify({'error': 'Invalid code or email.'}), 400

        record = db_select_one(
            """
            SELECT id, code_hash, expires_at, used, attempts
            FROM password_reset_codes
            WHERE email=%s AND used=0
            ORDER BY id DESC LIMIT 1
            """,
            (email,)
        )
        if not record:
            return jsonify({'error': 'No active reset code. Please request a new one.'}), 400

        if record.get('attempts', 0) >= 5:
            db_execute("UPDATE password_reset_codes SET used=1 WHERE id=%s", (record['id'],))
            return jsonify({'error': 'Too many incorrect attempts. Please request a new code.'}), 429

        expires_at = record.get('expires_at')
        if isinstance(expires_at, str):
            try:
                expires_at = datetime.strptime(expires_at, '%Y-%m-%d %H:%M:%S')
            except Exception:
                expires_at = None
        if not expires_at or expires_at < datetime.utcnow():
            db_execute("UPDATE password_reset_codes SET used=1 WHERE id=%s", (record['id'],))
            return jsonify({'error': 'Code expired. Please request a new one.'}), 400

        if not check_password_hash(record['code_hash'], code):
            db_execute(
                "UPDATE password_reset_codes SET attempts=attempts+1 WHERE id=%s",
                (record['id'],)
            )
            return jsonify({'error': 'Invalid verification code.'}), 400

        new_hash = generate_password_hash(new_password)
        db_execute(
            "UPDATE users SET password=%s WHERE user_id=%s",
            (new_hash, user['user_id'])
        )
        db_execute(
            "UPDATE password_reset_codes SET used=1 WHERE id=%s",
            (record['id'],)
        )

        try:
            send_clinixpro_email(
                email,
                "Your ClinixPro password was changed",
                "Hi,\n\nThis is a confirmation that the password for your "
                "ClinixPro account was just changed.\n\nIf you didn't make this "
                "change, please contact support immediately.\n\n— The ClinixPro Team"
            )
        except Exception:
            pass

        return jsonify({'message': 'Password reset successfully. You can now log in with your new password.'}), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ==================== DASHBOARD ====================
@app.route('/api/dashboard/stats', methods=['GET'])
@token_required
def get_dashboard_stats(current_user_id, current_user_type):
    """Get dashboard statistics"""
    try:
        if mysql_ready():
            total_patients = db_select_one("SELECT COUNT(*) AS c FROM patients WHERE status='active'")['c']
            today_appointments = db_select_one("SELECT COUNT(*) AS c FROM appointments WHERE DATE(appointment_date)=CURDATE()")['c']
            upcoming = db_select_one("SELECT COUNT(*) AS c FROM appointments WHERE status='scheduled' AND appointment_date>=NOW()")['c']
            doctors_available = db_select_one("SELECT COUNT(*) AS c FROM doctors WHERE status='active' AND is_available=TRUE")['c']
            pending_tasks = db_select_one("SELECT COUNT(*) AS c FROM tasks WHERE status IN ('pending','in_progress')")['c']
            completed_appointments = db_select_one("SELECT COUNT(*) AS c FROM appointments WHERE status='completed'")['c']
            revenue = db_select_one("SELECT COALESCE(SUM(paid_amount),0) AS total FROM billing WHERE payment_status IN ('partial','paid')")['total']
            total_records = db_select_one("SELECT COUNT(*) AS c FROM medical_records")['c']
            active_rx = db_select_one("SELECT COUNT(*) AS c FROM prescriptions WHERE status='active'")['c']
            pending_bills = db_select_one("SELECT COUNT(*) AS c FROM billing WHERE payment_status IN ('pending','partial')")['c']
            return jsonify({
                'total_patients': int(total_patients or 0),
                'today_appointments': int(today_appointments or 0),
                'upcoming_appointments': int(upcoming or 0),
                'doctors_available': int(doctors_available or 0),
                'total_doctors': int(doctors_available or 0),
                'pending_tasks': int(pending_tasks or 0),
                'completed_appointments': int(completed_appointments or 0),
                'completed_today': int(completed_appointments or 0),
                'total_revenue': float(revenue or 0),
                'total_records': int(total_records or 0),
                'active_prescriptions': int(active_rx or 0),
                'pending_bills': int(pending_bills or 0)
            }), 200

        return jsonify({
            'total_patients': len(mock_patients),
            'today_appointments': len([a for a in mock_appointments if a['status'] == 'scheduled']),
            'upcoming_appointments': len([a for a in mock_appointments if a['status'] == 'scheduled']),
            'doctors_available': len(mock_doctors),
            'total_doctors': len(mock_doctors),
            'pending_tasks': len([t for t in mock_tasks if t['status'] == 'Pending']),
            'completed_appointments': len([a for a in mock_appointments if a['status'] == 'completed']),
            'completed_today': len([a for a in mock_appointments if a['status'] == 'completed']),
            'total_revenue': sum([b['amount'] for b in mock_billing if b['status'] == 'paid']),
            'total_records': len(mock_medical_records),
            'active_prescriptions': len(mock_prescriptions),
            'pending_bills': len([b for b in mock_billing if b['status'] == 'pending'])
        }), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ==================== PATIENTS ====================
@app.route('/api/patients', methods=['GET'])
@token_required
def get_patients(current_user_id, current_user_type):
    """Get all patients (patients see only their own record; doctors/admins see all)"""
    try:
        if mysql_ready():
            if current_user_type == 'patient':
                rows = db_select(
                    """
                    SELECT patient_id, name, email, phone, dob, gender, blood_group AS blood_type,
                           address, emergency_contact_phone AS emergency_contact, status, created_at, updated_at
                    FROM patients
                    WHERE status <> 'archived' AND patient_id=%s
                    """,
                    (current_user_id,)
                )
            else:
                rows = db_select(
                    """
                    SELECT patient_id, name, email, phone, dob, gender, blood_group AS blood_type,
                           address, emergency_contact_phone AS emergency_contact, status, created_at, updated_at
                    FROM patients
                    WHERE status <> 'archived'
                    ORDER BY patient_id DESC
                    """
                )
            return jsonify(rows), 200
        if current_user_type == 'patient':
            return jsonify([p for p in mock_patients if int(p.get('patient_id', -1)) == int(current_user_id)]), 200
        return jsonify(mock_patients), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/patients/<int:patient_id>', methods=['GET'])
@token_required
def get_patient(current_user_id, current_user_type, patient_id):
    """Get specific patient details"""
    try:
        # Authorization: patients may only view their own record; doctors only
        # patients they have an appointment with; admins may view any.
        if current_user_type == 'patient' and int(current_user_id) != int(patient_id):
            return jsonify({'error': 'Unauthorized'}), 403
        if current_user_type == 'doctor' and not _doctor_can_access_patient(current_user_id, patient_id):
            return jsonify({'error': 'Unauthorized'}), 403
        if mysql_ready():
            patient = db_select_one(
                """
                SELECT patient_id, name, email, phone, dob, gender, blood_group AS blood_type,
                       address, emergency_contact_phone AS emergency_contact, status
                FROM patients WHERE patient_id=%s
                """,
                (patient_id,)
            )
            if patient:
                return jsonify(patient), 200
            return jsonify({'error': 'Patient not found'}), 404
        patient = next((p for p in mock_patients if p['patient_id'] == patient_id), None)
        
        if patient:
            return jsonify(patient), 200
        else:
            return jsonify({'error': 'Patient not found'}), 404
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/patients', methods=['POST'])
@token_required
def create_patient(current_user_id, current_user_type):
    """Create a new patient"""
    try:
        data = request.get_json()
        
        # Validate required fields
        required_fields = ['name', 'email', 'phone', 'dob']
        if not all(field in data for field in required_fields):
            return jsonify({'error': 'Missing required fields'}), 400
        
        new_patient_id = max([p['patient_id'] for p in mock_patients], default=0) + 1
        
        new_patient = {
            'patient_id': new_patient_id,
            'name': data['name'],
            'email': data['email'],
            'phone': data['phone'],
            'dob': data['dob'],
            'gender': data.get('gender', 'Other'),
            'blood_type': data.get('blood_type', 'Unknown')
        }
        
        mock_patients.append(new_patient)
        
        return jsonify({'message': 'Patient created successfully', 'patient': new_patient}), 201
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/patients/<int:patient_id>', methods=['PUT'])
@token_required
def update_patient(current_user_id, current_user_type, patient_id):
    # Authorization: patients may only update their own record; admins may
    # update any. Doctors are not permitted to modify patient profiles here.
    if current_user_type == 'patient' and int(current_user_id) != int(patient_id):
        return jsonify({'error': 'Unauthorized'}), 403
    if current_user_type not in ('patient', 'admin'):
        return jsonify({'error': 'Unauthorized'}), 403

    data = request.get_json() or {}

    if not mysql_ready():
        return jsonify({'error': 'Database not available'}), 503

    fields = []
    values = []

    field_map = {
        'name': 'name',
        'phone': 'phone',
        'blood_group': 'blood_group',
        'blood_type': 'blood_group',
        'dob': 'dob',
        'date_of_birth': 'dob',
        'address': 'address',
        'emergency_contact': 'emergency_contact_phone',
        'emergency_contact_phone': 'emergency_contact_phone',
        'gender': 'gender'
    }

    incoming_dob = None
    if 'dob' in data:
        incoming_dob = data.get('dob')
    elif 'date_of_birth' in data:
        incoming_dob = data.get('date_of_birth')
    if incoming_dob is not None:
        existing = db_select_one(
            "SELECT dob FROM patients WHERE patient_id=%s",
            (patient_id,)
        )
        existing_dob_iso = ''
        if existing and existing.get('dob'):
            try:
                existing_dob_iso = existing['dob'].isoformat()
            except AttributeError:
                existing_dob_iso = str(existing['dob'])[:10]
        new_dob_iso = str(incoming_dob)[:10] if incoming_dob else ''
        already_set = bool(existing_dob_iso) and existing_dob_iso != PATIENT_DOB_SENTINEL
        if already_set and new_dob_iso != existing_dob_iso:
            return jsonify({
                'error': 'Date of birth has already been set and cannot be changed.'
            }), 403

    seen_cols = set()
    for key, col in field_map.items():
        if key in data and col not in seen_cols:
            fields.append(f"{col}=%s")
            values.append(data[key] if data[key] != '' else None)
            seen_cols.add(col)

    if not fields:
        return jsonify({'error': 'No fields to update'}), 400

    values.append(patient_id)
    sql = f"UPDATE patients SET {', '.join(fields)} WHERE patient_id=%s"

    try:
        db_execute(sql, tuple(values))
        return jsonify({'message': 'Profile updated successfully'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/patients/<int:patient_id>', methods=['DELETE'])
@token_required
def delete_patient(current_user_id, current_user_type, patient_id):
    """Delete a patient"""
    if current_user_type != 'admin':
        return jsonify({'error': 'Only administrators can delete patient records'}), 403
    try:
        global mock_patients
        mock_patients = [p for p in mock_patients if p['patient_id'] != patient_id]

        return jsonify({'message': 'Patient deleted successfully'}), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ==================== DOCTORS ====================
@app.route('/api/doctors', methods=['GET'])
@token_required
def get_doctors(current_user_id, current_user_type):
    """Get all doctors"""
    try:
        if mysql_ready():
            rows = db_select(
                """
                SELECT doctor_id, name, specialization AS specialty, phone, email, experience_years AS experience,
                       department, license_number, consultation_fee, is_available, status
                FROM doctors
                WHERE status <> 'inactive'
                ORDER BY doctor_id DESC
                """
            )
            return jsonify(rows), 200
        return jsonify(mock_doctors), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/doctors/<int:doctor_id>', methods=['GET'])
@token_required
def get_doctor(current_user_id, current_user_type, doctor_id):
    """Get specific doctor details"""
    try:
        if mysql_ready():
            ensure_doctors_profile_schema()
            doctor = db_select_one(
                """
                SELECT doctor_id, name, specialization AS specialty, phone, email, experience_years AS experience,
                       department, license_number, consultation_fee, is_available, status,
                       bio, office_hours_start, office_hours_end, availability_days,
                       COALESCE(profile_onboarding_complete, 1) AS profile_onboarding_complete
                FROM doctors WHERE doctor_id=%s
                """,
                (doctor_id,)
            )
            if doctor:
                return jsonify(doctor), 200
            return jsonify({'error': 'Doctor not found'}), 404
        doctor = next((d for d in mock_doctors if d['doctor_id'] == doctor_id), None)
        
        if doctor:
            return jsonify(doctor), 200
        else:
            return jsonify({'error': 'Doctor not found'}), 404
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/doctor/profile-onboarding', methods=['POST'])
@token_required
def complete_doctor_profile_onboarding(current_user_id, current_user_type):
    """First-login profile completion for approved doctors."""
    try:
        if current_user_type != 'doctor':
            return jsonify({'error': 'Unauthorized'}), 403
        if not mysql_ready():
            return jsonify({'error': 'MySQL mode required'}), 503
        ensure_doctors_profile_schema()
        data = request.get_json() or {}
        consultation_fee = data.get('consultation_fee')
        office_start = str(data.get('office_hours_start') or '').strip()
        office_end = str(data.get('office_hours_end') or '').strip()
        availability_days = str(data.get('availability_days') or '').strip()
        bio = str(data.get('bio') or '').strip()
        photo_data = str(data.get('photo_data') or '').strip()

        try:
            fee_val = float(consultation_fee)
        except (TypeError, ValueError):
            return jsonify({'error': 'Consultation fee must be a valid number.'}), 400
        if fee_val <= 0:
            return jsonify({'error': 'Consultation fee must be greater than zero.'}), 400
        if len(bio) < 10:
            return jsonify({'error': 'Bio must be at least 10 characters.'}), 400
        if not photo_data:
            return jsonify({'error': 'Profile photo is required.'}), 400
        if not availability_days:
            return jsonify({'error': 'Select at least one available day.'}), 400
        if not office_start or not office_end:
            return jsonify({'error': 'Office hours start and end are required.'}), 400

        doctor = db_select_one("SELECT doctor_id FROM doctors WHERE doctor_id=%s", (current_user_id,))
        if not doctor:
            return jsonify({'error': 'Doctor profile not found'}), 404

        set_parts = [
            "consultation_fee=%s",
            "office_hours_start=%s",
            "office_hours_end=%s",
            "availability_days=%s",
            "bio=%s",
            "photo_data=%s",
        ]
        values = [
            fee_val,
            office_start or None,
            office_end or None,
            availability_days,
            bio,
            photo_data,
        ]
        set_parts.append("profile_onboarding_complete=1")
        values.append(current_user_id)
        db_execute(
            f"UPDATE doctors SET {', '.join(set_parts)} WHERE doctor_id=%s",
            tuple(values),
        )
        return jsonify({'message': 'Profile completed successfully'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/doctors/<int:doctor_id>', methods=['PUT'])
@token_required
def update_doctor(current_user_id, current_user_type, doctor_id):
    """Update doctor information (used by doctor dashboard)."""
    try:
        data = request.get_json() or {}

        if mysql_ready():
            doctor = db_select_one("SELECT doctor_id, email FROM doctors WHERE doctor_id=%s", (doctor_id,))
            if not doctor:
                return jsonify({'error': 'Doctor not found'}), 404
            if current_user_type == 'doctor' and int(current_user_id) != int(doctor_id):
                return jsonify({'error': 'Unauthorized'}), 403
            name = data.get('name') or data.get('full_name')
            specialty = data.get('specialty') or data.get('specialization')
            new_email = data.get('email')
            if new_email:
                user_row = db_select_one(
                    "SELECT user_id FROM users WHERE email=%s AND user_type='doctor'",
                    (doctor.get('email'),)
                )
                own_user_id = (user_row or {}).get('user_id', doctor_id)
                email_owner = db_select_one(
                    "SELECT user_id FROM users WHERE email=%s AND user_id<>%s",
                    (new_email, own_user_id)
                )
                if email_owner:
                    return jsonify({'error': 'Email already in use'}), 400
            db_execute(
                """
                UPDATE doctors
                SET name=COALESCE(%s, name),
                    email=COALESCE(%s, email),
                    phone=COALESCE(%s, phone),
                    specialization=COALESCE(%s, specialization),
                    license_number=COALESCE(%s, license_number),
                    department=COALESCE(%s, department),
                    experience_years=COALESCE(%s, experience_years),
                    consultation_fee=COALESCE(%s, consultation_fee),
                    is_available=COALESCE(%s, is_available)
                WHERE doctor_id=%s
                """,
                (
                    name,
                    data.get('email'),
                    data.get('phone'),
                    specialty,
                    data.get('license') or data.get('license_number'),
                    data.get('department'),
                    data.get('experience_years'),
                    data.get('consultation_fee'),
                    data.get('is_available'),
                    doctor_id
                )
            )
            # Keep authentication email in sync with doctor profile email.
            if new_email:
                old_email = doctor.get('email')
                db_execute("UPDATE users SET email=%s WHERE email=%s AND user_type='doctor'", (new_email, old_email))
                db_execute("UPDATE users SET email=%s WHERE user_id=%s AND user_type='doctor'", (new_email, doctor_id))
            doctor_row = db_select_one(
                """
                SELECT doctor_id, name, specialization AS specialty, phone, email, experience_years AS experience,
                       department, license_number, consultation_fee, is_available
                FROM doctors WHERE doctor_id=%s
                """,
                (doctor_id,)
            )
            return jsonify({'message': 'Doctor updated successfully', 'doctor': doctor_row}), 200

        doctor = next((d for d in mock_doctors if d.get('doctor_id') == doctor_id), None)
        if not doctor:
            return jsonify({'error': 'Doctor not found'}), 404

        # Allow doctor to update self; allow admin-like updates too (demo mode).
        if current_user_type == 'doctor' and int(current_user_id) != int(doctor_id):
            return jsonify({'error': 'Unauthorized'}), 403

        # Normalize a few common frontend field names.
        name = data.get('name') or data.get('full_name')
        specialty = data.get('specialty') or data.get('specialization')

        if name is not None:
            doctor['name'] = name
        if data.get('email') is not None:
            doctor['email'] = data.get('email')
        if data.get('phone') is not None:
            doctor['phone'] = data.get('phone')
        if specialty is not None:
            doctor['specialty'] = specialty

        # Store extra fields if provided (safe for demo; ignored by most UIs).
        for key in ['license', 'license_number', 'department', 'experience', 'experience_years', 'consultation_fee', 'is_available']:
            if key in data:
                doctor[key] = data.get(key)

        # Keep mock_users name in sync when possible.
        for email, user in list(mock_users.items()):
            if int(user.get('user_id', -1)) == int(doctor_id):
                if name:
                    user['name'] = name
                break

        return jsonify({'message': 'Doctor updated successfully', 'doctor': doctor}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ==================== APPOINTMENTS ====================
@app.route('/api/appointments', methods=['GET'])
@token_required
def get_appointments(current_user_id, current_user_type):
    """Get all appointments"""
    try:
        if mysql_ready():
            rows = db_select(
                """
                SELECT a.appointment_id, a.patient_id, a.doctor_id, a.appointment_date, a.reason, a.status,
                       p.name AS patient_name, d.name AS doctor_name
                FROM appointments a
                LEFT JOIN patients p ON p.patient_id = a.patient_id
                LEFT JOIN doctors d ON d.doctor_id = a.doctor_id
                ORDER BY a.appointment_date DESC
                """
            )
            return jsonify(rows), 200
        return jsonify([enrich_appointment(a) for a in mock_appointments]), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/appointments', methods=['POST'])
@token_required
def create_appointment(current_user_id, current_user_type):
    """Create a new appointment"""
    try:
        global next_appointment_id
        data = request.get_json() or {}

        required_fields = ['patient_id', 'doctor_id', 'appointment_date', 'reason']
        if not all(field in data for field in required_fields):
            return jsonify({'error': 'Missing required fields'}), 400

        # Normalise the appointment_date into a datetime object for validation.
        raw_date = str(data['appointment_date']).strip().replace('T', ' ')
        try:
            appointment_dt = datetime.fromisoformat(raw_date)
        except ValueError:
            return jsonify({'error': 'Invalid appointment date format.'}), 400

        # 1) Block past appointments (allow a 1-minute grace for clock drift).
        if appointment_dt < datetime.now() - timedelta(minutes=1):
            return jsonify({'error': 'Cannot book appointments in the past.'}), 400

        appointment_date = appointment_dt.strftime('%Y-%m-%d %H:%M:%S')

        if mysql_ready():
            # 2) Verify the doctor exists, is active and is currently available.
            doctor = db_select_one(
                "SELECT doctor_id, status, is_available FROM doctors WHERE doctor_id=%s",
                (data['doctor_id'],)
            )
            if not doctor or str(doctor.get('status') or '').lower() != 'active' or not doctor.get('is_available'):
                return jsonify({'error': 'This doctor is not currently available.'}), 400

            # 3) Reject if the doctor has another scheduled appointment within 30 minutes.
            conflict = db_select_one(
                """
                SELECT appointment_id FROM appointments
                WHERE doctor_id=%s AND status='scheduled'
                  AND appointment_date BETWEEN DATE_SUB(%s, INTERVAL 30 MINUTE) AND DATE_ADD(%s, INTERVAL 30 MINUTE)
                LIMIT 1
                """,
                (data['doctor_id'], appointment_date, appointment_date)
            )
            if conflict:
                return jsonify({'error': 'This time slot is already booked. Please choose another time.'}), 409

            new_id, _ = db_execute(
                """
                INSERT INTO appointments (patient_id, doctor_id, appointment_date, reason, status)
                VALUES (%s, %s, %s, %s, 'scheduled')
                """,
                (data['patient_id'], data['doctor_id'], appointment_date, data['reason'])
            )
            appointment = db_select_one(
                """
                SELECT a.appointment_id, a.patient_id, a.doctor_id, a.appointment_date, a.reason, a.status,
                       p.name AS patient_name, d.name AS doctor_name
                FROM appointments a
                LEFT JOIN patients p ON p.patient_id = a.patient_id
                LEFT JOIN doctors d ON d.doctor_id = a.doctor_id
                WHERE a.appointment_id=%s
                """,
                (new_id,)
            )

            # Notify the patient by email (best-effort; never block the response).
            try:
                patient = db_select_one(
                    "SELECT name, email FROM patients WHERE patient_id=%s",
                    (data['patient_id'],)
                )
                doctor = db_select_one(
                    "SELECT name FROM doctors WHERE doctor_id=%s",
                    (data['doctor_id'],)
                )
                if patient and patient.get('email'):
                    send_clinixpro_email(
                        patient['email'],
                        "Appointment Confirmed — ClinixPro",
                        (
                            f"Hello {patient.get('name') or 'there'},\n\n"
                            f"Your appointment with {(doctor or {}).get('name') or 'your doctor'} "
                            f"is confirmed for {appointment_date}.\n"
                            f"Reason: {data['reason']}\n\n"
                            f"— ClinixPro Team"
                        )
                    )
            except Exception as notify_err:
                print(f"[appointment] confirmation email failed: {notify_err}")

            return jsonify({'message': 'Appointment created successfully', 'appointment': appointment}), 201

        # ----- Fallback (no MySQL): mirror the same validation against in-memory state.
        mock_doctor = next((d for d in mock_doctors if d.get('doctor_id') == data['doctor_id']), None)
        if not mock_doctor or str(mock_doctor.get('status') or '').lower() != 'active' or not mock_doctor.get('is_available', True):
            return jsonify({'error': 'This doctor is not currently available.'}), 400

        window = timedelta(minutes=30)
        for existing in mock_appointments:
            if existing.get('doctor_id') != data['doctor_id'] or existing.get('status') != 'scheduled':
                continue
            try:
                existing_dt = datetime.fromisoformat(str(existing.get('appointment_date')).replace('T', ' '))
            except (TypeError, ValueError):
                continue
            if abs(existing_dt - appointment_dt) <= window:
                return jsonify({'error': 'This time slot is already booked. Please choose another time.'}), 409

        new_appointment = {
            'appointment_id': next_appointment_id,
            'patient_id': data['patient_id'],
            'doctor_id': data['doctor_id'],
            'appointment_date': appointment_date,
            'reason': data['reason'],
            'status': 'scheduled'
        }

        mock_appointments.append(new_appointment)
        next_appointment_id += 1

        return jsonify({'message': 'Appointment created successfully', 'appointment': new_appointment}), 201

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/appointments/<int:appointment_id>', methods=['PUT'])
@token_required
def update_appointment(current_user_id, current_user_type, appointment_id):
    """Update appointment"""
    try:
        data = request.get_json()
        if mysql_ready():
            exists = db_select_one(
                "SELECT appointment_id, doctor_id, patient_id FROM appointments WHERE appointment_id=%s",
                (appointment_id,)
            )
            if not exists:
                return jsonify({'error': 'Appointment not found'}), 404
            if not _user_owns_appointment(current_user_id, current_user_type, exists):
                return jsonify({'error': 'You are not authorized to modify this appointment'}), 403
            db_execute(
                """
                UPDATE appointments
                SET status=COALESCE(%s, status),
                    appointment_date=COALESCE(%s, appointment_date),
                    reason=COALESCE(%s, reason)
                WHERE appointment_id=%s
                """,
                (data.get('status'), data.get('appointment_date'), data.get('reason'), appointment_id)
            )
            appointment = db_select_one(
                """
                SELECT a.appointment_id, a.patient_id, a.doctor_id, a.appointment_date, a.reason, a.status,
                       p.name AS patient_name, d.name AS doctor_name
                FROM appointments a
                LEFT JOIN patients p ON p.patient_id = a.patient_id
                LEFT JOIN doctors d ON d.doctor_id = a.doctor_id
                WHERE a.appointment_id=%s
                """,
                (appointment_id,)
            )

            # Notify the patient if the appointment was just cancelled.
            new_status = str(data.get('status') or '').strip().lower()
            if new_status == 'cancelled' and appointment:
                try:
                    patient = db_select_one(
                        "SELECT name, email FROM patients WHERE patient_id=%s",
                        (appointment.get('patient_id'),)
                    )
                    if patient and patient.get('email'):
                        send_clinixpro_email(
                            patient['email'],
                            "Appointment Cancelled — ClinixPro",
                            (
                                f"Hello {patient.get('name') or 'there'},\n\n"
                                f"Your appointment with "
                                f"{appointment.get('doctor_name') or 'your doctor'} on "
                                f"{appointment.get('appointment_date')} has been cancelled.\n"
                                f"If this was unexpected, please book a new appointment or "
                                f"contact our support team.\n\n"
                                f"— ClinixPro Team"
                            )
                        )
                except Exception as notify_err:
                    print(f"[appointment] cancellation email failed: {notify_err}")

            return jsonify({'message': 'Appointment updated successfully', 'appointment': appointment}), 200
        
        appointment = next((a for a in mock_appointments if a['appointment_id'] == appointment_id), None)

        if not appointment:
            return jsonify({'error': 'Appointment not found'}), 404
        if not _user_owns_appointment(current_user_id, current_user_type, appointment):
            return jsonify({'error': 'You are not authorized to modify this appointment'}), 403

        if 'status' in data:
            appointment['status'] = data['status']
        if 'appointment_date' in data:
            appointment['appointment_date'] = data['appointment_date']
        if 'reason' in data:
            appointment['reason'] = data['reason']

        return jsonify({'message': 'Appointment updated successfully', 'appointment': appointment}), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/appointments/<int:appointment_id>', methods=['DELETE'])
@token_required
def delete_appointment(current_user_id, current_user_type, appointment_id):
    """Delete appointment"""
    try:
        if mysql_ready():
            appt = db_select_one(
                "SELECT appointment_id, doctor_id, patient_id FROM appointments WHERE appointment_id=%s",
                (appointment_id,)
            )
            if not appt:
                return jsonify({'error': 'Appointment not found'}), 404
            if not _user_owns_appointment(current_user_id, current_user_type, appt):
                return jsonify({'error': 'You are not authorized to modify this appointment'}), 403
            _, affected = db_execute("DELETE FROM appointments WHERE appointment_id=%s", (appointment_id,))
            if affected == 0:
                return jsonify({'error': 'Appointment not found'}), 404
            return jsonify({'message': 'Appointment deleted successfully'}), 200

        global mock_appointments
        appt = next((a for a in mock_appointments if a['appointment_id'] == appointment_id), None)
        if not appt:
            return jsonify({'error': 'Appointment not found'}), 404
        if not _user_owns_appointment(current_user_id, current_user_type, appt):
            return jsonify({'error': 'You are not authorized to modify this appointment'}), 403
        mock_appointments = [a for a in mock_appointments if a['appointment_id'] != appointment_id]

        return jsonify({'message': 'Appointment deleted successfully'}), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/doctor/appointments', methods=['GET'])
@token_required
def get_doctor_appointments(current_user_id, current_user_type):
    """Get appointments for the current doctor"""
    try:
        if mysql_ready():
            rows = db_select(
                """
                SELECT a.appointment_id, a.patient_id, a.doctor_id, a.appointment_date, a.reason, a.status,
                       p.name AS patient_name, d.name AS doctor_name
                FROM appointments a
                LEFT JOIN patients p ON p.patient_id = a.patient_id
                LEFT JOIN doctors d ON d.doctor_id = a.doctor_id
                WHERE a.doctor_id=%s
                ORDER BY a.appointment_date DESC
                """,
                (current_user_id,)
            )
            return jsonify(rows), 200
        # Get appointments where doctor_id matches current user
        doctor_appointments = [a for a in mock_appointments if int(a.get('doctor_id', -1)) == int(current_user_id)]
        return jsonify([enrich_appointment(a) for a in doctor_appointments]), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/patient/appointments', methods=['GET'])
@token_required
def get_patient_appointments(current_user_id, current_user_type):
    """Get appointments for the current patient"""
    try:
        if mysql_ready():
            rows = db_select(
                """
                SELECT a.appointment_id, a.patient_id, a.doctor_id, a.appointment_date, a.reason, a.status,
                       p.name AS patient_name, d.name AS doctor_name
                FROM appointments a
                LEFT JOIN patients p ON p.patient_id = a.patient_id
                LEFT JOIN doctors d ON d.doctor_id = a.doctor_id
                WHERE a.patient_id=%s
                ORDER BY a.appointment_date DESC
                """,
                (current_user_id,)
            )
            return jsonify(rows), 200
        # Get appointments where patient_id matches current user
        patient_appointments = [a for a in mock_appointments if int(a.get('patient_id', -1)) == int(current_user_id)]
        return jsonify([enrich_appointment(a) for a in patient_appointments]), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ==================== PATIENT UPLOADED RECORDS ====================
ALLOWED_RECORD_CATEGORIES = {
    'lab_report', 'prescription', 'imaging', 'x_ray',
    'discharge_summary', 'vaccination', 'insurance', 'consultation', 'other'
}
ALLOWED_RECORD_MIME_PREFIXES = ('image/', 'application/pdf', 'application/msword',
                                'application/vnd.openxmlformats-officedocument',
                                'text/plain')
MAX_RECORD_FILE_BYTES = 12 * 1024 * 1024  # 12 MB after decoding


def _resolve_patient_id_for_user(user_id, user_type):
    if user_type != 'patient' or not mysql_ready():
        return None
    row = db_select_one(
        "SELECT p.patient_id FROM patients p "
        "LEFT JOIN users u ON LOWER(u.email)=LOWER(p.email) "
        "WHERE p.patient_id=%s OR u.user_id=%s LIMIT 1",
        (user_id, user_id)
    )
    return row.get('patient_id') if row else None


def _doctor_can_access_patient(doctor_id, patient_id):
    if not mysql_ready():
        return False
    row = db_select_one(
        "SELECT 1 FROM appointments WHERE doctor_id=%s AND patient_id=%s LIMIT 1",
        (doctor_id, patient_id)
    )
    return bool(row)


def _user_owns_appointment(current_user_id, current_user_type, appointment):
    """Authorization check for appointment mutations.

    Admins can act on any appointment. Doctors and patients can act only on
    appointments where they are the assigned doctor or patient respectively.
    `appointment` is a dict-like row with `doctor_id` and `patient_id`.
    """
    if current_user_type == 'admin':
        return True
    if not appointment:
        return False
    try:
        uid = int(current_user_id)
    except (TypeError, ValueError):
        return False
    if current_user_type == 'doctor':
        return int(appointment.get('doctor_id') or -1) == uid
    if current_user_type == 'patient':
        return int(appointment.get('patient_id') or -1) == uid
    return False


def _record_row_to_payload(row, include_data=False):
    if not row:
        return {}
    payload = {
        'id': row.get('id'),
        'patient_id': row.get('patient_id'),
        'title': row.get('title'),
        'description': row.get('description'),
        'record_date': row.get('record_date'),
        'category': row.get('category'),
        'file_name': row.get('file_name'),
        'file_type': row.get('file_type'),
        'file_size': row.get('file_size'),
        'created_at': row.get('created_at'),
        'has_file': bool(row.get('file_name')),
    }
    if include_data:
        payload['file_data'] = row.get('file_data')
    return payload


@app.route('/api/patient/records', methods=['GET'])
@token_required
def list_patient_records(current_user_id, current_user_type):
    """List patient-uploaded records.

    - patient: returns their own uploads.
    - doctor: must pass ?patient_id=X and have an appointment with that patient.
    - admin: can pass ?patient_id=X and see anyone's uploads.
    """
    try:
        if not mysql_ready():
            return jsonify([]), 200

        ensure_patient_uploaded_records_table()
        target_patient_id = request.args.get('patient_id', type=int)

        if current_user_type == 'patient':
            target_patient_id = _resolve_patient_id_for_user(current_user_id, 'patient')
            if not target_patient_id:
                return jsonify([]), 200
        elif current_user_type == 'doctor':
            if not target_patient_id:
                return jsonify({'error': 'patient_id is required.'}), 400
            if not _doctor_can_access_patient(current_user_id, target_patient_id):
                return jsonify({'error': 'You can only view records for patients you have an appointment with.'}), 403
        elif current_user_type != 'admin':
            return jsonify({'error': 'Forbidden'}), 403
        elif not target_patient_id:
            return jsonify({'error': 'patient_id is required.'}), 400

        rows = db_select(
            """
            SELECT id, patient_id, title, description, record_date, category,
                   file_name, file_type, file_size, created_at
            FROM patient_uploaded_records
            WHERE patient_id=%s
            ORDER BY COALESCE(record_date, created_at) DESC, id DESC
            """,
            (target_patient_id,)
        )
        return jsonify([_record_row_to_payload(r) for r in rows]), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/patient/records', methods=['POST'])
@token_required
def create_patient_record(current_user_id, current_user_type):
    """Patient self-uploads a historical record (photo / PDF / etc.)."""
    try:
        if current_user_type != 'patient':
            return jsonify({'error': 'Only patients can upload their own records.'}), 403
        if not mysql_ready():
            return jsonify({'error': 'Database not available.'}), 503

        ensure_patient_uploaded_records_table()
        patient_id = _resolve_patient_id_for_user(current_user_id, 'patient')
        if not patient_id:
            return jsonify({'error': 'No matching patient profile found for your account.'}), 400

        data = request.get_json(silent=True) or {}
        title = str(data.get('title') or '').strip()
        description = str(data.get('description') or '').strip()
        record_date = data.get('record_date') or None
        category = str(data.get('category') or 'other').strip().lower()
        file_data_uri = str(data.get('file_data') or '').strip()
        file_name = str(data.get('file_name') or '').strip()
        file_type = str(data.get('file_type') or '').strip().lower()

        if not title:
            return jsonify({'error': 'Title is required.'}), 400
        if category not in ALLOWED_RECORD_CATEGORIES:
            category = 'other'
        if not file_data_uri or not file_name:
            return jsonify({'error': 'Please attach a file (photo or PDF).'}), 400

        # Parse "data:<mime>;base64,<payload>" format.
        mime = ''
        b64_payload = file_data_uri
        if file_data_uri.startswith('data:'):
            try:
                header, b64_payload = file_data_uri.split(',', 1)
                if ';base64' in header:
                    mime = header[5:header.index(';base64')]
            except Exception:
                return jsonify({'error': 'Could not read attached file.'}), 400
        if not mime and file_type:
            mime = file_type

        if mime and not any(mime.startswith(p) for p in ALLOWED_RECORD_MIME_PREFIXES):
            return jsonify({'error': 'Only photos, PDFs, and document files are allowed.'}), 400

        try:
            decoded_size = len(base64.b64decode(b64_payload, validate=False))
        except Exception:
            return jsonify({'error': 'Attached file is not valid.'}), 400
        if decoded_size > MAX_RECORD_FILE_BYTES:
            return jsonify({'error': 'File is larger than 12 MB. Please upload a smaller file.'}), 413

        if record_date:
            record_date = str(record_date)[:10]
        else:
            record_date = None

        new_id, _ = db_execute(
            """
            INSERT INTO patient_uploaded_records
            (patient_id, title, description, record_date, category, file_name, file_type, file_size, file_data)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                patient_id,
                title[:200],
                description or None,
                record_date,
                category,
                file_name[:255],
                (mime or file_type)[:120],
                decoded_size,
                file_data_uri
            )
        )

        row = db_select_one(
            "SELECT id, patient_id, title, description, record_date, category, "
            "file_name, file_type, file_size, created_at FROM patient_uploaded_records WHERE id=%s",
            (new_id,)
        )
        return jsonify(_record_row_to_payload(row)), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/patient/records/<int:record_id>', methods=['DELETE'])
@token_required
def delete_patient_record(current_user_id, current_user_type, record_id):
    """Delete a patient-uploaded record (only the owning patient can delete)."""
    try:
        if not mysql_ready():
            return jsonify({'error': 'Database not available.'}), 503
        ensure_patient_uploaded_records_table()
        row = db_select_one(
            "SELECT id, patient_id FROM patient_uploaded_records WHERE id=%s",
            (record_id,)
        )
        if not row:
            return jsonify({'error': 'Record not found.'}), 404
        if current_user_type == 'patient':
            patient_id = _resolve_patient_id_for_user(current_user_id, 'patient')
            if patient_id != row['patient_id']:
                return jsonify({'error': 'You can only delete your own records.'}), 403
        elif current_user_type != 'admin':
            return jsonify({'error': 'Forbidden'}), 403

        db_execute("DELETE FROM patient_uploaded_records WHERE id=%s", (record_id,))
        return jsonify({'message': 'Record deleted.'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/patient/records/<int:record_id>/file', methods=['GET'])
@token_required
def get_patient_record_file(current_user_id, current_user_type, record_id):
    """Stream the file content of a patient-uploaded record.

    Auth tokens are passed in the Authorization header so this endpoint
    can be used to view PDFs/images directly in a new tab. The frontend
    fetches it with auth headers, builds an Object URL and opens that.
    """
    try:
        if not mysql_ready():
            return jsonify({'error': 'Database not available.'}), 503
        ensure_patient_uploaded_records_table()

        row = db_select_one(
            """
            SELECT id, patient_id, file_name, file_type, file_data
            FROM patient_uploaded_records WHERE id=%s
            """,
            (record_id,)
        )
        if not row:
            return jsonify({'error': 'Record not found.'}), 404

        if current_user_type == 'patient':
            owner_patient_id = _resolve_patient_id_for_user(current_user_id, 'patient')
            if owner_patient_id != row['patient_id']:
                return jsonify({'error': 'Forbidden'}), 403
        elif current_user_type == 'doctor':
            if not _doctor_can_access_patient(current_user_id, row['patient_id']):
                return jsonify({'error': 'Forbidden'}), 403
        elif current_user_type != 'admin':
            return jsonify({'error': 'Forbidden'}), 403

        data_uri = row.get('file_data') or ''
        b64_payload = data_uri
        mime = row.get('file_type') or 'application/octet-stream'
        if data_uri.startswith('data:'):
            try:
                header, b64_payload = data_uri.split(',', 1)
                if ';base64' in header:
                    mime = header[5:header.index(';base64')] or mime
            except Exception:
                return jsonify({'error': 'File payload is malformed.'}), 500

        try:
            binary = base64.b64decode(b64_payload, validate=False)
        except Exception:
            return jsonify({'error': 'File payload is malformed.'}), 500

        filename = row.get('file_name') or f'record-{record_id}'
        response = Response(binary, mimetype=mime)
        response.headers['Content-Disposition'] = f'inline; filename="{filename}"'
        response.headers['Cache-Control'] = 'private, max-age=0'
        return response
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ==================== MEDICAL RECORDS ====================
@app.route('/api/medical-records', methods=['GET'])
@token_required
def get_medical_records(current_user_id, current_user_type):
    """Get medical records"""
    try:
        patient_id = request.args.get('patient_id', type=int)
        doctor_id = request.args.get('doctor_id', type=int)
        if mysql_ready():
            query = """
                SELECT mr.record_id, mr.patient_id, mr.doctor_id, mr.appointment_id, mr.diagnosis, mr.symptoms,
                       mr.treatment_plan, mr.follow_up_date, mr.record_date, p.name AS patient_name, d.name AS doctor_name
                FROM medical_records mr
                LEFT JOIN patients p ON p.patient_id = mr.patient_id
                LEFT JOIN doctors d ON d.doctor_id = mr.doctor_id
                WHERE 1=1
            """
            params = []
            if patient_id:
                query += " AND mr.patient_id=%s"
                params.append(patient_id)
            if doctor_id:
                query += " AND mr.doctor_id=%s"
                params.append(doctor_id)
            if current_user_type == 'patient' and not patient_id:
                query += " AND mr.patient_id=%s"
                params.append(current_user_id)
            if current_user_type == 'doctor' and not doctor_id:
                query += " AND mr.doctor_id=%s"
                params.append(current_user_id)
            query += " ORDER BY mr.record_date DESC"
            return jsonify(db_select(query, tuple(params))), 200
        
        records = mock_medical_records
        
        if patient_id:
            records = [r for r in records if r['patient_id'] == patient_id]
        if doctor_id:
            records = [r for r in records if r['doctor_id'] == doctor_id]
        if current_user_type == 'patient':
            records = [r for r in records if int(r.get('patient_id', -1)) == int(current_user_id)]
        if current_user_type == 'doctor' and not doctor_id:
            records = [r for r in records if int(r.get('doctor_id', -1)) == int(current_user_id)]
        
        return jsonify(records), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/medical-records', methods=['POST'])
@token_required
def create_medical_record(current_user_id, current_user_type):
    """Create medical record"""
    try:
        global next_medical_record_id
        data = request.get_json()
        
        required_fields = ['patient_id', 'diagnosis']
        if not all(field in data for field in required_fields):
            return jsonify({'error': 'Missing required fields'}), 400
        # Always tie record to the logged-in doctor; ignore any doctor_id sent from client.
        doctor_id = int(current_user_id) if current_user_type == 'doctor' else int(data.get('doctor_id') or 0)
        if not doctor_id:
            return jsonify({'error': 'doctor_id is required'}), 400
        if mysql_ready():
            new_id, _ = db_execute(
                """
                INSERT INTO medical_records (patient_id, doctor_id, diagnosis, symptoms, treatment_plan, follow_up_date)
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                (
                    data['patient_id'],
                    doctor_id,
                    data['diagnosis'],
                    data.get('symptoms'),
                    data.get('treatment_plan'),
                    data.get('follow_up_date')
                )
            )
            record = db_select_one(
                """
                SELECT mr.record_id, mr.patient_id, mr.doctor_id, mr.diagnosis, mr.symptoms, mr.treatment_plan,
                       mr.follow_up_date, mr.record_date, p.name AS patient_name, d.name AS doctor_name
                FROM medical_records mr
                LEFT JOIN patients p ON p.patient_id = mr.patient_id
                LEFT JOIN doctors d ON d.doctor_id = mr.doctor_id
                WHERE mr.record_id=%s
                """,
                (new_id,)
            )
            return jsonify({'message': 'Medical record created', 'record': record}), 201
        
        new_record = {
            'record_id': next_medical_record_id,
            'patient_id': data['patient_id'],
            'doctor_id': doctor_id,
            'diagnosis': data['diagnosis'],
            'symptoms': data.get('symptoms', ''),
            'treatment_plan': data.get('treatment_plan', ''),
            'date_created': datetime.now().isoformat()
        }
        
        mock_medical_records.append(new_record)
        next_medical_record_id += 1
        
        return jsonify({'message': 'Medical record created', 'record': new_record}), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ==================== PRESCRIPTIONS ====================
@app.route('/api/prescriptions', methods=['GET'])
@token_required
def get_prescriptions(current_user_id, current_user_type):
    """Get prescriptions"""
    try:
        patient_id = request.args.get('patient_id', type=int)
        doctor_id = request.args.get('doctor_id', type=int)
        if mysql_ready():
            query = """
                SELECT pr.prescription_id, pr.appointment_id, pr.patient_id, pr.doctor_id, pr.status,
                       pr.issue_date AS date_issued, pr.expiry_date, pr.notes,
                       JSON_UNQUOTE(JSON_EXTRACT(pr.prescription_details, '$.medicine1')) AS medication,
                       JSON_UNQUOTE(JSON_EXTRACT(pr.prescription_details, '$.medicine1')) AS medicine,
                       JSON_UNQUOTE(JSON_EXTRACT(pr.prescription_details, '$.instruction1')) AS frequency,
                       JSON_UNQUOTE(JSON_EXTRACT(pr.prescription_details, '$.quantity1')) AS dosage,
                       p.name AS patient_name, d.name AS doctor_name
                FROM prescriptions pr
                LEFT JOIN patients p ON p.patient_id = pr.patient_id
                LEFT JOIN doctors d ON d.doctor_id = pr.doctor_id
                WHERE 1=1
            """
            params = []
            if patient_id:
                query += " AND pr.patient_id=%s"
                params.append(patient_id)
            if doctor_id:
                query += " AND pr.doctor_id=%s"
                params.append(doctor_id)
            if current_user_type == 'patient' and not patient_id:
                query += " AND pr.patient_id=%s"
                params.append(current_user_id)
            if current_user_type == 'doctor' and not doctor_id:
                query += " AND pr.doctor_id=%s"
                params.append(current_user_id)
            query += " ORDER BY pr.created_at DESC"
            return jsonify(db_select(query, tuple(params))), 200
        
        prescriptions = mock_prescriptions
        
        if patient_id:
            prescriptions = [p for p in prescriptions if p['patient_id'] == patient_id]
        if doctor_id:
            prescriptions = [p for p in prescriptions if p['doctor_id'] == doctor_id]
        if current_user_type == 'patient':
            prescriptions = [p for p in prescriptions if int(p.get('patient_id', -1)) == int(current_user_id)]
        if current_user_type == 'doctor' and not doctor_id:
            prescriptions = [p for p in prescriptions if int(p.get('doctor_id', -1)) == int(current_user_id)]
        
        return jsonify(prescriptions), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/prescriptions', methods=['POST'])
@token_required
def create_prescription(current_user_id, current_user_type):
    """Create prescription"""
    try:
        global next_prescription_id
        data = request.get_json()
        
        required_fields = ['patient_id', 'doctor_id', 'medication', 'dosage']
        if not all(field in data for field in required_fields):
            return jsonify({'error': 'Missing required fields'}), 400
        if mysql_ready():
            appointment_id = data.get('appointment_id')
            if not appointment_id:
                latest = db_select_one(
                    """
                    SELECT appointment_id FROM appointments
                    WHERE patient_id=%s AND doctor_id=%s
                    ORDER BY appointment_date DESC LIMIT 1
                    """,
                    (data['patient_id'], data['doctor_id'])
                )
                appointment_id = (latest or {}).get('appointment_id')
            if not appointment_id:
                return jsonify({
                    'error': 'A valid appointment is required to create a prescription. Book an appointment first.'
                }), 400
            details = {
                'medicine1': data.get('medication'),
                'quantity1': data.get('dosage'),
                'instruction1': data.get('instructions') or data.get('frequency') or ''
            }
            new_id, _ = db_execute(
                """
                INSERT INTO prescriptions (appointment_id, patient_id, doctor_id, prescription_details, notes, status, issue_date, expiry_date)
                VALUES (%s, %s, %s, %s, %s, 'active', CURDATE(), %s)
                """,
                (
                    appointment_id,
                    data['patient_id'],
                    data['doctor_id'],
                    json.dumps(details),
                    data.get('notes') or data.get('duration'),
                    data.get('expiry_date')
                )
            )
            prescription = db_select_one(
                """
                SELECT prescription_id, appointment_id, patient_id, doctor_id, status, issue_date AS date_issued
                FROM prescriptions WHERE prescription_id=%s
                """,
                (new_id,)
            )
            return jsonify({'message': 'Prescription created', 'prescription': prescription}), 201
        
        new_prescription = {
            'prescription_id': next_prescription_id,
            'patient_id': data['patient_id'],
            'doctor_id': data['doctor_id'],
            'medication': data['medication'],
            'dosage': data['dosage'],
            'frequency': data.get('frequency', ''),
            'duration': data.get('duration', ''),
            'date_issued': datetime.now().isoformat()
        }
        
        mock_prescriptions.append(new_prescription)
        next_prescription_id += 1
        
        return jsonify({'message': 'Prescription created', 'prescription': new_prescription}), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ==================== BILLING ====================
@app.route('/api/billing', methods=['GET'])
@token_required
def get_billing(current_user_id, current_user_type):
    """Get billing records (patients see own bills; doctors see bills for their patients; admins see all)"""
    try:
        patient_id = request.args.get('patient_id', type=int)

        if current_user_type == 'patient' and patient_id and int(patient_id) != int(current_user_id):
            return jsonify({'error': 'You are not authorized to view this billing'}), 403
        if current_user_type == 'doctor' and patient_id and not _doctor_can_access_patient(current_user_id, patient_id):
            return jsonify({'error': 'You are not authorized to view this billing'}), 403

        if mysql_ready():
            query = """
                SELECT bill_id AS billing_id, patient_id, total_amount AS amount,
                       total_amount, paid_amount, payment_status AS status,
                       payment_status, payment_date, invoice_number AS description,
                       invoice_number, created_at AS date, created_at
                FROM billing
                WHERE 1=1
            """
            params = []
            if patient_id:
                query += " AND patient_id=%s"
                params.append(patient_id)
            if current_user_type == 'patient' and not patient_id:
                query += " AND patient_id=%s"
                params.append(current_user_id)
            elif current_user_type == 'doctor' and not patient_id:
                query += " AND patient_id IN (SELECT DISTINCT patient_id FROM appointments WHERE doctor_id=%s)"
                params.append(current_user_id)
            query += " ORDER BY created_at DESC"
            return jsonify(db_select(query, tuple(params))), 200

        billing = mock_billing

        if patient_id:
            billing = [b for b in billing if b['patient_id'] == patient_id]
        if current_user_type == 'patient':
            billing = [b for b in billing if int(b.get('patient_id', -1)) == int(current_user_id)]
        elif current_user_type == 'doctor':
            doctor_patient_ids = {a['patient_id'] for a in mock_appointments if a.get('doctor_id') == current_user_id}
            billing = [b for b in billing if b.get('patient_id') in doctor_patient_ids]

        return jsonify(billing), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/billing', methods=['POST'])
@token_required
def create_billing(current_user_id, current_user_type):
    """Create billing record"""
    try:
        global next_billing_id
        data = request.get_json() or {}

        required_fields = ['patient_id', 'amount', 'description']
        if not all(field in data for field in required_fields):
            return jsonify({'error': 'Missing required fields'}), 400

        if mysql_ready():
            try:
                patient_id = int(data['patient_id'])
            except (TypeError, ValueError):
                return jsonify({'error': 'Invalid patient_id'}), 400
            try:
                total_amount = float(data['amount'])
            except (TypeError, ValueError):
                return jsonify({'error': 'Invalid amount'}), 400
            notes = str(data.get('description') or '').strip() or None
            invoice_number = f"INV-{int(datetime.now().timestamp() * 1000)}"

            last_id, _ = db_execute(
                """
                INSERT INTO billing
                    (patient_id, total_amount, payment_status, invoice_number, notes, created_at)
                VALUES (%s, %s, 'pending', %s, %s, NOW())
                """,
                (patient_id, total_amount, invoice_number, notes)
            )
            row = db_select_one(
                """
                SELECT bill_id, patient_id, total_amount, payment_status,
                       invoice_number, notes, created_at
                FROM billing WHERE bill_id=%s
                """,
                (last_id,)
            )
            if row and hasattr(row.get('created_at'), 'isoformat'):
                row['created_at'] = row['created_at'].isoformat()
            return jsonify({'message': 'Billing record created', 'billing': row}), 201

        new_billing = {
            'billing_id': next_billing_id,
            'patient_id': data['patient_id'],
            'amount': data['amount'],
            'status': 'pending',
            'description': data['description'],
            'date': datetime.now().isoformat()
        }

        mock_billing.append(new_billing)
        next_billing_id += 1

        return jsonify({'message': 'Billing record created', 'billing': new_billing}), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ==================== TASKS ====================
@app.route('/api/tasks', methods=['GET'])
@token_required
def get_tasks(current_user_id, current_user_type):
    """Get tasks"""
    try:
        assigned_to = request.args.get('assigned_to', type=int)
        if mysql_ready():
            query = """
                SELECT task_id, title, description, assigned_to, related_patient_id, status, priority, due_date
                FROM tasks
                WHERE 1=1
            """
            params = []
            if assigned_to:
                query += " AND assigned_to=%s"
                params.append(assigned_to)
            if current_user_type == 'doctor' and not assigned_to:
                query += " AND assigned_to=%s"
                params.append(current_user_id)
            query += " ORDER BY due_date IS NULL, due_date ASC, task_id DESC"
            return jsonify(db_select(query, tuple(params))), 200
        
        tasks = mock_tasks
        
        if assigned_to:
            tasks = [t for t in tasks if t['assigned_to'] == assigned_to]
        
        return jsonify(tasks), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/tasks', methods=['POST'])
@token_required
def create_task(current_user_id, current_user_type):
    """Create task"""
    try:
        global next_task_id
        data = request.get_json()
        
        required_fields = ['title', 'assigned_to']
        if not all(field in data for field in required_fields):
            return jsonify({'error': 'Missing required fields'}), 400
        
        new_task = {
            'task_id': next_task_id,
            'title': data['title'],
            'status': 'Pending',
            'assigned_to': data['assigned_to'],
            'due_date': data.get('due_date', '')
        }
        
        mock_tasks.append(new_task)
        next_task_id += 1
        
        return jsonify({'message': 'Task created', 'task': new_task}), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/tasks/<int:task_id>', methods=['PUT'])
@token_required
def update_task(current_user_id, current_user_type, task_id):
    """Update task"""
    try:
        data = request.get_json()
        if mysql_ready():
            task = db_select_one("SELECT task_id FROM tasks WHERE task_id=%s", (task_id,))
            if not task:
                return jsonify({'error': 'Task not found'}), 404
            db_execute(
                """
                UPDATE tasks
                SET status=COALESCE(%s, status),
                    title=COALESCE(%s, title),
                    due_date=COALESCE(%s, due_date)
                WHERE task_id=%s
                """,
                (data.get('status'), data.get('title'), data.get('due_date'), task_id)
            )
            updated = db_select_one(
                "SELECT task_id, title, description, assigned_to, status, priority, due_date FROM tasks WHERE task_id=%s",
                (task_id,)
            )
            return jsonify({'message': 'Task updated', 'task': updated}), 200
        
        task = next((t for t in mock_tasks if t['task_id'] == task_id), None)
        
        if not task:
            return jsonify({'error': 'Task not found'}), 404
        
        if 'status' in data:
            task['status'] = data['status']
        if 'title' in data:
            task['title'] = data['title']
        if 'due_date' in data:
            task['due_date'] = data['due_date']
        
        return jsonify({'message': 'Task updated', 'task': task}), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ==================== DOCTOR PATIENTS ====================
@app.route('/api/doctors/<int:doctor_id>/patients', methods=['GET'])
@token_required
def get_doctor_patients(current_user_id, current_user_type, doctor_id):
    """Get doctor's patients"""
    try:
        if mysql_ready():
            rows = db_select(
                """
                SELECT DISTINCT p.patient_id, p.name, p.email, p.phone, p.dob, p.blood_group AS blood_type, p.gender
                FROM appointments a
                JOIN patients p ON p.patient_id = a.patient_id
                WHERE a.doctor_id=%s
                ORDER BY p.name
                """,
                (doctor_id,)
            )
            return jsonify(rows), 200
        doctor_appointments = [a for a in mock_appointments if a['doctor_id'] == doctor_id]
        patient_ids = set(a['patient_id'] for a in doctor_appointments)
        patients = [p for p in mock_patients if p['patient_id'] in patient_ids]
        
        return jsonify(patients), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ==================== SEARCH ====================
@app.route('/api/search/patients', methods=['GET'])
@token_required
def search_patients(current_user_id, current_user_type):
    """Search patients"""
    try:
        query = request.args.get('q', '').lower()
        
        results = [p for p in mock_patients if 
                  query in p['name'].lower() or 
                  query in p['email'].lower() or 
                  query in p['phone'].lower()]
        
        return jsonify(results), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/search/doctors', methods=['GET'])
@token_required
def search_doctors(current_user_id, current_user_type):
    """Search doctors"""
    try:
        query = request.args.get('q', '').lower()
        
        results = [d for d in mock_doctors if 
                  query in d['name'].lower() or 
                  query in d['specialty'].lower() or 
                  query in d['email'].lower()]
        
        return jsonify(results), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ==================== PATIENT RECORDS VIEW BY DOCTOR ====================
@app.route('/api/doctor/patient-records/<int:patient_id>', methods=['GET'])
@token_required
def get_patient_records_for_doctor(current_user_id, current_user_type, patient_id):
    """Get patient records for doctor"""
    try:
        # Authorization: doctors may only access records of patients they are
        # assigned to (via appointments); patients only their own; admins any.
        if current_user_type == 'doctor' and not _doctor_can_access_patient(current_user_id, patient_id):
            return jsonify({'error': 'Unauthorized'}), 403
        if current_user_type == 'patient' and int(current_user_id) != int(patient_id):
            return jsonify({'error': 'Unauthorized'}), 403
        # Get patient info
        patient = next((p for p in mock_patients if p['patient_id'] == patient_id), None)
        if not patient:
            return jsonify({'error': 'Patient not found'}), 404
        
        # Get appointments for this patient
        appointments = [a for a in mock_appointments if a['patient_id'] == patient_id]
        
        # Get medical records for this patient
        records = [r for r in mock_medical_records if r['patient_id'] == patient_id]
        
        # Get prescriptions for this patient
        prescriptions = [p for p in mock_prescriptions if p['patient_id'] == patient_id]
        
        # Get billing for this patient
        billing = [b for b in mock_billing if b['patient_id'] == patient_id]
        
        return jsonify({
            'patient': patient,
            'appointments': appointments,
            'medical_records': records,
            'prescriptions': prescriptions,
            'billing': billing
        }), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ==================== MESSAGING SYSTEM ====================
@app.route('/api/messages', methods=['GET'])
@token_required
def get_messages(current_user_id, current_user_type):
    """Get messages for current user (received and sent)"""
    try:
        if mysql_ready():
            ensure_messages_table()
            rows = db_select(
                """
                SELECT message_id, from_user_id, from_user_type, from_name,
                       to_user_id, to_user_type, to_name, subject, message,
                       is_read, created_at
                FROM messages
                WHERE to_user_id=%s OR from_user_id=%s
                ORDER BY created_at DESC
                """,
                (current_user_id, current_user_id)
            )
            return jsonify([_message_row_to_dict(r) for r in rows]), 200

        messages = [m for m in mock_messages if m['to_user_id'] == current_user_id or m['from_user_id'] == current_user_id]
        messages = sorted(messages, key=lambda x: x['timestamp'], reverse=True)
        return jsonify(messages), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/messages/inbox', methods=['GET'])
@token_required
def get_inbox(current_user_id, current_user_type):
    """Get received messages (inbox)"""
    try:
        if mysql_ready():
            ensure_messages_table()
            rows = db_select(
                """
                SELECT message_id, from_user_id, from_user_type, from_name,
                       to_user_id, to_user_type, to_name, subject, message,
                       is_read, created_at
                FROM messages
                WHERE to_user_id=%s
                ORDER BY created_at DESC
                """,
                (current_user_id,)
            )
            return jsonify([_message_row_to_dict(r) for r in rows]), 200

        messages = [m for m in mock_messages if m['to_user_id'] == current_user_id]
        messages = sorted(messages, key=lambda x: x['timestamp'], reverse=True)
        return jsonify(messages), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/messages/sent', methods=['GET'])
@token_required
def get_sent(current_user_id, current_user_type):
    """Get sent messages"""
    try:
        if mysql_ready():
            ensure_messages_table()
            rows = db_select(
                """
                SELECT message_id, from_user_id, from_user_type, from_name,
                       to_user_id, to_user_type, to_name, subject, message,
                       is_read, created_at
                FROM messages
                WHERE from_user_id=%s
                ORDER BY created_at DESC
                """,
                (current_user_id,)
            )
            return jsonify([_message_row_to_dict(r) for r in rows]), 200

        messages = [m for m in mock_messages if m['from_user_id'] == current_user_id]
        messages = sorted(messages, key=lambda x: x['timestamp'], reverse=True)
        return jsonify(messages), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/messages', methods=['POST'])
@token_required
def send_message(current_user_id, current_user_type):
    """Send a message"""
    try:
        global next_message_id
        data = request.get_json() or {}

        required_fields = ['to_user_id', 'subject', 'message']
        if not all(field in data for field in required_fields):
            return jsonify({'error': 'Missing required fields'}), 400

        try:
            to_user_id = int(data.get('to_user_id'))
        except Exception:
            to_user_id = None
        if not to_user_id:
            return jsonify({'error': 'Invalid recipient id'}), 400

        to_user_type = str(data.get('to_user_type') or data.get('recipient_type') or "").lower().strip()

        # Enforce that messaging is only allowed between users who share an appointment.
        # Patients can only message doctors they've booked with; doctors can only message
        # patients on their schedule.
        if mysql_ready():
            if current_user_type == 'patient':
                target_doctor_id = to_user_id if to_user_type == 'doctor' else None
                if target_doctor_id is None:
                    return jsonify({'error': 'Patients can only message doctors.'}), 403
                appt = db_select_one(
                    "SELECT 1 FROM appointments WHERE patient_id=%s AND doctor_id=%s LIMIT 1",
                    (current_user_id, target_doctor_id)
                )
                if not appt:
                    return jsonify({
                        'error': 'You can only message doctors you have an appointment with.'
                    }), 403
            elif current_user_type == 'doctor':
                target_patient_id = to_user_id if to_user_type == 'patient' else None
                if target_patient_id is None:
                    return jsonify({'error': 'Doctors can only message patients.'}), 403
                appt = db_select_one(
                    "SELECT 1 FROM appointments WHERE doctor_id=%s AND patient_id=%s LIMIT 1",
                    (current_user_id, target_patient_id)
                )
                if not appt:
                    return jsonify({
                        'error': 'You can only message patients you have an appointment with.'
                    }), 403

        from_name = None
        if mysql_ready():
            if current_user_type == 'doctor':
                row = db_select_one("SELECT name FROM doctors WHERE doctor_id=%s", (current_user_id,))
                if row:
                    from_name = row.get('name')
            elif current_user_type == 'patient':
                row = db_select_one("SELECT name FROM patients WHERE patient_id=%s", (current_user_id,))
                if row:
                    from_name = row.get('name')
            elif current_user_type == 'admin':
                row = db_select_one("SELECT s.name FROM staff s JOIN users u ON s.email=u.email WHERE u.user_id=%s", (current_user_id,))
                if row:
                    from_name = row.get('name')
            if not from_name:
                user_row = db_select_one("SELECT email FROM users WHERE user_id=%s", (current_user_id,))
                if user_row:
                    from_name = user_row.get('email')

        if not from_name:
            for _email, user_info in mock_users.items():
                if int(user_info.get('user_id', -1)) == int(current_user_id):
                    from_name = user_info.get('name')
                    break

        if not from_name:
            from_name = f"User {current_user_id}"

        to_name = None
        if mysql_ready():
            if to_user_type == 'patient':
                row = db_select_one("SELECT name FROM patients WHERE patient_id=%s", (to_user_id,))
                if row:
                    to_name = row.get('name')
            elif to_user_type == 'doctor':
                row = db_select_one("SELECT name FROM doctors WHERE doctor_id=%s", (to_user_id,))
                if row:
                    to_name = row.get('name')
            else:
                row = db_select_one("SELECT name FROM patients WHERE patient_id=%s", (to_user_id,))
                if row:
                    to_name = row.get('name')
                else:
                    row = db_select_one("SELECT name FROM doctors WHERE doctor_id=%s", (to_user_id,))
                    if row:
                        to_name = row.get('name')

        if not to_name:
            patient = next((p for p in mock_patients if int(p.get('patient_id', -1)) == int(to_user_id)), None)
            doctor = next((d for d in mock_doctors if int(d.get('doctor_id', -1)) == int(to_user_id)), None)
            if to_user_type == 'patient' and patient:
                to_name = patient.get('name')
            elif to_user_type == 'doctor' and doctor:
                to_name = doctor.get('name')
            else:
                for _email, user_info in mock_users.items():
                    if int(user_info.get('user_id', -1)) == int(to_user_id):
                        to_name = user_info.get('name')
                        break
                if not to_name:
                    to_name = (patient or doctor or {}).get('name')

        if not to_name:
            to_name = f"User {to_user_id}"

        if mysql_ready():
            ensure_messages_table()
            last_id, _ = db_execute(
                """
                INSERT INTO messages
                    (from_user_id, from_user_type, from_name,
                     to_user_id, to_user_type, to_name,
                     subject, message, is_read)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 0)
                """,
                (
                    current_user_id,
                    current_user_type or '',
                    from_name,
                    to_user_id,
                    to_user_type or None,
                    to_name,
                    data['subject'],
                    data['message'],
                )
            )
            row = db_select_one(
                """
                SELECT message_id, from_user_id, from_user_type, from_name,
                       to_user_id, to_user_type, to_name, subject, message,
                       is_read, created_at
                FROM messages WHERE message_id=%s
                """,
                (last_id,)
            )
            return jsonify({'message': 'Message sent successfully', 'data': _message_row_to_dict(row)}), 201

        new_message = {
            'message_id': next_message_id,
            'from_user_id': current_user_id,
            'from_user_type': current_user_type or '',
            'from_name': from_name,
            'to_user_id': to_user_id,
            'to_user_type': to_user_type or None,
            'to_name': to_name,
            'subject': data['subject'],
            'message': data['message'],
            'read': False,
            'timestamp': datetime.now().isoformat()
        }

        mock_messages.append(new_message)
        next_message_id += 1

        return jsonify({'message': 'Message sent successfully', 'data': new_message}), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/messages/<int:message_id>/read', methods=['PUT'])
@token_required
def mark_message_read(current_user_id, current_user_type, message_id):
    """Mark message as read"""
    try:
        if mysql_ready():
            ensure_messages_table()
            row = db_select_one(
                """
                SELECT message_id, from_user_id, from_user_type, from_name,
                       to_user_id, to_user_type, to_name, subject, message,
                       is_read, created_at
                FROM messages WHERE message_id=%s
                """,
                (message_id,)
            )
            if not row:
                return jsonify({'error': 'Message not found'}), 404
            if int(row.get('to_user_id') or 0) != int(current_user_id):
                return jsonify({'error': 'Unauthorized'}), 403
            db_execute("UPDATE messages SET is_read=1 WHERE message_id=%s", (message_id,))
            row['is_read'] = 1
            return jsonify({'message': 'Message marked as read', 'data': _message_row_to_dict(row)}), 200

        message = next((m for m in mock_messages if m['message_id'] == message_id), None)

        if not message:
            return jsonify({'error': 'Message not found'}), 404

        if message['to_user_id'] != current_user_id:
            return jsonify({'error': 'Unauthorized'}), 403

        message['read'] = True
        return jsonify({'message': 'Message marked as read', 'data': message}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/messages/<int:message_id>', methods=['DELETE'])
@token_required
def delete_message(current_user_id, current_user_type, message_id):
    """Delete a message (only the recipient or sender can delete)"""
    try:
        global mock_messages

        if mysql_ready():
            ensure_messages_table()
            row = db_select_one(
                "SELECT from_user_id, to_user_id FROM messages WHERE message_id=%s",
                (message_id,)
            )
            if not row:
                return jsonify({'error': 'Message not found'}), 404
            if (int(row.get('to_user_id') or 0) != int(current_user_id)
                    and int(row.get('from_user_id') or 0) != int(current_user_id)):
                return jsonify({'error': 'Unauthorized'}), 403
            db_execute("DELETE FROM messages WHERE message_id=%s", (message_id,))
            return jsonify({'message': 'Message deleted successfully'}), 200

        message = next((m for m in mock_messages if m['message_id'] == message_id), None)

        if not message:
            return jsonify({'error': 'Message not found'}), 404

        if message['to_user_id'] != current_user_id and message['from_user_id'] != current_user_id:
            return jsonify({'error': 'Unauthorized'}), 403

        mock_messages = [m for m in mock_messages if m['message_id'] != message_id]
        return jsonify({'message': 'Message deleted successfully'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500



# ==================== SUPPORT TICKET ENDPOINTS ====================

_support_ticket_ip_log = {}
_SUPPORT_TICKET_RATE_LIMIT = 5
_SUPPORT_TICKET_WINDOW = timedelta(hours=1)


@app.route('/api/support/tickets', methods=['POST'])
def create_support_ticket():
    """Create a new support ticket"""
    try:
        client_ip = (request.headers.get('X-Forwarded-For', '').split(',')[0].strip()
                     or request.remote_addr or 'unknown')
        now = datetime.utcnow()
        window_start = now - _SUPPORT_TICKET_WINDOW
        recent = [ts for ts in _support_ticket_ip_log.get(client_ip, []) if ts >= window_start]
        if len(recent) >= _SUPPORT_TICKET_RATE_LIMIT:
            return jsonify({
                'success': False,
                'message': 'Too many support tickets from this IP. Please try again later.'
            }), 429
        recent.append(now)
        _support_ticket_ip_log[client_ip] = recent

        data = request.get_json()

        required_fields = ['name', 'email', 'subject', 'message', 'category']
        if not all(field in data for field in required_fields):
            return jsonify({
                'success': False,
                'message': 'Missing required fields'
            }), 400
        
        ticket_code = f'TKT-{int(datetime.now().timestamp())}'
        ticket = {
            'id': ticket_code,
            'name': data.get('name'),
            'email': data.get('email'),
            'phone': data.get('phone', ''),
            'category': data.get('category'),
            'subject': data.get('subject'),
            'description': data.get('message'),
            'priority': data.get('priority', 'medium'),
            'status': 'open',
            'createdAt': datetime.now().isoformat(),
            'updatedAt': datetime.now().isoformat(),
            'messages': [{
                'author': 'Customer',
                'content': data.get('message'),
                'timestamp': datetime.now().isoformat(),
                'isSupport': False
            }]
        }

        if mysql_ready():
            ensure_support_tickets_table()
            db_execute(
                """
                INSERT INTO support_tickets
                (ticket_code, name, email, phone, category, subject, message, status)
                VALUES (%s, %s, %s, %s, %s, %s, %s, 'open')
                """,
                (
                    ticket_code,
                    data.get('name'),
                    data.get('email'),
                    data.get('phone', ''),
                    data.get('category'),
                    data.get('subject'),
                    data.get('message')
                )
            )
            return jsonify({
                'success': True,
                'message': 'Support ticket created successfully',
                'ticket_id': ticket_code
            }), 201
        
        save_ticket_to_file(ticket)
        
        return jsonify({
            'success': True,
            'message': 'Support ticket created successfully',
            'ticket_id': ticket['id']
        }), 201
        
    except Exception as e:
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500


def _resolve_user_email(current_user_id, current_user_type):
    """Return the authenticated user's email (or None) from MySQL or mock data."""
    if mysql_ready():
        row = db_select_one(
            "SELECT email FROM users WHERE user_id=%s",
            (current_user_id,)
        )
        if row and row.get('email'):
            return str(row.get('email')).strip().lower()
        return None
    for email_key, user_info in mock_users.items():
        if int(user_info.get('user_id') or 0) == int(current_user_id or 0):
            return str(email_key).strip().lower()
    return None


@app.route('/api/support/tickets/<ticket_id>', methods=['GET'])
@token_required
def get_support_ticket(current_user_id, current_user_type, ticket_id):
    """Get a specific support ticket. Only the creator (by email) or an admin may view."""
    try:
        user_email = _resolve_user_email(current_user_id, current_user_type)
        is_admin = current_user_type == 'admin'

        if mysql_ready():
            ensure_support_tickets_table()
            row = db_select_one(
                """
                SELECT ticket_code, name, email, phone, category, subject, message, status,
                       created_at, updated_at
                FROM support_tickets
                WHERE ticket_code=%s
                """,
                (ticket_id,)
            )
            if not row:
                return jsonify({'success': False, 'message': 'Ticket not found'}), 404
            ticket_email = str(row.get('email') or '').strip().lower()
            if not is_admin and (not user_email or ticket_email != user_email):
                return jsonify({'success': False, 'message': 'You are not authorized to view this ticket.'}), 403
            ticket = {
                'id': row.get('ticket_code'),
                'name': row.get('name'),
                'email': row.get('email'),
                'phone': row.get('phone') or '',
                'category': row.get('category'),
                'subject': row.get('subject'),
                'description': row.get('message'),
                'status': row.get('status'),
                'createdAt': row.get('created_at').isoformat() if row.get('created_at') else None,
                'updatedAt': row.get('updated_at').isoformat() if row.get('updated_at') else None
            }
            return jsonify({'success': True, 'ticket': ticket}), 200

        ticket = load_ticket_from_file(ticket_id)
        
        if not ticket:
            return jsonify({
                'success': False,
                'message': 'Ticket not found'
            }), 404

        ticket_email = str(ticket.get('email') or '').strip().lower()
        if not is_admin and (not user_email or ticket_email != user_email):
            return jsonify({'success': False, 'message': 'You are not authorized to view this ticket.'}), 403

        return jsonify({
            'success': True,
            'ticket': ticket
        }), 200
        
    except Exception as e:
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500


@app.route('/api/support/tickets', methods=['GET'])
@token_required
def list_support_tickets(current_user_id, current_user_type):
    """List support tickets. Non-admin callers can only see their own tickets;
    the ``email`` query parameter is ignored for them and forced to the
    authenticated user's email."""
    try:
        is_admin = current_user_type == 'admin'
        user_email = _resolve_user_email(current_user_id, current_user_type)
        if not is_admin:
            if not user_email:
                return jsonify({'success': False, 'message': 'Unable to resolve account email.'}), 403
            email = user_email
        else:
            email = request.args.get('email')
        status = request.args.get('status')
        category = request.args.get('category')

        if mysql_ready():
            ensure_support_tickets_table()
            query = """
                SELECT ticket_code, name, email, phone, category, subject, message, status,
                       created_at, updated_at
                FROM support_tickets
                WHERE 1=1
            """
            params = []
            if email:
                query += " AND email=%s"
                params.append(email)
            if status:
                query += " AND status=%s"
                params.append(status)
            if category:
                query += " AND category=%s"
                params.append(category)
            query += " ORDER BY updated_at DESC"
            rows = db_select(query, tuple(params))
            tickets = []
            for row in rows:
                tickets.append({
                    'id': row.get('ticket_code'),
                    'name': row.get('name'),
                    'email': row.get('email'),
                    'phone': row.get('phone') or '',
                    'category': row.get('category'),
                    'subject': row.get('subject'),
                    'description': row.get('message'),
                    'status': row.get('status'),
                    'createdAt': row.get('created_at').isoformat() if row.get('created_at') else None,
                    'updatedAt': row.get('updated_at').isoformat() if row.get('updated_at') else None
                })
            return jsonify({'success': True, 'count': len(tickets), 'tickets': tickets}), 200

        if not email:
            return jsonify({'success': False, 'message': 'Email parameter required'}), 400
        
        tickets = load_all_tickets()
        
        tickets = [t for t in tickets if t.get('email') == email]
        
        if status:
            tickets = [t for t in tickets if t.get('status') == status]
        
        if category:
            tickets = [t for t in tickets if t.get('category') == category]
        
        tickets.sort(key=lambda x: x.get('updatedAt', ''), reverse=True)
        
        return jsonify({
            'success': True,
            'count': len(tickets),
            'tickets': tickets
        }), 200
        
    except Exception as e:
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500

@app.route('/api/admin/support/tickets', methods=['GET'])
@token_required
def admin_support_tickets(current_user_id, current_user_type):
    """Admin-only support ticket list for dashboard."""
    try:
        if current_user_type != 'admin':
            return jsonify({'error': 'Unauthorized'}), 403

        if mysql_ready():
            ensure_support_tickets_table()
            rows = db_select(
                """
                SELECT ticket_code, name, email, subject, message, status, created_at
                FROM support_tickets
                ORDER BY created_at DESC
                LIMIT 100
                """
            )
            tickets = [{
                'ticket_id': r.get('ticket_code'),
                'name': r.get('name'),
                'email': r.get('email'),
                'subject': r.get('subject'),
                'message': r.get('message'),
                'status': r.get('status'),
                'date': r.get('created_at').isoformat() if r.get('created_at') else None
            } for r in rows]
            return jsonify({'tickets': tickets}), 200

        tickets = load_all_tickets()
        mapped = [{
            'ticket_id': t.get('id'),
            'name': t.get('name'),
            'email': t.get('email'),
            'subject': t.get('subject'),
            'message': t.get('description'),
            'status': t.get('status'),
            'date': t.get('createdAt')
        } for t in tickets]
        return jsonify({'tickets': mapped}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/doctor-applications', methods=['GET'])
@token_required
def admin_doctor_applications(current_user_id, current_user_type):
    """Admin-only list of doctor verification applications."""
    try:
        if current_user_type != 'admin':
            return jsonify({'error': 'Unauthorized'}), 403
        status = str(request.args.get('status', 'pending')).strip().lower()
        if status not in ('pending', 'approved', 'rejected', 'all'):
            status = 'pending'
        if mysql_ready():
            ensure_doctor_applications_table()
            params = []
            where_clause = ""
            if status != 'all':
                where_clause = "WHERE status=%s"
                params.append(status)
            rows = db_select(
                f"""
                SELECT application_id, first_name, last_name, email, phone, medical_license_number,
                       specialization, clinic_name, experience_years, city, bio, status, rejection_reason,
                       created_at, reviewed_at
                FROM doctor_applications
                {where_clause}
                ORDER BY created_at DESC
                LIMIT 200
                """,
                tuple(params)
            )
            applications = [{
                'application_id': r.get('application_id'),
                'name': f"{r.get('first_name', '')} {r.get('last_name', '')}".strip(),
                'email': r.get('email'),
                'phone': r.get('phone'),
                'medical_license_number': r.get('medical_license_number'),
                'specialization': r.get('specialization'),
                'clinic_name': r.get('clinic_name'),
                'experience_years': r.get('experience_years'),
                'city': r.get('city'),
                'bio': r.get('bio'),
                'status': r.get('status'),
                'rejection_reason': r.get('rejection_reason'),
                'created_at': r.get('created_at').isoformat() if r.get('created_at') else None,
                'reviewed_at': r.get('reviewed_at').isoformat() if r.get('reviewed_at') else None
            } for r in rows]
            return jsonify({'applications': applications}), 200
        return jsonify({'applications': []}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/doctor-applications/<int:application_id>/approve', methods=['POST'])
@token_required
def approve_doctor_application(current_user_id, current_user_type, application_id):
    """Approve pending doctor application and create active doctor account."""
    try:
        if current_user_type != 'admin':
            return jsonify({'error': 'Unauthorized'}), 403
        if not mysql_ready():
            return jsonify({'error': 'MySQL mode required'}), 503
        ensure_doctor_applications_table()
        ensure_doctors_profile_schema()
        app_row = db_select_one(
            "SELECT * FROM doctor_applications WHERE application_id=%s",
            (application_id,)
        )
        if not app_row:
            return jsonify({'error': 'Application not found'}), 404
        if app_row.get('status') != 'pending':
            return jsonify({'error': 'Only pending applications can be approved'}), 400
        email = app_row.get('email')
        if db_select_one("SELECT user_id FROM users WHERE email=%s", (email,)):
            return jsonify({'error': 'User already exists for this email'}), 400

        new_user_id, _ = db_execute(
            "INSERT INTO users (email, password, user_type, status) VALUES (%s, %s, 'doctor', 'active')",
            (email, app_row.get('password_hash'))
        )
        full_name = f"{app_row.get('first_name', '')} {app_row.get('last_name', '')}".strip()
        bio_text = (app_row.get('bio') or '').strip()
        db_execute(
            """
            INSERT INTO doctors
            (name, email, phone, specialization, license_number, department, experience_years, status, is_available,
             bio, profile_onboarding_complete)
            VALUES (%s, %s, %s, %s, %s, %s, %s, 'active', TRUE, %s, 0)
            """,
            (
                full_name,
                email,
                app_row.get('phone'),
                app_row.get('specialization') or 'General',
                app_row.get('medical_license_number'),
                app_row.get('clinic_name'),
                app_row.get('experience_years') or 0,
                bio_text or None
            )
        )
        db_execute(
            """
            UPDATE doctor_applications
            SET status='approved', reviewed_by=%s, reviewed_at=NOW(), rejection_reason=NULL
            WHERE application_id=%s
            """,
            (current_user_id, application_id)
        )
        send_clinixpro_email(
            email,
            "Your ClinixPro account is approved",
            (
                "Hello,\n\n"
                "Your ClinixPro doctor account has been approved. You can sign in with the email and password you "
                "registered with.\n\n"
                "After your first login, please complete your profile (photo, fee, and availability) to access the full "
                "dashboard.\n\n"
                "— ClinixPro Team"
            ),
        )
        return jsonify({'message': 'Doctor application approved successfully', 'user_id': new_user_id}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/doctor-applications/<int:application_id>/reject', methods=['POST'])
@token_required
def reject_doctor_application(current_user_id, current_user_type, application_id):
    """Reject pending doctor application with reason."""
    try:
        if current_user_type != 'admin':
            return jsonify({'error': 'Unauthorized'}), 403
        data = request.get_json() or {}
        reason = str(data.get('reason', '')).strip()
        if not reason:
            return jsonify({'error': 'Rejection reason is required'}), 400
        if not mysql_ready():
            return jsonify({'error': 'MySQL mode required'}), 503
        ensure_doctor_applications_table()
        app_row = db_select_one(
            "SELECT application_id, status, email FROM doctor_applications WHERE application_id=%s",
            (application_id,)
        )
        if not app_row:
            return jsonify({'error': 'Application not found'}), 404
        if app_row.get('status') != 'pending':
            return jsonify({'error': 'Only pending applications can be rejected'}), 400
        applicant_email = app_row.get('email')
        db_execute(
            """
            UPDATE doctor_applications
            SET status='rejected', rejection_reason=%s, reviewed_by=%s, reviewed_at=NOW()
            WHERE application_id=%s AND status='pending'
            """,
            (reason, current_user_id, application_id)
        )
        send_clinixpro_email(
            applicant_email,
            "Your application was not approved",
            (
                "Hello,\n\n"
                "Thank you for applying to ClinixPro. Unfortunately your doctor registration application was not "
                "approved.\n\n"
                f"Reason provided by the reviewer:\n{reason}\n\n"
                "No account was created for this application. You may contact support if you believe this was an error."
                "\n\n— ClinixPro Team"
            ),
        )
        return jsonify({'message': 'Doctor application rejected successfully'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/admin/patients/<int:patient_id>/status', methods=['PUT'])
@token_required
def admin_update_patient_status(current_user_id, current_user_type, patient_id):
    """Admin-only: set a patient's status (active/inactive)."""
    if current_user_type != 'admin':
        return jsonify({'error': 'Unauthorized'}), 403
    data = request.get_json() or {}
    status = data.get('status', 'inactive')
    if status not in ('active', 'inactive'):
        return jsonify({'error': 'Invalid status value'}), 400
    if not mysql_ready():
        return jsonify({'error': 'Database not available'}), 503
    patient = db_select_one("SELECT patient_id, email FROM patients WHERE patient_id=%s", (patient_id,))
    if not patient:
        return jsonify({'error': 'Patient not found'}), 404
    db_execute("UPDATE patients SET status=%s WHERE patient_id=%s", (status, patient_id))
    if patient.get('email'):
        db_execute("UPDATE users SET status=%s WHERE email=%s AND user_type='patient'", (status, patient['email']))
    return jsonify({'message': f'Patient status updated to {status}'}), 200


@app.route('/api/admin/doctors/<int:doctor_id>/status', methods=['PUT'])
@token_required
def admin_update_doctor_status(current_user_id, current_user_type, doctor_id):
    """Admin-only: set a doctor's status (active/inactive)."""
    if current_user_type != 'admin':
        return jsonify({'error': 'Unauthorized'}), 403
    data = request.get_json() or {}
    status = data.get('status', 'inactive')
    if status not in ('active', 'inactive'):
        return jsonify({'error': 'Invalid status value'}), 400
    if not mysql_ready():
        return jsonify({'error': 'Database not available'}), 503
    doctor = db_select_one("SELECT doctor_id, email FROM doctors WHERE doctor_id=%s", (doctor_id,))
    if not doctor:
        return jsonify({'error': 'Doctor not found'}), 404
    db_execute("UPDATE doctors SET status=%s WHERE doctor_id=%s", (status, doctor_id))
    if doctor.get('email'):
        db_execute("UPDATE users SET status=%s WHERE email=%s AND user_type='doctor'", (status, doctor['email']))
    return jsonify({'message': f'Doctor status updated to {status}'}), 200


@app.route('/api/admin/billing/<int:bill_id>/pay', methods=['PUT'])
@token_required
def admin_mark_billing_paid(current_user_id, current_user_type, bill_id):
    """Admin-only: mark a bill fully paid.

    Sets payment_status='paid', paid_amount=total_amount, payment_date=NOW().
    """
    if current_user_type != 'admin':
        return jsonify({'error': 'Unauthorized'}), 403
    try:
        if mysql_ready():
            row = db_select_one(
                "SELECT bill_id, total_amount FROM billing WHERE bill_id=%s",
                (bill_id,)
            )
            if not row:
                return jsonify({'error': 'Bill not found'}), 404
            db_execute(
                """
                UPDATE billing
                SET payment_status='paid',
                    paid_amount=total_amount,
                    payment_date=NOW()
                WHERE bill_id=%s
                """,
                (bill_id,)
            )
            updated = db_select_one(
                """
                SELECT bill_id AS billing_id, patient_id, total_amount AS amount,
                       total_amount, paid_amount, payment_status AS status,
                       payment_status, payment_date, invoice_number AS description,
                       invoice_number, created_at AS date, created_at
                FROM billing WHERE bill_id=%s
                """,
                (bill_id,)
            )
            for key in ('payment_date', 'created_at', 'date'):
                if updated and hasattr(updated.get(key), 'isoformat'):
                    updated[key] = updated[key].isoformat()
            return jsonify({'message': 'Bill marked as paid', 'billing': updated}), 200

        bill = next((b for b in mock_billing if (b.get('bill_id') == bill_id or b.get('billing_id') == bill_id)), None)
        if not bill:
            return jsonify({'error': 'Bill not found'}), 404
        total = bill.get('total_amount', bill.get('amount', 0))
        bill['payment_status'] = 'paid'
        bill['status'] = 'paid'
        bill['paid_amount'] = total
        bill['payment_date'] = datetime.now().isoformat()
        return jsonify({'message': 'Bill marked as paid', 'billing': bill}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ==================== ADMIN: SYSTEM INFO & USER MANAGEMENT ====================
@app.route('/api/admin/system-info', methods=['GET'])
@token_required
def admin_system_info(current_user_id, current_user_type):
    """Admin-only system information for the Settings panel."""
    if current_user_type != 'admin':
        return jsonify({'error': 'Unauthorized'}), 403
    try:
        connected = mysql_ready()
        info = {
            'database_mode': 'mysql' if connected else 'fallback',
            'database_connected': bool(connected),
            'database_host': DB_HOST,
            'database_name': DB_NAME,
            'server_start_time': SERVER_START_TIME.isoformat(),
            'last_backup': 'Not configured',
            'users_total': 0,
            'users_by_type': {'admin': 0, 'doctor': 0, 'patient': 0, 'staff': 0},
            'records_total': 0,
        }

        if connected:
            type_rows = db_select(
                "SELECT user_type, COUNT(*) AS c FROM users GROUP BY user_type"
            ) or []
            for row in type_rows:
                key = str(row.get('user_type') or '').lower() or 'other'
                info['users_by_type'][key] = int(row.get('c') or 0)
            info['users_total'] = sum(info['users_by_type'].values())

            record_tables = (
                'patients', 'doctors', 'appointments', 'medical_records',
                'prescriptions', 'billing'
            )
            total_records = 0
            for table in record_tables:
                try:
                    row = db_select_one(f"SELECT COUNT(*) AS c FROM {table}")
                    total_records += int((row or {}).get('c') or 0)
                except Exception:
                    continue
            info['records_total'] = total_records
        else:
            info['users_by_type'] = {
                'admin': sum(1 for u in mock_users.values() if u.get('user_type') == 'admin'),
                'doctor': sum(1 for u in mock_users.values() if u.get('user_type') == 'doctor'),
                'patient': sum(1 for u in mock_users.values() if u.get('user_type') == 'patient'),
                'staff': 0,
            }
            info['users_total'] = sum(info['users_by_type'].values())
            info['records_total'] = (
                len(mock_patients) + len(mock_doctors) + len(mock_appointments)
                + len(mock_medical_records) + len(mock_prescriptions) + len(mock_billing)
            )

        return jsonify(info), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/admin/users', methods=['GET'])
@token_required
def admin_list_users(current_user_id, current_user_type):
    """Admin-only: list every account in the users table."""
    if current_user_type != 'admin':
        return jsonify({'error': 'Unauthorized'}), 403
    try:
        if mysql_ready():
            rows = db_select(
                """
                SELECT user_id, email, user_type, status, created_at, updated_at
                FROM users
                ORDER BY created_at DESC, user_id DESC
                """
            )
            for row in rows or []:
                for key in ('created_at', 'updated_at'):
                    val = row.get(key)
                    if hasattr(val, 'isoformat'):
                        row[key] = val.isoformat()
            return jsonify(rows or []), 200

        rows = []
        for email, u in mock_users.items():
            rows.append({
                'user_id': u.get('user_id'),
                'email': email,
                'user_type': u.get('user_type'),
                'status': u.get('status', 'active'),
                'created_at': None,
                'updated_at': None,
            })
        return jsonify(rows), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/admin/users/<int:user_id>/status', methods=['PUT'])
@token_required
def admin_update_user_status(current_user_id, current_user_type, user_id):
    """Admin-only: toggle a user's account status (active/inactive).

    Also propagates the status to the associated patients/doctors profile row
    when one exists, so the dashboards stay consistent.
    """
    if current_user_type != 'admin':
        return jsonify({'error': 'Unauthorized'}), 403
    data = request.get_json() or {}
    status = str(data.get('status', '')).strip().lower()
    if status not in ('active', 'inactive'):
        return jsonify({'error': 'Invalid status value'}), 400
    if int(user_id) == int(current_user_id) and status == 'inactive':
        return jsonify({'error': 'You cannot deactivate your own account.'}), 400
    if not mysql_ready():
        return jsonify({'error': 'Database not available'}), 503
    try:
        user = db_select_one(
            "SELECT user_id, email, user_type FROM users WHERE user_id=%s",
            (user_id,)
        )
        if not user:
            return jsonify({'error': 'User not found'}), 404
        db_execute("UPDATE users SET status=%s WHERE user_id=%s", (status, user_id))
        email = user.get('email')
        utype = (user.get('user_type') or '').lower()
        if email and utype == 'patient':
            db_execute("UPDATE patients SET status=%s WHERE email=%s", (status, email))
        elif email and utype == 'doctor':
            db_execute("UPDATE doctors SET status=%s WHERE email=%s", (status, email))
        return jsonify({'message': f'User status updated to {status}', 'user_id': user_id, 'status': status}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


def _generate_temp_password():
    """Generate a temporary password that satisfies our complexity rules."""
    alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
    body = ''.join(secrets.choice(alphabet) for _ in range(8))
    return f"Tmp@{body}"


@app.route('/api/admin/users/<int:user_id>/reset-password', methods=['POST'])
@token_required
def admin_reset_user_password(current_user_id, current_user_type, user_id):
    """Admin-only: generate a temporary password and return it once.

    The plaintext password is returned in the response for the admin to
    relay to the user manually; it is never stored as plaintext.
    """
    if current_user_type != 'admin':
        return jsonify({'error': 'Unauthorized'}), 403
    if not mysql_ready():
        return jsonify({'error': 'Database not available'}), 503
    try:
        user = db_select_one(
            "SELECT user_id, email, user_type FROM users WHERE user_id=%s",
            (user_id,)
        )
        if not user:
            return jsonify({'error': 'User not found'}), 404
        temp_password = _generate_temp_password()
        db_execute(
            "UPDATE users SET password=%s WHERE user_id=%s",
            (generate_password_hash(temp_password), user_id)
        )
        return jsonify({
            'message': 'Temporary password generated',
            'user_id': user_id,
            'email': user.get('email'),
            'temporary_password': temp_password,
        }), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/admin/refresh-demo-data', methods=['POST'])
@token_required
def admin_refresh_demo_data(current_user_id, current_user_type):
    """Admin-only: wipe clinical/user tables and reseed the three demo accounts.

    DESTRUCTIVE — removes all current users (including the calling admin) and
    clinical data, then recreates the three demo accounts seeded by
    ``reset_demo_accounts.py``. The admin will need to log in again afterward
    using the demo admin credentials.
    """
    if current_user_type != 'admin':
        return jsonify({'error': 'Unauthorized'}), 403
    if not mysql_ready():
        return jsonify({'error': 'Database not available'}), 503

    confirm = (request.get_json(silent=True) or {}).get('confirm')
    if str(confirm) != 'RESET':
        return jsonify({'error': 'Confirmation token missing. Send {"confirm": "RESET"}.'}), 400

    try:
        # Lazy-import the script's helpers so server boot doesn't depend on it.
        project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        if project_root not in sys.path:
            sys.path.insert(0, project_root)
        import importlib
        if 'reset_demo_accounts' in sys.modules:
            rda = importlib.reload(sys.modules['reset_demo_accounts'])
        else:
            import reset_demo_accounts as rda

        conn = pymysql.connect(
            host=DB_HOST,
            port=DB_PORT,
            user=DB_USER,
            password=DB_PASSWORD,
            database=DB_NAME,
            charset='utf8mb4',
            cursorclass=pymysql.cursors.DictCursor,
            autocommit=False,
        )
        try:
            with conn.cursor() as cursor:
                rda.wipe(cursor)
                rda.seed_admin(cursor)
                rda.seed_doctor(cursor)
                rda.seed_patient(cursor)
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

        return jsonify({
            'message': 'Demo data reset successfully. Please log in again with the demo admin credentials.',
            'demo_accounts': [
                {'role': 'admin', 'email': 'admin@clinixpro.com', 'password': 'Admin@123'},
                {'role': 'doctor', 'email': 'doctor@clinixpro.com', 'password': 'Doctor@123'},
                {'role': 'patient', 'email': 'patient@clinixpro.com', 'password': 'Patient@123'},
            ],
        }), 200
    except Exception as e:
        return jsonify({'error': f'Demo reset failed: {e}'}), 500


@app.route('/api/support/tickets/<ticket_id>/reply', methods=['POST'])
@token_required
def add_ticket_reply(current_user_id, current_user_type, ticket_id):
    """Add a reply to a support ticket. Only the ticket creator or an admin
    may reply; the ``author`` field is overridden by the server based on the
    authenticated user so it can't be spoofed."""
    try:
        data = request.get_json() or {}

        if not data.get('message'):
            return jsonify({
                'success': False,
                'message': 'Message required'
            }), 400

        ticket = load_ticket_from_file(ticket_id)

        if not ticket:
            return jsonify({
                'success': False,
                'message': 'Ticket not found'
            }), 404

        is_admin = current_user_type == 'admin'
        user_email = _resolve_user_email(current_user_id, current_user_type)
        ticket_email = str(ticket.get('email') or '').strip().lower()
        if not is_admin and (not user_email or ticket_email != user_email):
            return jsonify({
                'success': False,
                'message': 'You are not authorized to reply to this ticket.'
            }), 403

        author = 'Support' if is_admin else (ticket.get('name') or 'Customer')
        new_message = {
            'author': author,
            'content': data.get('message'),
            'timestamp': datetime.now().isoformat(),
            'isSupport': is_admin
        }
        
        if 'messages' not in ticket:
            ticket['messages'] = []
        
        ticket['messages'].append(new_message)
        ticket['updatedAt'] = datetime.now().isoformat()
        
        save_ticket_to_file(ticket)
        
        return jsonify({
            'success': True,
            'message': 'Reply added successfully',
            'ticket': ticket
        }), 200
        
    except Exception as e:
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500


@app.route('/api/support/tickets/<ticket_id>/close', methods=['PUT'])
def close_support_ticket(ticket_id):
    """Close a support ticket"""
    try:
        ticket = load_ticket_from_file(ticket_id)
        
        if not ticket:
            return jsonify({
                'success': False,
                'message': 'Ticket not found'
            }), 404
        
        ticket['status'] = 'closed'
        ticket['updatedAt'] = datetime.now().isoformat()
        
        save_ticket_to_file(ticket)
        
        return jsonify({
            'success': True,
            'message': 'Ticket closed successfully'
        }), 200
        
    except Exception as e:
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500


# ==================== LIVE CHAT ENDPOINTS ====================

@app.route('/api/support/chat', methods=['POST'])
def send_chat_message():
    """Send a chat message"""
    try:
        data = request.get_json()
        
        if not data.get('message'):
            return jsonify({
                'success': False,
                'message': 'Message required'
            }), 400
        
        message = {
            'id': f'MSG-{int(datetime.now().timestamp())}',
            'sender': data.get('sender', 'anonymous'),
            'message': data.get('message'),
            'timestamp': datetime.now().isoformat(),
            'sessionId': data.get('sessionId') or data.get('session_id')
        }
        
        save_chat_message(message)
        
        bot_response = generate_bot_response(data.get('message'))
        
        return jsonify({
            'success': True,
            'message': 'Message received',
            'userMessage': message,
            'botResponse': {
                'id': f'BOT-{int(datetime.now().timestamp())}',
                'sender': 'support_bot',
                'message': bot_response,
                'timestamp': datetime.now().isoformat()
            }
        }), 200
        
    except Exception as e:
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500


@app.route('/api/support/chat/<session_id>', methods=['GET'])
def get_chat_history(session_id):
    """Get chat history for a session"""
    try:
        messages = load_chat_history(session_id)
        
        return jsonify({
            'success': True,
            'sessionId': session_id,
            'messages': messages
        }), 200
        
    except Exception as e:
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500


@app.route('/api/support/chat/status', methods=['GET'])
def get_support_status():
    """Get support team status"""
    try:
        return jsonify({
            'success': True,
            'status': 'online',
            'avgResponseTime': '2 minutes',
            'supportAgentsAvailable': 3,
            'businessHours': {
                'open': '09:00',
                'close': '18:00',
                'timezone': 'PKT'
            }
        }), 200
        
    except Exception as e:
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500


# ==================== SUPPORT STATISTICS ====================

@app.route('/api/support/stats', methods=['GET'])
def get_support_stats():
    """Get support team statistics"""
    try:
        tickets = load_all_tickets()
        
        stats = {
            'totalTickets': len(tickets),
            'openTickets': len([t for t in tickets if t.get('status') == 'open']),
            'inProgressTickets': len([t for t in tickets if t.get('status') == 'in-progress']),
            'resolvedTickets': len([t for t in tickets if t.get('status') == 'resolved']),
            'avgResolutionTime': '4 hours',
            'customerSatisfaction': 4.7
        }
        
        return jsonify({
            'success': True,
            'statistics': stats
        }), 200
        
    except Exception as e:
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500


# ==================== HELPER FUNCTIONS ====================

def save_ticket_to_file(ticket):
    """Save ticket to file system"""
    try:
        os.makedirs(DATA_DIR, exist_ok=True)
        
        tickets = {}
        if os.path.exists(TICKETS_FILE):
            with open(TICKETS_FILE, 'r') as f:
                tickets = json.load(f)
        
        tickets[ticket['id']] = ticket
        
        with open(TICKETS_FILE, 'w') as f:
            json.dump(tickets, f, indent=2)
            
    except Exception as e:
        print(f"Error saving ticket: {e}")


def load_ticket_from_file(ticket_id):
    """Load a specific ticket from file"""
    try:
        if not os.path.exists(TICKETS_FILE):
            return None
        
        with open(TICKETS_FILE, 'r') as f:
            tickets = json.load(f)
        
        return tickets.get(ticket_id)
        
    except Exception as e:
        print(f"Error loading ticket: {e}")
        return None


def load_all_tickets():
    """Load all tickets from file"""
    try:
        if not os.path.exists(TICKETS_FILE):
            return []
        
        with open(TICKETS_FILE, 'r') as f:
            tickets = json.load(f)
        
        return list(tickets.values())
        
    except Exception as e:
        print(f"Error loading tickets: {e}")
        return []


def save_chat_message(message):
    """Save chat message to file"""
    try:
        os.makedirs(DATA_DIR, exist_ok=True)
        
        messages = []
        if os.path.exists(CHAT_MESSAGES_FILE):
            with open(CHAT_MESSAGES_FILE, 'r') as f:
                messages = json.load(f)
        
        messages.append(message)
        
        with open(CHAT_MESSAGES_FILE, 'w') as f:
            json.dump(messages, f, indent=2)
            
    except Exception as e:
        print(f"Error saving chat message: {e}")


def load_chat_history(session_id):
    """Load chat history for a session"""
    try:
        if not os.path.exists(CHAT_MESSAGES_FILE):
            return []
        
        with open(CHAT_MESSAGES_FILE, 'r') as f:
            messages = json.load(f)
        
        return [m for m in messages if m.get('sessionId') == session_id]
        
    except Exception as e:
        print(f"Error loading chat history: {e}")
        return []


def generate_bot_response(user_message):
    """Generate automatic bot response"""
    message_lower = user_message.lower()
    
    if any(word in message_lower for word in ['appointment', 'book']):
        return "To book an appointment, go to the Appointments section and click 'Book New'. Select your preferred doctor and available time slot."
    elif any(word in message_lower for word in ['payment', 'billing', 'bill']):
        return "You can view and manage your billing details in the Billing section of your dashboard. Contact us if you need help with payment methods."
    elif any(word in message_lower for word in ['login', 'password', 'account']):
        return "If you're having trouble logging in, try resetting your password using the 'Forgot Password' link or contact our support team."
    elif any(word in message_lower for word in ['record', 'medical']):
        return "Your medical records are available in the Medical Records section. You can view, download, or share them with other providers."
    else:
        return "Thank you for your message. Our support team will be with you shortly. In the meantime, you can check our FAQ and tutorials for quick answers."

# ==================== ERROR HANDLERS ====================
@app.errorhandler(404)
def not_found(error):
    """Handle 404 errors"""
    return jsonify({'error': 'Endpoint not found'}), 404

@app.errorhandler(500)
def internal_error(error):
    """Handle 500 errors"""
    return jsonify({'error': 'Internal server error'}), 500

# ==================== MAIN ====================
if __name__ == '__main__':
    port = int(os.getenv('PORT', 5000))
    debug = os.getenv('FLASK_ENV', 'development') == 'development'
    db_mode = "MySQL" if mysql_ready() else "Fallback/In-memory"
    if mysql_ready():
        ensure_doctor_applications_table()
        ensure_doctors_profile_schema()
        ensure_patients_gender_schema()
        ensure_demo_users_in_db()
    print(f"[ClinixPro] Starting backend on port {port} (debug={debug})")
    print(f"[ClinixPro] Database mode: {db_mode} | host={DB_HOST} | db={DB_NAME}")
    app.run(host='0.0.0.0', port=port, debug=debug)
