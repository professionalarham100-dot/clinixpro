// ==================== CONFIGURATION ====================
const API_BASE_URL = (window.location.port === '5000' ? '' : 'http://127.0.0.1:5000') + '/api';

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
    
    // Load data when sections are activated
    const dashboardLink = document.querySelector('[onclick*="dashboard"]');
    if (dashboardLink) dashboardLink.addEventListener('click', loadDashboardData);
    
    // Auto-refresh messages every 5 seconds when on messages section
    setInterval(() => {
        const activeSection = document.querySelector('.section[style*="display: block"]');
        if (activeSection && activeSection.id === 'messages') {
            loadMessages();
        }
    }, 5000);
});

const PATIENT_SECTION_LOADERS = {
    appointments: () => loadAppointments(),
    records: () => loadMedicalRecords(),
    prescriptions: () => loadPrescriptions(),
    billing: () => loadBilling(),
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
            const loader = PATIENT_SECTION_LOADERS[sectionId];
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
        const userName = localStorage.getItem('userName') || 'Patient';
        document.getElementById('patientName').textContent = userName;
        
        // Load stats
        const statsRes = await fetch(`${API_BASE_URL}/dashboard/stats`, {
            headers: getAuthHeaders()
        });
        const stats = await statsRes.json();
        
        document.getElementById('upcomingAppointments').textContent = stats.upcoming_appointments || stats.today_appointments || 0;
        document.getElementById('totalRecords').textContent = stats.total_records || 0;
        document.getElementById('activePrescriptions').textContent = stats.active_prescriptions || 0;
        document.getElementById('pendingBills').textContent = stats.pending_bills || 0;
        
    } catch (error) {
        console.error('Error loading dashboard:', error);
    }
}

// ==================== APPOINTMENTS ====================
async function loadAppointments() {
    try {
        // Load appointments
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_BASE_URL}/patient/appointments`, {
            headers: getAuthHeaders()
        });
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const appointments = await response.json();
        const container = document.getElementById('appointmentsList');
        
        if (!container) return;
        
        container.innerHTML = '';
        
        if (!appointments || appointments.length === 0) {
            container.innerHTML = '<div class="card"><p style="text-align:center;">No appointments scheduled</p></div>';
        } else {
            appointments.forEach(apt => {
                const statusBadge = apt.status ? `<span class="badge badge-${escapeHtml(apt.status.toLowerCase())}">${escapeHtml(apt.status)}</span>` : '';
                const date = new Date(apt.appointment_date).toLocaleString();
                container.innerHTML += `
                    <div class="card">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <div>
                                <h3>📅 ${escapeHtml(apt.reason || 'Appointment')}</h3>
                                <p><strong>Doctor ID:</strong> #${escapeHtml(apt.doctor_id)}</p>
                                <p><strong>Date:</strong> ${escapeHtml(date)}</p>
                            </div>
                            ${statusBadge}
                        </div>
                    </div>
                `;
            });
        }
        
        // Load doctors for booking form
        loadDoctorsForBooking();
        
    } catch (error) {
        console.error('Error loading appointments:', error);
        const container = document.getElementById('appointmentsList');
        if (container) container.innerHTML = '<div class="card"><p style="color:red;">Error loading appointments</p></div>';
    }
}

async function loadDoctorsForBooking() {
    try {
        const response = await fetch(`${API_BASE_URL}/doctors`, {
            headers: getAuthHeaders()
        });
        
        const doctors = await response.json();
        const select = document.getElementById('doctorSelect');
        
        if (!select) return;
        
        select.innerHTML = '<option value="">-- Choose a doctor --</option>';
        
        doctors.forEach(doc => {
            const option = document.createElement('option');
            option.value = doc.doctor_id;
            option.textContent = `${doc.name} (${doc.specialty})`;
            select.appendChild(option);
        });
        
    } catch (error) {
        console.error('Error loading doctors:', error);
    }
}

async function bookAppointment(e) {
    e.preventDefault();
    
    const doctorId = document.getElementById('doctorSelect').value;
    const appointmentDate = document.getElementById('appointmentDate').value;
    const reason = document.getElementById('appointmentReason').value;
    const patientId = localStorage.getItem('userId');
    
    if (!doctorId || !appointmentDate || !reason) {
        showNotification('Please fill all fields', 'error');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE_URL}/appointments`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                patient_id: parseInt(patientId),
                doctor_id: parseInt(doctorId),
                appointment_date: appointmentDate,
                reason: reason,
                status: 'scheduled'
            })
        });
        
        if (response.ok) {
            showNotification('Appointment booked successfully!', 'success');
            document.getElementById('bookAppointmentForm').reset();
            
            // Close modal
            const modal = document.getElementById('bookAppointmentModal');
            if (modal) modal.style.display = 'none';
            
            // Reload appointments
            await loadAppointments();
        } else {
            const error = await response.json();
            showNotification(error.error || 'Failed to book appointment', 'error');
        }
    } catch (error) {
        console.error('Error booking appointment:', error);
        showNotification('Error booking appointment', 'error');
    }
}

