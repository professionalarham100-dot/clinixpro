const API_BASE_URL = (window.location.port === '5000' ? '' : 'http://127.0.0.1:5000') + '/api';
let appointmentRefreshInterval = null;

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
}

document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    setupNav();
    loadData();
    
    // Set up real-time refresh for appointments every 3 seconds (faster for doctor monitoring)
    appointmentRefreshInterval = setInterval(() => {
        const activeSection = document.querySelector('.section[style*="display: block"]');
        if (activeSection && activeSection.id === 'appointments') {
            loadAppointments();
        }
    }, 3000);
});

function setupNav() {
    const links = document.querySelectorAll('.nav-link');
    links.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const txt = link.textContent.trim().toLowerCase();
            if (txt === 'home' || txt === 'dashboard') switchSection('dashboard');
            else if (txt === 'appointments') { switchSection('appointments'); loadAppointments(); }
            else if (txt === 'patients') { switchSection('patients'); loadPatients(); }
            else if (txt === 'medical records') { switchSection('records'); loadRecords(); }
            else if (txt === 'prescriptions') { switchSection('prescriptions'); loadRx(); }
            else if (txt === 'tasks') { switchSection('tasks'); loadTasks(); }
            else if (txt === 'logout') { 
                if (confirm('Logout?')) { 
                    if (appointmentRefreshInterval) clearInterval(appointmentRefreshInterval);
                    localStorage.clear(); 
                    window.location.href = 'login.html'; 
                } 
            }
        });
    });
}

function switchSection(id) {
    document.querySelectorAll('.section').forEach(s => { s.style.display = 'none'; });
    const sec = document.getElementById(id);
    if (sec) sec.style.display = 'block';
}

function loadData() {
    loadStats();
    loadAppointments();
    document.getElementById('doctorName').textContent = localStorage.getItem('userName') || 'Doctor';
}

async function loadStats() {
    try {
        const res = await fetch(`${API_BASE_URL}/dashboard/stats`);
        const data = await res.json();
        if (data.success) {
            document.getElementById('totalPatients').textContent = data.total_patients || 0;
            document.getElementById('todayAppointments').textContent = data.today_appointments || 0;
            document.getElementById('doctorsAvailable').textContent = data.doctors_available || 0;
            document.getElementById('pendingTasks').textContent = data.pending_tasks || 0;
        }
    } catch (e) { console.error(e); }
}

async function loadAppointments() {
    try {
        const token = localStorage.getItem('token');
        if (!token) {
            console.error('No token found');
            return;
        }
        
        const res = await fetch(`${API_BASE_URL}/doctor/appointments`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        const data = await res.json();
        const list = document.getElementById('appointmentsList');
        if (!list) return;
        
        list.innerHTML = '';
        
        if (res.ok && data && data.length > 0) {
            data.forEach(a => {
                const statusClass = a.status ? escapeHtml(a.status.toLowerCase()) : 'pending';
                const statusBadge = a.status ? `<span class="badge badge-${statusClass}">${escapeHtml(a.status)}</span>` : '';
                list.innerHTML += `
                    <div class="card">
                        <h3>${escapeHtml(a.patient_name || 'Patient ' + a.patient_id)}</h3>
                        <p><strong>Date:</strong> ${escapeHtml(a.date)}</p>
                        <p><strong>Time:</strong> ${escapeHtml(a.time)}</p>
                        <p><strong>Reason:</strong> ${escapeHtml(a.reason)}</p>
                        ${statusBadge}
                    </div>
                `;
            });
        } else {
            list.innerHTML = '<div class="card"><p>No appointments assigned</p></div>';
        }
    } catch (e) { 
        console.error('Error loading appointments:', e);
        const list = document.getElementById('appointmentsList');
        if (list) list.innerHTML = '<div class="card"><p>Error loading appointments</p></div>';
    }
}

async function loadPatients() {
    try {
        const res = await fetch(`${API_BASE_URL}/patients`);
        const data = await res.json();
        const list = document.getElementById('patientsList');
        if (!list) return;
        list.innerHTML = '';
        if (data.success && data.data.length > 0) {
            data.data.forEach(p => {
                list.innerHTML += `<div class="card"><h3>${escapeHtml(p.name)}</h3><p>${escapeHtml(p.phone)} | ${escapeHtml(p.email)}</p><p>Blood: ${escapeHtml(p.blood_type)} | DOB: ${escapeHtml(p.dob)}</p></div>`;
            });
        } else {
            list.innerHTML = '<p>No patients</p>';
        }
    } catch (e) { console.error(e); }
}

async function loadRecords() {
    try {
        const res = await fetch(`${API_BASE_URL}/medical-records`);
        const data = await res.json();
        const list = document.getElementById('recordsList');
        if (!list) return;
        list.innerHTML = '';
        if (data.success && data.data.length > 0) {
            data.data.forEach(r => {
                list.innerHTML += `<div class="card"><h3>${escapeHtml(r.patient_name)} - ${escapeHtml(r.type)}</h3><p>${escapeHtml(r.date)}: ${escapeHtml(r.notes)}</p></div>`;
            });
        } else {
            list.innerHTML = '<p>No records</p>';
        }
    } catch (e) { console.error(e); }
}

async function loadRx() {
    try {
        const res = await fetch(`${API_BASE_URL}/prescriptions`);
        const data = await res.json();
        const list = document.getElementById('prescriptionsList');
        if (!list) return;
        list.innerHTML = '';
        if (data.success && data.data.length > 0) {
            data.data.forEach(p => {
                list.innerHTML += `<div class="card"><h3>${escapeHtml(p.patient_name)}</h3><p>${escapeHtml(p.medicine)} (${escapeHtml(p.dosage)}) - ${escapeHtml(p.frequency)}</p></div>`;
            });
        } else {
            list.innerHTML = '<p>No prescriptions</p>';
        }
    } catch (e) { console.error(e); }
}

async function loadTasks() {
    try {
        const res = await fetch(`${API_BASE_URL}/tasks`);
        const data = await res.json();
        const list = document.getElementById('tasksList');
        if (!list) return;
        list.innerHTML = '';
        if (data.success && data.data.length > 0) {
            data.data.forEach(t => {
                list.innerHTML += `<div class="card"><h3>${escapeHtml(t.title)}</h3><p>Priority: ${escapeHtml(t.priority)} | Status: <span class="${escapeHtml(t.status?.toLowerCase())}">${escapeHtml(t.status)}</span></p></div>`;
            });
        } else {
            list.innerHTML = '<p>No tasks</p>';
        }
    } catch (e) { console.error(e); }
}

function checkAuth() {
    const token = localStorage.getItem('token');
    if (!token) {
        localStorage.setItem('userId', '1');
        localStorage.setItem('userName', 'Dr. Ahmed Hassan');
    }
}
