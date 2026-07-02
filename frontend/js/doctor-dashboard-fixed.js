// ==================== CONFIGURATION ====================
const API_BASE_URL = '/api';

// ==================== UTILITIES ====================
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
}

function getAuthHeaders() {
    return {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
        'Content-Type': 'application/json'
    };
}

function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 1rem 1.5rem;
        background: ${type === 'success' ? '#4caf50' : '#f44336'};
        color: white;
        border-radius: 8px;
        z-index: 9999;
        font-weight: bold;
    `;
    notification.textContent = message;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
}

function switchSection(id) {
    document.querySelectorAll('.section').forEach(s => { 
        s.style.display = 'none'; 
    });
    const sec = document.getElementById(id);
    if (sec) sec.style.display = 'block';
}

// ==================== INITIALIZATION ====================
document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    setupNav();
    loadDashboardData();
    setupModals();
    setupForms();
    setupProfileSection();
    
    // Auto-refresh appointments every 3 seconds
    setInterval(() => {
        const activeSection = document.querySelector('.section[style*="display: block"]');
        if (activeSection && activeSection.id === 'appointments') {
            loadAppointments();
        } else if (activeSection && activeSection.id === 'messages') {
            loadMessages();
        }
    }, 3000);
});

const DOCTOR_SECTION_LOADERS = {
    appointments: () => loadAppointments(),
    patients: () => loadPatients(),
    records: () => loadMedicalRecords(),
    tasks: () => loadTasks(),
    messages: () => loadMessages()
};

function setupNav() {
    const links = document.querySelectorAll('.nav-link[data-section]');
    links.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const sectionId = link.dataset.section;
            if (!sectionId) return;
            switchSection(sectionId);
            const loader = DOCTOR_SECTION_LOADERS[sectionId];
            if (loader) loader();
        });
    });

    // Setup logout
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (confirm('Are you sure you want to logout?')) {
                localStorage.clear();
                window.location.href = 'login.html';
            }
        });
    }
}

// ==================== AUTHENTICATION ====================
function checkAuth() {
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = 'login.html';
        return;
    }
}

// ==================== DASHBOARD ====================
async function loadDashboardData() {
    try {
        const userName = localStorage.getItem('userName') || 'Doctor';
        document.getElementById('doctorName').textContent = userName;
        
        // Load stats
        const statsRes = await fetch(`${API_BASE_URL}/dashboard/stats`, {
            headers: getAuthHeaders()
        });
        const stats = await statsRes.json();
        
        document.getElementById('todayAppointments').textContent = stats.today_appointments || 0;
        document.getElementById('totalPatients').textContent = stats.total_patients || 0;
        document.getElementById('totalRecords').textContent = stats.total_records || 0;
        document.getElementById('pendingTasks').textContent = stats.pending_tasks || 0;
        
    } catch (error) {
        console.error('Error loading dashboard:', error);
    }
}

// ==================== APPOINTMENTS ====================
async function loadAppointments() {
    try {
        const doctorId = localStorage.getItem('userId');
        const response = await fetch(`${API_BASE_URL}/doctor/appointments`, {
            headers: getAuthHeaders()
        });
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const appointments = await response.json();
        const container = document.getElementById('appointmentsList');
        
        if (!container) return;
        
        container.innerHTML = '';
        
        if (!appointments || appointments.length === 0) {
            container.innerHTML = '<div class="card"><p style="text-align:center;">No appointments assigned</p></div>';
        } else {
            appointments.forEach(apt => {
                const statusBadge = apt.status ? `<span class="badge badge-${escapeHtml(apt.status.toLowerCase())}">${escapeHtml(apt.status)}</span>` : '';
                const date = new Date(apt.appointment_date).toLocaleString();
                container.innerHTML += `
                    <div class="card">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <div style="flex:1;">
                                <h3>📅 ${escapeHtml(apt.reason || 'Appointment')}</h3>
                                <p><strong>Patient ID:</strong> #${escapeHtml(apt.patient_id)}</p>
                                <p><strong>Date:</strong> ${escapeHtml(date)}</p>
                            </div>
                            <div style="display:flex; gap:10px;">
                                ${statusBadge}
                                <button class="btn btn-sm btn-primary" onclick="updateAppointmentStatus(${escapeHtml(apt.appointment_id)}, 'completed')">✓ Complete</button>
                            </div>
                        </div>
                    </div>
                `;
            });
        }
        
    } catch (error) {
        console.error('Error loading appointments:', error);
        const container = document.getElementById('appointmentsList');
        if (container) container.innerHTML = '<div class="card"><p style="color:red;">Error loading appointments</p></div>';
    }
}

async function updateAppointmentStatus(appointmentId, status) {
    try {
        const response = await fetch(`${API_BASE_URL}/appointments/${appointmentId}`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify({ status: status })
        });
        
        if (response.ok) {
            showNotification('Appointment updated!', 'success');
            await loadAppointments();
        } else {
            showNotification('Failed to update appointment', 'error');
        }
    } catch (error) {
        console.error('Error updating appointment:', error);
        showNotification('Error updating appointment', 'error');
    }
}

// ==================== PATIENTS ====================
async function loadPatients() {
    try {
        const response = await fetch(`${API_BASE_URL}/patients`, {
            headers: getAuthHeaders()
        });
        
        const patients = await response.json();
        const container = document.getElementById('patientsList');
        
        if (!container) return;
        
        container.innerHTML = '';
        
        if (!patients || patients.length === 0) {
            container.innerHTML = '<div class="card"><p style="text-align:center;">No patients</p></div>';
        } else {
            patients.forEach(patient => {
                container.innerHTML += `
                    <div class="card">
                        <h3>👤 ${escapeHtml(patient.name)}</h3>
                        <p><strong>Email:</strong> ${escapeHtml(patient.email)}</p>
                        <p><strong>Phone:</strong> ${escapeHtml(patient.phone)}</p>
                        <p><strong>Blood Type:</strong> ${escapeHtml(patient.blood_type)} | <strong>DOB:</strong> ${escapeHtml(patient.dob)}</p>
                        <button class="btn btn-sm btn-secondary" onclick="viewPatientDetails(${escapeHtml(patient.patient_id)})">View Details</button>
                    </div>
                `;
            });
        }
    } catch (error) {
        console.error('Error loading patients:', error);
        const container = document.getElementById('patientsList');
        if (container) container.innerHTML = '<div class="card"><p style="color:red;">Error loading patients</p></div>';
    }
}

function viewPatientDetails(patientId) {
    showNotification(`Loading patient records...`, 'success');
    loadPatientRecords(patientId);
}

// ==================== PATIENT RECORDS ====================
async function loadPatientRecords(patientId) {
    try {
        const response = await fetch(`${API_BASE_URL}/doctor/patient-records/${patientId}`, {
            headers: getAuthHeaders()
        });
        
        if (!response.ok) {
            showNotification('Patient not found', 'error');
            return;
        }
        
        const patientData = await response.json();
        const modal = document.getElementById('patientRecordsModal');
        
        if (!modal) {
            showNotification('Modal not found', 'error');
            return;
        }
        
        // Populate modal with patient data
        const patient = patientData.patient;
        const appointments = patientData.appointments || [];
        const records = patientData.medical_records || [];
        const prescriptions = patientData.prescriptions || [];
        const billing = patientData.billing || [];
        
        let appointmentsHTML = '';
        if (appointments.length === 0) {
            appointmentsHTML = '<p style="text-align:center;">No appointments</p>';
        } else {
            appointments.forEach(app => {
                const date = new Date(app.appointment_date).toLocaleDateString();
                appointmentsHTML += `
                    <div class="card">
                        <p><strong>${escapeHtml(date)}</strong> - ${escapeHtml(app.reason_for_visit)}</p>
                        <span class="badge">${escapeHtml(app.status)}</span>
                    </div>
                `;
            });
        }
        
        let recordsHTML = '';
        if (records.length === 0) {
            recordsHTML = '<p style="text-align:center;">No medical records</p>';
        } else {
            records.forEach(rec => {
                const date = new Date(rec.date_created).toLocaleDateString();
                recordsHTML += `
                    <div class="card">
                        <h4>${escapeHtml(rec.diagnosis)}</h4>
                        <p><strong>Symptoms:</strong> ${escapeHtml(rec.symptoms || 'N/A')}</p>
                        <p><strong>Treatment:</strong> ${escapeHtml(rec.treatment_plan || 'N/A')}</p>
                        <p><strong>Date:</strong> ${escapeHtml(date)}</p>
                    </div>
                `;
            });
        }
        
        let prescriptionsHTML = '';
        if (prescriptions.length === 0) {
            prescriptionsHTML = '<p style="text-align:center;">No prescriptions</p>';
        } else {
            prescriptions.forEach(presc => {
                prescriptionsHTML += `
                    <div class="card">
                        <p><strong>${escapeHtml(presc.medication_name)}</strong> - ${escapeHtml(presc.dosage)}</p>
                        <p>Duration: ${escapeHtml(presc.duration)} | Frequency: ${escapeHtml(presc.frequency)}</p>
                    </div>
                `;
            });
        }
        
        let billingHTML = '';
        if (billing.length === 0) {
            billingHTML = '<p style="text-align:center;">No billing records</p>';
        } else {
            billing.forEach(bill => {
                const date = new Date(bill.date).toLocaleDateString();
                billingHTML += `
                    <div class="card">
                        <p><strong>${escapeHtml(bill.description)}</strong> - Rs ${escapeHtml(bill.amount)}</p>
                        <p>Date: ${escapeHtml(date)} | Status: ${escapeHtml(bill.status)}</p>
                    </div>
                `;
            });
        }
        
        const content = document.getElementById('patientRecordsContent');
        const safePatientId = escapeHtml(patientId);
        content.innerHTML = `
            <div style="margin-bottom:20px;">
                <h3>${escapeHtml(patient.name)}</h3>
                <p><strong>Email:</strong> ${escapeHtml(patient.email)} | <strong>Phone:</strong> ${escapeHtml(patient.phone)}</p>
                <p><strong>Blood Type:</strong> ${escapeHtml(patient.blood_type)} | <strong>DOB:</strong> ${escapeHtml(patient.dob)}</p>
            </div>

            <div style="border-bottom:1px solid #ddd; margin:20px 0;">
                <h4 style="cursor:pointer;" onclick="switchTab('appointments', '${safePatientId}')">📅 Appointments</h4>
                <div id="tab-appointments-${safePatientId}" style="display:block;">${appointmentsHTML}</div>
            </div>

            <div style="border-bottom:1px solid #ddd; margin:20px 0;">
                <h4 style="cursor:pointer;" onclick="switchTab('records', '${safePatientId}')">📋 Medical Records</h4>
                <div id="tab-records-${safePatientId}" style="display:none;">${recordsHTML}</div>
            </div>

            <div style="border-bottom:1px solid #ddd; margin:20px 0;">
                <h4 style="cursor:pointer;" onclick="switchTab('prescriptions', '${safePatientId}')">💊 Prescriptions</h4>
                <div id="tab-prescriptions-${safePatientId}" style="display:none;">${prescriptionsHTML}</div>
            </div>

            <div style="margin:20px 0;">
                <h4 style="cursor:pointer;" onclick="switchTab('billing', '${safePatientId}')">💳 Billing</h4>
                <div id="tab-billing-${safePatientId}" style="display:none;">${billingHTML}</div>
            </div>
        `;
        
        modal.style.display = 'block';
        
    } catch (error) {
        console.error('Error loading patient records:', error);
        showNotification('Error loading patient records', 'error');
    }
}

function switchTab(tab, patientId) {
    // Hide all tabs
    document.querySelectorAll(`[id^="tab-"]`).forEach(el => {
        if (el.id.includes(patientId)) el.style.display = 'none';
    });
    // Show selected tab
    const el = document.getElementById(`tab-${tab}-${patientId}`);
    if (el) el.style.display = 'block';
}

// ==================== MEDICAL RECORDS ====================
async function loadMedicalRecords() {
    try {
        const response = await fetch(`${API_BASE_URL}/medical-records`, {
            headers: getAuthHeaders()
        });
        
        const records = await response.json();
        const container = document.getElementById('recordsList');
        
        if (!container) return;
        
        container.innerHTML = '';
        
        if (!records || records.length === 0) {
            container.innerHTML = '<div class="card"><p style="text-align:center;">No medical records</p></div>';
        } else {
            records.forEach(rec => {
                const date = new Date(rec.date_created).toLocaleDateString();
                container.innerHTML += `
                    <div class="card">
                        <h3>📋 ${escapeHtml(rec.diagnosis)}</h3>
                        <p><strong>Patient ID:</strong> #${escapeHtml(rec.patient_id)}</p>
                        <p><strong>Symptoms:</strong> ${escapeHtml(rec.symptoms || 'N/A')}</p>
                        <p><strong>Treatment:</strong> ${escapeHtml(rec.treatment_plan || 'N/A')}</p>
                        <p><strong>Date:</strong> ${escapeHtml(date)}</p>
                    </div>
                `;
            });
        }
    } catch (error) {
        console.error('Error loading records:', error);
        const container = document.getElementById('recordsList');
        if (container) container.innerHTML = '<div class="card"><p style="color:red;">Error loading records</p></div>';
    }
}

// ==================== TASKS ====================
async function loadTasks() {
    try {
        const doctorId = localStorage.getItem('userId');
        const response = await fetch(`${API_BASE_URL}/tasks?assigned_to=${doctorId}`, {
            headers: getAuthHeaders()
        });
        
        const tasks = await response.json();
        const container = document.getElementById('tasksList');
        
        if (!container) return;
        
        container.innerHTML = '';
        
        if (!tasks || tasks.length === 0) {
            container.innerHTML = '<div class="card"><p style="text-align:center;">No tasks assigned</p></div>';
        } else {
            tasks.forEach(task => {
                const statusClass = task.status === 'Pending' ? 'badge-warning' : task.status === 'In Progress' ? 'badge-info' : 'badge-success';
                container.innerHTML += `
                    <div class="card">
                        <div style="display:flex; justify-content:space-between; align-items:start;">
                            <div style="flex:1;">
                                <h3>✓ ${escapeHtml(task.title)}</h3>
                                <p><strong>Due Date:</strong> ${escapeHtml(task.due_date || 'N/A')}</p>
                                <p><span class="badge ${statusClass}">${escapeHtml(task.status)}</span></p>
                            </div>
                            <div style="display:flex; gap:10px; flex-direction:column;">
                                <button class="btn btn-sm btn-primary" onclick="updateTaskStatus(${escapeHtml(task.task_id)}, 'In Progress')">Start</button>
                                <button class="btn btn-sm btn-success" onclick="updateTaskStatus(${escapeHtml(task.task_id)}, 'Completed')">Complete</button>
                            </div>
                        </div>
                    </div>
                `;
            });
        }
    } catch (error) {
        console.error('Error loading tasks:', error);
        const container = document.getElementById('tasksList');
        if (container) container.innerHTML = '<div class="card"><p style="color:red;">Error loading tasks</p></div>';
    }
}

async function updateTaskStatus(taskId, status) {
    try {
        const response = await fetch(`${API_BASE_URL}/tasks/${taskId}`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify({ status: status })
        });
        
        if (response.ok) {
            showNotification('Task updated!', 'success');
            await loadTasks();
        } else {
            showNotification('Failed to update task', 'error');
        }
    } catch (error) {
        console.error('Error updating task:', error);
        showNotification('Error updating task', 'error');
    }
}

// ==================== MODALS ====================
function setupModals() {
    // Create Record Modal
    const createRecordModal = document.getElementById('createRecordModal');
    const createRecordBtns = document.querySelectorAll('#createRecordBtn, #createRecordBtn2');
    
    createRecordBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            if (createRecordModal) createRecordModal.style.display = 'block';
            loadPatientSelects();
        });
    });
    
    // Issue Prescription Modal
    const prescriptionModal = document.getElementById('issuePrescriptionModal');
    const prescriptionBtns = document.querySelectorAll('#issuePrescriptionBtn');
    
    prescriptionBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            if (prescriptionModal) prescriptionModal.style.display = 'block';
            loadPatientSelects();
        });
    });
    
    // Create Task Modal
    const taskModal = document.getElementById('createTaskModal');
    const taskBtns = document.querySelectorAll('#createTaskBtn, #createTaskBtn2');
    
    taskBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            if (taskModal) taskModal.style.display = 'block';
        });
    });
    
    // Close buttons
    document.querySelectorAll('.close').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.target.closest('.modal').style.display = 'none';
        });
    });
    
    // Close on outside click
    window.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) {
            e.target.style.display = 'none';
        }
    });
}

function setupForms() {
    const createRecordForm = document.getElementById('createRecordForm');
    if (createRecordForm) {
        createRecordForm.addEventListener('submit', handleCreateRecord);
    }
    
    const prescriptionForm = document.getElementById('issuePrescriptionForm');
    if (prescriptionForm) {
        prescriptionForm.addEventListener('submit', handleIssuePrescription);
    }
    
    const taskForm = document.getElementById('createTaskForm');
    if (taskForm) {
        taskForm.addEventListener('submit', handleCreateTask);
    }
}

// ==================== HELPER FUNCTIONS ====================
async function loadMessages() {
    try {
        const response = await fetch(`${API_BASE_URL}/messages/inbox`, {
            headers: getAuthHeaders()
        });
        
        const messages = await response.json();
        const container = document.getElementById('messagesList');
        
        if (!container) return;
        
        container.innerHTML = '';
        
        if (!messages || messages.length === 0) {
            container.innerHTML = '<div class="card"><p style="text-align:center;">No messages</p></div>';
        } else {
            messages.forEach(msg => {
                const date = new Date(msg.timestamp).toLocaleDateString();
                const readClass = msg.read ? 'badge-success' : 'badge-warning';
                const readText = msg.read ? 'Read' : 'Unread';
                // JS-escape ' for inline onclick string, then HTML-escape for attribute context.
                const escapedName = escapeHtml(String(msg.from_name || '').replace(/'/g, "\\'"));
                const escapedSubject = escapeHtml(String(msg.subject || '').replace(/'/g, "\\'"));
                container.innerHTML += `
                    <div class="card">
                        <div style="display:flex; justify-content:space-between; align-items:start;">
                            <div style="flex:1;">
                                <h3>📧 ${escapeHtml(msg.subject)}</h3>
                                <p><strong>From:</strong> ${escapeHtml(msg.from_name)} (ID: ${escapeHtml(msg.from_user_id)})</p>
                                <p style="margin:10px 0;">${escapeHtml(msg.message)}</p>
                                <p><strong>Date:</strong> ${escapeHtml(date)}</p>
                            </div>
                            <div style="display:flex; flex-direction:column; gap:10px;">
                                <span class="badge ${readClass}">${readText}</span>
                                <button class="btn btn-sm btn-primary" onclick="replyMessage(${escapeHtml(msg.from_user_id)}, '${escapedName}', '${escapedSubject}')">Reply</button>
                                <button class="btn btn-sm btn-secondary" onclick="viewPatientRecordsFromMessage(${escapeHtml(msg.from_user_id)})">View Patient</button>
                            </div>
                        </div>
                    </div>
                `;
            });
        }
    } catch (error) {
        console.error('Error loading messages:', error);
    }
}

function viewPatientRecordsFromMessage(patientId) {
    loadPatientRecords(patientId);
}

async function replyMessage(patientId, patientName, originalSubject) {
    const message = prompt(`Reply to ${patientName} (Subject: ${originalSubject}):`);
    if (!message) return;
    
    try {
        const response = await fetch(`${API_BASE_URL}/messages`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                to_user_id: patientId,
                subject: 'Re: ' + originalSubject,
                message: message
            })
        });
        
        if (response.ok) {
            showNotification('Reply sent successfully!', 'success');
            await loadMessages();
        } else {
            showNotification('Failed to send reply', 'error');
        }
    } catch (error) {
        console.error('Error sending reply:', error);
        showNotification('Error sending reply', 'error');
    }
}

async function loadPatientSelects() {
    try {
        const response = await fetch(`${API_BASE_URL}/patients`, {
            headers: getAuthHeaders()
        });
        
        const patients = await response.json();
        
        // Update both selects
        const selects = document.querySelectorAll('#patientSelectRecord, #patientSelectPrescription');
        selects.forEach(select => {
            if (select) {
                select.innerHTML = '<option value="">-- Choose a patient --</option>';
                patients.forEach(patient => {
                    const option = document.createElement('option');
                    option.value = patient.patient_id;
                    option.textContent = patient.name;
                    select.appendChild(option);
                });
            }
        });
    } catch (error) {
        console.error('Error loading patients for select:', error);
    }
}

// Create Medical Record
async function handleCreateRecord(e) {
    if (e) e.preventDefault();
    
    const patientId = document.getElementById('patientSelectRecord').value;
    const diagnosis = document.getElementById('diagnosis').value;
    const symptoms = document.getElementById('symptoms').value;
    const treatmentPlan = document.getElementById('treatmentPlan').value;
    const doctorId = localStorage.getItem('userId');
    
    if (!patientId || !diagnosis || !symptoms || !treatmentPlan) {
        showNotification('Please fill all fields', 'error');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE_URL}/medical-records`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                patient_id: parseInt(patientId),
                doctor_id: parseInt(doctorId),
                diagnosis: diagnosis,
                symptoms: symptoms,
                treatment_plan: treatmentPlan
            })
        });
        
        if (response.ok) {
            showNotification('Medical record created!', 'success');
            document.getElementById('createRecordForm').reset();
            document.getElementById('createRecordModal').style.display = 'none';
        } else {
            const error = await response.json();
            showNotification(error.error || 'Failed to create record', 'error');
        }
    } catch (error) {
        console.error('Error creating record:', error);
        showNotification('Error creating record', 'error');
    }
}