// ==================== MEDICAL RECORDS ====================
async function loadMedicalRecords() {
    try {
        const patientId = localStorage.getItem('userId');
        const response = await fetch(`${API_BASE_URL}/medical-records?patient_id=${patientId}`, {
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

// ==================== PRESCRIPTIONS ====================
async function loadPrescriptions() {
    try {
        const patientId = localStorage.getItem('userId');
        const response = await fetch(`${API_BASE_URL}/prescriptions?patient_id=${patientId}`, {
            headers: getAuthHeaders()
        });
        
        const prescriptions = await response.json();
        const container = document.getElementById('prescriptionsList');
        
        if (!container) return;
        
        container.innerHTML = '';
        
        if (!prescriptions || prescriptions.length === 0) {
            container.innerHTML = '<div class="card"><p style="text-align:center;">No prescriptions</p></div>';
        } else {
            prescriptions.forEach(rx => {
                const date = new Date(rx.date_issued).toLocaleDateString();
                container.innerHTML += `
                    <div class="card">
                        <h3>💊 ${escapeHtml(rx.medication)}</h3>
                        <p><strong>Dosage:</strong> ${escapeHtml(rx.dosage)}</p>
                        <p><strong>Frequency:</strong> ${escapeHtml(rx.frequency || 'N/A')}</p>
                        <p><strong>Duration:</strong> ${escapeHtml(rx.duration || 'N/A')}</p>
                        <p><strong>Date Issued:</strong> ${escapeHtml(date)}</p>
                    </div>
                `;
            });
        }
    } catch (error) {
        console.error('Error loading prescriptions:', error);
        const container = document.getElementById('prescriptionsList');
        if (container) container.innerHTML = '<div class="card"><p style="color:red;">Error loading prescriptions</p></div>';
    }
}

// ==================== BILLING ====================
async function loadBilling() {
    try {
        const patientId = localStorage.getItem('userId');
        const response = await fetch(`${API_BASE_URL}/billing?patient_id=${patientId}`, {
            headers: getAuthHeaders()
        });
        
        const billings = await response.json();
        const container = document.getElementById('billingList');
        
        if (!container) return;
        
        container.innerHTML = '';
        
        if (!billings || billings.length === 0) {
            container.innerHTML = '<div class="card"><p style="text-align:center;">No billing records</p></div>';
        } else {
            billings.forEach(bill => {
                const date = new Date(bill.date).toLocaleDateString();
                const statusClass = bill.status === 'paid' ? 'badge-success' : 'badge-warning';
                container.innerHTML += `
                    <div class="card">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <div>
                                <h3>💰 ${escapeHtml(bill.description)}</h3>
                                <p><strong>Amount:</strong> Rs ${escapeHtml(bill.amount)}</p>
                                <p><strong>Date:</strong> ${escapeHtml(date)}</p>
                            </div>
                            <span class="badge ${statusClass}">${escapeHtml(bill.status)}</span>
                        </div>
                    </div>
                `;
            });
        }
    } catch (error) {
        console.error('Error loading billing:', error);
        const container = document.getElementById('billingList');
        if (container) container.innerHTML = '<div class="card"><p style="color:red;">Error loading billing</p></div>';
    }
}

// ==================== MESSAGING ====================
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
                                <p><strong>From:</strong> ${escapeHtml(msg.from_name)}</p>
                                <p style="margin:10px 0;">${escapeHtml(msg.message)}</p>
                                <p><strong>Date:</strong> ${escapeHtml(date)}</p>
                            </div>
                            <div style="display:flex; flex-direction:column; gap:10px;">
                                <span class="badge ${readClass}">${readText}</span>
                                <button class="btn btn-sm btn-primary" onclick="replyMessage(${escapeHtml(msg.from_user_id)}, '${escapedName}', '${escapedSubject}')">Reply</button>
                            </div>
                        </div>
                    </div>
                `;
            });
        }
    } catch (error) {
        console.error('Error loading messages:', error);
        const container = document.getElementById('messagesList');
        if (container) container.innerHTML = '<div class="card"><p style="color:red;">Error loading messages</p></div>';
    }
}

async function replyMessage(doctorId, doctorName, originalSubject) {
    const message = prompt(`Reply to ${doctorName} (Subject: ${originalSubject}):`);
    if (!message) return;
    
    try {
        const response = await fetch(`${API_BASE_URL}/messages`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                to_user_id: doctorId,
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

async function sendMessage() {
    const doctorSelect = document.getElementById('messageDoctorSelect');
    const toUserId = doctorSelect ? doctorSelect.value : null;
    const subject = document.getElementById('messageSubject').value;
    const message = document.getElementById('messageBody').value;
    
    if (!toUserId || !subject || !message) {
        showNotification('Please fill all fields', 'error');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE_URL}/messages`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                to_user_id: parseInt(toUserId),
                subject: subject,
                message: message
            })
        });
        
        if (response.ok) {
            showNotification('Message sent successfully!', 'success');
            document.getElementById('messageForm').reset();
            document.getElementById('sendMessageModal').style.display = 'none';
            await loadMessages();
        } else {
            const error = await response.json();
            showNotification(error.error || 'Failed to send message', 'error');
        }
    } catch (error) {
        console.error('Error sending message:', error);
        showNotification('Error sending message', 'error');
    }
}

