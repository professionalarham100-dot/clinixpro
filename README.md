# ClinixPro

A smart clinical management system built as a final-year project. It unifies
patient registration, appointment booking, prescriptions, medical records,
billing, and in-app messaging behind a role-aware UI for **patients**,
**doctors**, and **administrators**. A built-in AI assistant ("Clio") helps
visitors navigate workflows and answer common platform questions.

---

## Tech stack

| Layer    | Technology |
| -------- | ---------- |
| Backend  | Python 3.11+, Flask 2.3, PyJWT, Flask-CORS, Flask-Mail |
| Database | MySQL 8 (with an in-memory mock-data fallback for dev) |
| AI       | Groq LLM via the `groq` SDK |
| Email    | Gmail SMTP (App Password) |
| Frontend | Static HTML + vanilla JS, hand-rolled CSS design system (Fraunces / Sora), Font Awesome icons |

---

## Prerequisites

- **Python 3.11+**
- **MySQL 8** running locally (or a remote instance you can reach)
- A **Gmail App Password** if you want registration / verification / password-reset emails to actually send (otherwise email steps will silently no-op in dev)
- A **Groq API key** if you want Clio's free-form replies — without it the chatbot falls back to its built-in knowledge base

---

## Quick start

```powershell
# 1. Clone and enter the repo
git clone <repo-url>
cd "FYP FYP FYP\Fyp"

# 2. Create + activate a virtual environment (Windows / PowerShell)
python -m venv .venv
.\.venv\Scripts\Activate.ps1

# 3. Install Python dependencies
pip install -r backend\requirements.txt

# 4. Configure environment
copy backend\.env.example backend\.env
# Then edit backend\.env and fill in:
#   DB_PASSWORD, MAIL_USERNAME, MAIL_PASSWORD, JWT_SECRET_KEY, GROQ_API_KEY

# 5. Create the database + schema
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS smart_clinic;"
mysql -u root -p smart_clinic < database\schema.sql
mysql -u root -p smart_clinic < database\sample_data.sql

# 6. Run the backend
python backend\app.py
```

The Flask server prints the bound port and the database mode it detected:

```
[ClinixPro] Starting backend on port 5000 (debug=True)
[ClinixPro] Database mode: MySQL | host=localhost | db=smart_clinic
```

Open the frontend in a browser using any static file server **OR** by hitting
the Flask server directly:

- `http://127.0.0.1:5000/index.html` — landing page
- `http://127.0.0.1:5000/login.html` — sign in
- `http://127.0.0.1:5000/register.html` — patient signup

> If you serve the frontend from a different origin (e.g. VS Code Live Server
> on port 5500), make sure `CORS_ORIGINS` in `backend/.env` includes that
> origin.

---

## Test credentials (seeded by `sample_data.sql`)

| Role    | Email                    | Password   |
| ------- | ------------------------ | ---------- |
| Admin   | `admin@clinixpro.com`    | `Admin@123` |
| Doctor  | `doctor@clinixpro.com`   | `Doctor@123` |
| Patient | `patient@clinixpro.com`  | `Patient@123` |

The login page ships a small **Demo accounts** chip with one-click form fill
for evaluators.

---

## Project layout

```
Fyp/
├── backend/
│   ├── app.py                 # Single-file Flask application (all routes)
│   ├── requirements.txt
│   └── .env.example           # Copy to .env; never commit your real values
│
├── database/
│   ├── schema.sql             # MySQL DDL — run once on a fresh DB
│   └── sample_data.sql        # Seed admin/doctor/patient + demo records
│
├── frontend/
│   ├── index.html             # Landing page (teal/cream redesign)
│   ├── login.html, register.html, support.html
│   ├── patient-dashboard.html
│   ├── doctor-dashboard.html
│   ├── admin-dashboard.html
│   ├── css/                   # Design tokens + per-page redesign sheets
│   │   ├── design-tokens.css
│   │   ├── landing-redesign.css
│   │   ├── login-redesign.css
│   │   ├── register-redesign.css
│   │   ├── support-redesign.css
│   │   ├── dashboard-polish.css
│   │   ├── chatbot.css
│   │   └── … (legacy stylesheets kept for backward compatibility)
│   └── js/
│       ├── chatbot.js         # Clio widget (knowledge base + Groq bridge)
│       ├── dashboard-polish.js
│       ├── patient-dashboard-fixed.js
│       └── doctor-dashboard-fixed.js
│
└── README.md
```