// Issue Prescription
async function handleIssuePrescription(e) {
    if (e) e.preventDefault();
    
    const patientId = document.getElementById('patientSelectPrescription').value;
    const medication = document.getElementById('medication').value;
    const dosage = document.getElementById('dosage').value;
    const frequency = document.getElementById('frequency').value;
    const duration = document.getElementById('duration').value;
    const doctorId = localStorage.getItem('userId');
    
    if (!patientId || !medication || !dosage || !frequency || !duration) {
        showNotification('Please fill all fields', 'error');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE_URL}/prescriptions`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                patient_id: parseInt(patientId),
                doctor_id: parseInt(doctorId),
                medication: medication,
                dosage: dosage,
                frequency: frequency,
                duration: duration
            })
        });
        
        if (response.ok) {
            showNotification('Prescription issued!', 'success');
            document.getElementById('issuePrescriptionForm').reset();
            document.getElementById('issuePrescriptionModal').style.display = 'none';
        } else {
            const error = await response.json();
            showNotification(error.error || 'Failed to issue prescription', 'error');
        }
    } catch (error) {
        console.error('Error issuing prescription:', error);
        showNotification('Error issuing prescription', 'error');
    }
}

// Create Task
async function handleCreateTask(e) {
    if (e) e.preventDefault();
    
    const taskTitle = document.getElementById('taskTitle').value;
    const taskDueDate = document.getElementById('taskDueDate').value;
    const doctorId = localStorage.getItem('userId');
    
    if (!taskTitle || !taskDueDate) {
        showNotification('Please fill all fields', 'error');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE_URL}/tasks`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                title: taskTitle,
                assigned_to: parseInt(doctorId),
                due_date: taskDueDate,
                status: 'Pending'
            })
        });
        
        if (response.ok) {
            showNotification('Task created!', 'success');
            document.getElementById('createTaskForm').reset();
            document.getElementById('createTaskModal').style.display = 'none';
            await loadTasks();
        } else {
            const error = await response.json();
            showNotification(error.error || 'Failed to create task', 'error');
        }
    } catch (error) {
        console.error('Error creating task:', error);
        showNotification('Error creating task', 'error');
    }
}

// ==================== PROFILE ====================
function setupProfileSection() {
    const editBtn = document.getElementById('editProfileBtn');
    if (editBtn) {
        editBtn.addEventListener('click', () => {
            showNotification('Profile editing coming soon', 'success');
        });
    }
}