async function loadDoctorsForMessaging() {
    try {
        const response = await fetch(`${API_BASE_URL}/doctors`, {
            headers: getAuthHeaders()
        });
        
        const doctors = await response.json();
        const select = document.getElementById('messageDoctorSelect');
        
        if (!select) return;
        
        select.innerHTML = '<option value="">-- Choose a doctor --</option>';
        
        doctors.forEach(doc => {
            const option = document.createElement('option');
            option.value = doc.doctor_id;
            option.textContent = `Dr. ${doc.name} (${doc.specialty})`;
            select.appendChild(option);
        });
        
    } catch (error) {
        console.error('Error loading doctors for messaging:', error);
    }
}

// ==================== MODALS ====================
function setupModals() {
    const modal = document.getElementById('bookAppointmentModal');
    
    // Open modal buttons
    const bookBtns = document.querySelectorAll('#bookAppointmentBtn, #bookAppointmentBtn2');
    bookBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            if (modal) {
                modal.style.display = 'block';
                loadDoctorsForBooking();
            }
        });
    });
    
    // Close button
    const closeBtn = modal ? modal.querySelector('.close') : null;
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            if (modal) modal.style.display = 'none';
        });
    }
    
    // Close on outside click
    window.addEventListener('click', (e) => {
        if (modal && e.target === modal) {
            modal.style.display = 'none';
        }
    });
}

function setupForms() {
    const form = document.getElementById('bookAppointmentForm');
    if (form) {
        form.addEventListener('submit', bookAppointment);
    }
    
    // Setup contact doctor button
    const contactBtn = document.getElementById('contactDoctorBtn');
    if (contactBtn) {
        contactBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const modal = document.getElementById('sendMessageModal');
            if (modal) {
                modal.style.display = 'block';
                // Load doctors in dropdown
                loadDoctorsForMessaging();
                // Clear previous values
                document.getElementById('messageSubject').value = '';
                document.getElementById('messageBody').value = '';
                document.getElementById('messageBody').focus();
            }
        });
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