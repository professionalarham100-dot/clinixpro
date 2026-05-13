# Smart Clinical Management System - API Documentation

## Overview
RESTful API for Smart Clinical Management System built with Flask and JWT authentication.

## Base URL
```
http://localhost:5000/api
```

## Authentication
All endpoints (except login/register) require JWT token in Authorization header:
```
Authorization: Bearer <jwt_token>
```

## Response Format
All responses are in JSON format:
```json
{
  "data": {},
  "error": "error message",
  "message": "success message"
}
```

---

## Authentication Endpoints

### Register User
**Endpoint:** `POST /auth/register`  
**Auth Required:** No

**Request Body:**
```json
{
  "first_name": "Ahmed",
  "last_name": "Hassan",
  "email": "ahmed@example.com",
  "phone": "03001234567",
  "password": "securepassword",
  "user_type": "patient"
}
```

**Response (201):**
```json
{
  "message": "User registered successfully"
}
```

### Login
**Endpoint:** `POST /auth/login`  
**Auth Required:** No

**Request Body:**
```json
{
  "email": "ahmed@example.com",
  "password": "securepassword"
}
```

**Response (200):**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user_id": 1,
  "user_type": "patient"
}
```

### Forgot Password
**Endpoint:** `POST /auth/forgot-password`  
**Auth Required:** No

**Request Body:**
```json
{
  "email": "ahmed@example.com"
}
```

**Response (200):**
```json
{
  "message": "If email exists in system, password reset link will be sent"
}
```

---

## Patient Endpoints

### Get All Patients
**Endpoint:** `GET /patients`  
**Auth Required:** Yes  
**Role:** Doctor, Admin

**Response (200):**
```json
[
  {
    "patient_id": 1,
    "name": "Ahmed Hassan",
    "email": "ahmed@example.com",
    "phone": "03001234567",
    "dob": "1990-05-15",
    "gender": "M",
    "blood_group": "O+",
    "status": "active"
  }
]
```

### Get Patient Details
**Endpoint:** `GET /patients/{patient_id}`  
**Auth Required:** Yes

**Response (200):**
```json
{
  "patient_id": 1,
  "name": "Ahmed Hassan",
  "email": "ahmed@example.com",
  "phone": "03001234567",
  "dob": "1990-05-15",
  "gender": "M",
  "blood_group": "O+",
  "address": "123 Main St",
  "allergies": "Penicillin",
  "medical_history": "Hypertension",
  "status": "active"
}
```

### Create Patient
**Endpoint:** `POST /patients`  
**Auth Required:** Yes  
**Role:** Admin, Doctor

**Request Body:**
```json
{
  "name": "Fatima Khan",
  "email": "fatima@example.com",
  "phone": "03009876543",
  "dob": "1992-08-22",
  "gender": "F",
  "blood_group": "A+",
  "address": "456 Oak St"
}
```

**Response (201):**
```json
{
  "message": "Patient created successfully",
  "patient_id": 2
}
```

### Update Patient
**Endpoint:** `PUT /patients/{patient_id}`  
**Auth Required:** Yes

**Request Body:**
```json
{
  "phone": "03009999999",
  "blood_group": "A+",
  "address": "New address"
}
```

**Response (200):**
```json
{
  "message": "Patient updated successfully"
}
```

### Delete Patient
**Endpoint:** `DELETE /patients/{patient_id}`  
**Auth Required:** Yes  
**Role:** Admin

**Response (200):**
```json
{
  "message": "Patient deleted successfully"
}
```

---

## Doctor Endpoints

### Get All Doctors
**Endpoint:** `GET /doctors`  
**Auth Required:** Yes

**Response (200):**
```json
[
  {
    "doctor_id": 1,
    "name": "Dr. Amir Khan",
    "email": "dr.amir@hospital.com",
    "specialization": "Cardiology",
    "department": "Cardiology",
    "consultation_fee": 2000,
    "is_available": true,
    "experience_years": 15
  }
]
```

### Get Doctor's Patients
**Endpoint:** `GET /doctors/{doctor_id}/patients`  
**Auth Required:** Yes

**Response (200):**
```json
[
  {
    "patient_id": 1,
    "name": "Ahmed Hassan",
    "email": "ahmed@example.com",
    "phone": "03001234567"
  }
]
```

---

## Appointment Endpoints

### Get Appointments
**Endpoint:** `GET /appointments`  
**Auth Required:** Yes

**Query Parameters:**
- `patient_id` - Filter by patient
- `doctor_id` - Filter by doctor
- `date` - Filter by date (today, week, month)
- `status` - Filter by status (scheduled, completed, cancelled)

**Response (200):**
```json
[
  {
    "appointment_id": 1,
    "patient_id": 1,
    "doctor_id": 1,
    "appointment_date": "2026-04-05 10:00:00",
    "reason": "Regular Checkup",
    "status": "scheduled",
    "patient_name": "Ahmed Hassan",
    "doctor_name": "Dr. Amir Khan"
  }
]
```

### Create Appointment
**Endpoint:** `POST /appointments`  
**Auth Required:** Yes

**Request Body:**
```json
{
  "patient_id": 1,
  "doctor_id": 1,
  "appointment_date": "2026-04-05 10:00:00",
  "reason": "Regular Checkup"
}
```

**Response (201):**
```json
{
  "message": "Appointment created successfully",
  "appointment_id": 1
}
```

### Update Appointment
**Endpoint:** `PUT /appointments/{appointment_id}`  
**Auth Required:** Yes

**Request Body:**
```json
{
  "status": "completed",
  "notes": "Patient is healthy"
}
```

**Response (200):**
```json
{
  "message": "Appointment updated successfully"
}
```

---

## Medical Records Endpoints

### Get Medical Records
**Endpoint:** `GET /medical-records`  
**Auth Required:** Yes

**Query Parameters:**
- `patient_id` - Filter by patient
- `doctor_id` - Filter by doctor

**Response (200):**
```json
[
  {
    "record_id": 1,
    "patient_id": 1,
    "doctor_id": 1,
    "diagnosis": "Hypertension",
    "symptoms": "High Blood Pressure",
    "treatment_plan": "Medication: Lisinopril 10mg daily",
    "record_date": "2026-04-01 10:00:00",
    "follow_up_date": "2026-05-01"
  }
]
```

### Create Medical Record
**Endpoint:** `POST /medical-records`  
**Auth Required:** Yes  
**Role:** Doctor

**Request Body:**
```json
{
  "patient_id": 1,
  "doctor_id": 1,
  "diagnosis": "Common Cold",
  "symptoms": "Cough, Fever",
  "treatment_plan": "Rest and fluids"
}
```

**Response (201):**
```json
{
  "message": "Medical record created",
  "record_id": 2
}
```

---

## Prescription Endpoints

### Get Prescriptions
**Endpoint:** `GET /prescriptions`  
**Auth Required:** Yes

**Query Parameters:**
- `patient_id` - Filter by patient
- `status` - Filter by status (active, expired, refilled)

**Response (200):**
```json
[
  {
    "prescription_id": 1,
    "patient_id": 1,
    "doctor_id": 1,
    "prescription_details": {
      "medicine1": "Lisinopril 10mg",
      "quantity1": 30
    },
    "issue_date": "2026-04-01",
    "expiry_date": "2026-10-01",
    "status": "active"
  }
]
```

---

## Billing Endpoints

### Get Billing Records
**Endpoint:** `GET /billing`  
**Auth Required:** Yes

**Query Parameters:**
- `patient_id` - Filter by patient
- `payment_status` - Filter by status (pending, partial, paid, refunded)

**Response (200):**
```json
[
  {
    "bill_id": 1,
    "patient_id": 1,
    "consultation_fee": 2000,
    "medicines_cost": 500,
    "tests_cost": 0,
    "total_amount": 2500,
    "paid_amount": 0,
    "payment_status": "pending",
    "invoice_number": "INV001",
    "created_at": "2026-04-01"
  }
]
```

---

## Task Endpoints

### Get Tasks
**Endpoint:** `GET /tasks`  
**Auth Required:** Yes

**Query Parameters:**
- `assigned_to` - Filter by assigned doctor
- `status` - Filter by status (pending, in_progress, completed)

**Response (200):**
```json
[
  {
    "task_id": 1,
    "title": "Follow-up Call",
    "description": "Call patient for post-checkup",
    "assigned_to": 1,
    "status": "pending",
    "priority": "medium",
    "due_date": "2026-04-05"
  }
]
```

---

## Search Endpoints

### Search Patients
**Endpoint:** `GET /search/patients?q=query`  
**Auth Required:** Yes

**Response (200):**
```json
[
  {
    "patient_id": 1,
    "name": "Ahmed Hassan",
    "email": "ahmed@example.com",
    "phone": "03001234567"
  }
]
```

---

## Dashboard Endpoints

### Get Dashboard Stats
**Endpoint:** `GET /dashboard/stats`  
**Auth Required:** Yes

**Response (200):**
```json
{
  "total_patients": 15,
  "today_appointments": 5,
  "doctors_available": 4,
  "pending_tasks": 3
}
```

---

## Error Responses

### 400 Bad Request
```json
{
  "error": "Missing required fields"
}
```

### 401 Unauthorized
```json
{
  "error": "Invalid credentials"
}
```

### 403 Forbidden
```json
{
  "error": "Insufficient permissions"
}
```

### 404 Not Found
```json
{
  "error": "Resource not found"
}
```

### 500 Internal Server Error
```json
{
  "error": "Internal server error"
}
```

---

## Rate Limiting
Currently no rate limiting. Implement in production.

## Pagination
Currently no pagination. Use limit/offset in future versions.

## Versioning
API Version: v1

---

## Testing with cURL

### Login
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"ahmed@example.com","password":"password123"}'
```

### Get Patients
```bash
curl -X GET http://localhost:5000/api/patients \
  -H "Authorization: Bearer <token>"
```

### Create Appointment
```bash
curl -X POST http://localhost:5000/api/appointments \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"patient_id":1,"doctor_id":1,"appointment_date":"2026-04-05 10:00:00","reason":"Checkup"}'
```
