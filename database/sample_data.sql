-- Sample Data for Smart Clinical Management System

USE smart_clinic;

-- ==================== INSERT SAMPLE PATIENTS ====================
INSERT INTO patients (name, email, phone, dob, gender, blood_group, city, state, status) VALUES
('Ahmed Hassan', 'ahmed.hassan@email.com', '03001234567', '1990-05-15', 'M', 'O+', 'Karachi', 'Sindh', 'active'),
('Fatima Khan', 'fatima.khan@email.com', '03009876543', '1992-08-22', 'F', 'A+', 'Lahore', 'Punjab', 'active'),
('Muhammad Ali', 'm.ali@email.com', '03105555555', '1988-12-10', 'M', 'B+', 'Islamabad', 'ICT', 'active'),
('Ayesha Malik', 'ayesha.malik@email.com', '03211111111', '1995-03-18', 'F', 'AB+', 'Rawalpindi', 'Punjab', 'active'),
('Hassan Raza', 'hassan.raza@email.com', '03002222222', '1987-07-25', 'M', 'O-', 'Peshawar', 'KPK', 'active');

-- ==================== INSERT SAMPLE DOCTORS ====================
INSERT INTO doctors (name, email, phone, specialization, qualification, license_number, department, consultation_fee, experience_years, status, is_available) VALUES
('Dr. Amir Khan', 'dr.amir@hospital.com', '03155555555', 'Cardiology', 'MBBS, MD Cardiology', 'LIC001234', 'Cardiology', 2000.00, 15, 'active', TRUE),
('Dr. Saira Ahmed', 'dr.saira@hospital.com', '03165555555', 'General Medicine', 'MBBS, MD Internal Medicine', 'LIC001235', 'General Medicine', 1500.00, 10, 'active', TRUE),
('Dr. Bilal Hassan', 'dr.bilal@hospital.com', '03175555555', 'Pediatrics', 'MBBS, MD Pediatrics', 'LIC001236', 'Pediatrics', 1200.00, 8, 'active', TRUE),
('Dr. Zainab Ali', 'dr.zainab@hospital.com', '03185555555', 'Orthopedics', 'MBBS, MD Orthopedics', 'LIC001237', 'Orthopedics', 2500.00, 12, 'active', TRUE),
('Dr. Usman Malik', 'dr.usman@hospital.com', '03195555555', 'Neurology', 'MBBS, MD Neurology', 'LIC001238', 'Neurology', 2200.00, 9, 'on_leave', FALSE);

-- ==================== INSERT SAMPLE APPOINTMENTS ====================
INSERT INTO appointments (patient_id, doctor_id, appointment_date, reason, status) VALUES
(1, 1, DATE_ADD(NOW(), INTERVAL 2 DAY), 'Regular Checkup', 'scheduled'),
(2, 2, DATE_ADD(NOW(), INTERVAL 1 DAY), 'Fever and Cough', 'scheduled'),
(3, 3, DATE_ADD(NOW(), INTERVAL 3 DAY), 'Child Vaccination', 'scheduled'),
(4, 4, DATE_ADD(NOW(), INTERVAL 5 DAY), 'Knee Pain', 'scheduled'),
(5, 1, NOW(), 'Heart Checkup', 'completed');

-- ==================== INSERT SAMPLE MEDICAL RECORDS ====================
INSERT INTO medical_records (patient_id, doctor_id, appointment_id, diagnosis, symptoms, treatment_plan, follow_up_date) VALUES
(1, 1, 5, 'Hypertension', 'High Blood Pressure', 'Medication: Lisinopril 10mg daily, Diet control, Regular exercise', DATE_ADD(NOW(), INTERVAL 30 DAY)),
(2, 2, NULL, 'Common Cold', 'Cough, Fever, Sore Throat', 'Rest, Fluids, Symptomatic treatment', DATE_ADD(NOW(), INTERVAL 7 DAY)),
(3, 3, NULL, 'Healthy', 'None', 'Continue regular activities', NULL),
(4, 4, NULL, 'Osteoarthritis', 'Knee Pain and Stiffness', 'Physical therapy, Pain management', DATE_ADD(NOW(), INTERVAL 14 DAY));