---

## User flows

### Patient
1. `register.html` → fill the form → verify the 6-digit code emailed to the address.
2. `login.html` → sign in → land on `patient-dashboard.html`.
3. **Quick Book** card on the overview lists available doctors; one click pre-selects the doctor and opens the booking modal.
4. Book → conflict detection rejects bookings within ±30 min of an existing scheduled slot on the same doctor (HTTP 409).
5. Send / receive messages with your care team; the bell badge updates from `/api/messages/inbox` every 60 s.

### Doctor
1. `register.html?role=doctor` (or via the role tabs) submits a **doctor application**.
2. Admin reviews under `admin-dashboard.html` → **Doctor Applications** and approves or rejects.
3. On approval, the doctor receives an email and can sign in. First login forces **profile completion** (photo, fee, availability) before the rest of the API is unlocked.
4. The dashboard overview shows a **Today's Schedule** timeline with live status pills (past / now / cancelled).

### Admin
1. Sign in with `admin@clinixpro.com` / `Admin@123`.
2. Sidebar sections: Overview, Doctor Applications, Doctors, Patients, Appointments, Billing, Tasks, Support Tickets.
3. Approve / reject doctor applications, deactivate patients, mark bills paid, review support tickets.

### Password reset
1. From `login.html`, click **Forgot password?**.
2. Submit the email → 6-digit code is sent and stored hashed in `password_reset_codes` (15-minute expiry, max 5 attempts, used flag prevents replay).
3. Enter the code and a new password.

---

## Configuration reference

`backend/.env.example` documents every supported variable. Highlights:

- `DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PASSWORD` / `DB_NAME` — MySQL connection.
- `JWT_SECRET_KEY` — **must be changed in production**; rotates all tokens.
- `MAIL_*` — Gmail SMTP for verification and password-reset emails. Use an [App Password](https://support.google.com/accounts/answer/185833), not your normal Gmail password.
- `GROQ_API_KEY` — optional. Get one at [console.groq.com](https://console.groq.com). Without it Clio still answers from its local knowledge base.
- `CORS_ORIGINS` — comma-separated allowed origins for cross-origin frontend hosting.

---

## Security & deployment notes

- **Never commit `backend/.env`**. The repo's `.gitignore` already blocks `.env`, `.env.local`, `.pem`, and `.key` files.
- The repo's earlier `.env.example` shipped a Groq API key. If you cloned before the cleanup commit, **rotate that key in the Groq console** — it lives in the git history regardless of the current file content.
- Change `JWT_SECRET_KEY` for any non-dev deployment. All issued tokens become invalid when it rotates, which is intentional.
- The chatbot's persona is enforced in `backend/app.py → get_chat_system_prompt()`; it explicitly identifies as **Clio** and forbids the "Nav" hallucination caused by the earlier `"navigation assistant"` phrasing.
- Set `FLASK_ENV=production` and `SESSION_COOKIE_SECURE=True` when you're behind HTTPS.

---

## Troubleshooting

| Symptom | Fix |
| ------- | --- |
| Backend prints `Database mode: Fallback/In-memory` | MySQL isn't reachable. Verify the credentials in `backend/.env` and that the `smart_clinic` schema exists. The app still runs against in-memory mock data, but nothing persists. |
| Registration verification email never arrives | `MAIL_*` not configured, or you're using your raw Gmail password instead of an [App Password](https://support.google.com/accounts/answer/185833). |
| Chatbot replies with "Unable to reach AI assistant" | Either the backend isn't running or `GROQ_API_KEY` is missing. The widget still serves canned knowledge-base replies. |
| Browser keeps replaying old Clio messages naming itself "Nav" | The frontend ships a one-shot localStorage migration that purges those entries on first load. Hard-refresh once. |
| Admin dashboard shows no data | Confirm you've loaded `database/sample_data.sql` and the admin account exists. The dashboard reads from `/api/admin/*` which requires the admin role. |
| `CORS` errors in the browser console | Add your frontend origin to `CORS_ORIGINS` in `backend/.env` and restart Flask. |

---

## License

This is a final-year project. All code is provided for academic review.