-- ==================== INSERT SAMPLE PRESCRIPTIONS ====================
INSERT INTO prescriptions (appointment_id, patient_id, doctor_id, prescription_details, issue_date, status) VALUES
(5, 1, 1, JSON_OBJECT('medicine1', 'Lisinopril 10mg', 'quantity1', 30, 'instruction1', 'Once daily after meal'), NOW(), 'active'),
(1, 2, 2, JSON_OBJECT('medicine1', 'Paracetamol 500mg', 'quantity1', 20, 'medicine2', 'Cough syrup', 'quantity2', 100), NOW(), 'active');

-- ==================== INSERT SAMPLE BILLING ====================
INSERT INTO billing (patient_id, appointment_id, consultation_fee, medicines_cost, tests_cost, total_amount, paid_amount, payment_status, payment_method, invoice_number) VALUES
(1, 5, 2000.00, 500.00, 0.00, 2500.00, 2500.00, 'paid', 'cash', 'INV001'),
(2, NULL, 1500.00, 300.00, 800.00, 2600.00, 0.00, 'pending', 'cash', 'INV002'),
(3, NULL, 1200.00, 0.00, 500.00, 1700.00, 0.00, 'pending', 'card', 'INV003'),
(4, NULL, 2500.00, 400.00, 1000.00, 3900.00, 0.00, 'pending', 'online', 'INV004'),
(5, NULL, 2000.00, 600.00, 0.00, 2600.00, 2600.00, 'paid', 'cash', 'INV005');

-- ==================== INSERT SAMPLE TASKS ====================
INSERT INTO tasks (title, description, assigned_to, related_patient_id, status, priority, due_date) VALUES
('Follow-up Call', 'Call patient Ahmed Hassan for post-checkup follow-up', 1, 1, 'pending', 'medium', DATE_ADD(NOW(), INTERVAL 3 DAY)),
('Lab Results Review', 'Review lab results for Fatima Khan', 2, 2, 'pending', 'high', NOW()),
('Prescription Refill', 'Refill prescription for Muhammad Ali', 1, 3, 'completed', 'medium', NOW()),
('Patient Education', 'Educate Ayesha about exercise routine', 4, 4, 'in_progress', 'medium', DATE_ADD(NOW(), INTERVAL 1 DAY));

-- ==================== INSERT SAMPLE STAFF ====================
INSERT INTO staff (name, email, phone, role, department, status) VALUES
('Amina Syed', 'amina.syed@hospital.com', '03009999999', 'receptionist', 'Administration', 'active'),
('Khalid Hussain', 'khalid.hussain@hospital.com', '03008888888', 'nurse', 'General Ward', 'active'),
('Sara Khan', 'sara.khan@hospital.com', '03007777777', 'lab_technician', 'Laboratory', 'active'),
('Admin User', 'admin@hospital.com', '03006666666', 'admin', 'Administration', 'active');

-- ==================== VERIFY DATA ====================
SELECT 'Patients Count:' as info, COUNT(*) as count FROM patients
UNION ALL
SELECT 'Doctors Count:', COUNT(*) FROM doctors
UNION ALL
SELECT 'Appointments Count:', COUNT(*) FROM appointments
UNION ALL
SELECT 'Medical Records Count:', COUNT(*) FROM medical_records
UNION ALL
SELECT 'Prescriptions Count:', COUNT(*) FROM prescriptions
UNION ALL
SELECT 'Billing Records Count:', COUNT(*) FROM billing
UNION ALL
SELECT 'Tasks Count:', COUNT(*) FROM tasks
UNION ALL
SELECT 'Staff Count:', COUNT(*) FROM staff;
