function getBackendOrigin() {
    const origin = window.location.origin || 'http://localhost:5000';
    try {
        const url = new URL(origin);
        if ((url.hostname === 'localhost' || url.hostname === '127.0.0.1') && url.port && url.port !== '5000') {
            return `${url.protocol}//${url.hostname}:5000`;
        }
    } catch (_e) {}
    return origin;
}
const API_BASE_URL = `${getBackendOrigin()}/api`;
let appointmentRefreshInterval = null;

document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    setupNav();
    loadData();
    
    // Set up real-time refresh for appointments every 5 seconds
    appointmentRefreshInterval = setInterval(() => {
        const activeSection = document.querySelector('.section[style*="display: block"]');
        if (activeSection && activeSection.id === 'appointments') {
            loadAppointments();
        }
    }, 5000);
});

function setupNav() {
    const links = document.querySelectorAll('.nav-link');
    links.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const txt = link.textContent.trim().toLowerCase();
            if (txt === 'home' || txt === 'dashboard') switchSection('dashboard');
            else if (txt === 'appointments') { switchSection('appointments'); loadAppointments(); }
            else if (txt === 'medical records') { switchSection('records'); loadRecords(); }
            else if (txt === 'prescriptions') { switchSection('prescriptions'); loadRx(); }
            else if (txt === 'billing') { switchSection('billing'); loadBill(); }
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
    document.getElementById('patientName').textContent = localStorage.getItem('userName') || 'Patient';
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
        
        const res = await fetch(`${API_BASE_URL}/patient/appointments`, {
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
                const statusBadge = a.status ? `<span class="badge badge-${a.status.toLowerCase()}">${a.status}</span>` : '';
                list.innerHTML += `
                    <div class="card">
                        <h3>${a.doctor_name || 'Dr. ' + a.doctor_id}</h3>
                        <p><strong>Date:</strong> ${a.date}</p>
                        <p><strong>Time:</strong> ${a.time}</p>
                        <p><strong>Reason:</strong> ${a.reason}</p>
                        ${statusBadge}
                    </div>
                `;
            });
        } else {
            list.innerHTML = '<div class="card"><p>No appointments scheduled yet</p></div>';
        }
    } catch (e) { 
        console.error('Error loading appointments:', e);
        const list = document.getElementById('appointmentsList');
        if (list) list.innerHTML = '<div class="card"><p>Error loading appointments</p></div>';
    }
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
                list.innerHTML += `<div class="card"><h3>${r.type}</h3><p>${r.date} - ${r.notes}</p></div>`;
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
                list.innerHTML += `<div class="card"><h3>${p.medicine}</h3><p>${p.dosage} - ${p.frequency}</p></div>`;
            });
        } else {
            list.innerHTML = '<p>No prescriptions</p>';
        }
    } catch (e) { console.error(e); }
}

async function loadBill() {
    try {
        const res = await fetch(`${API_BASE_URL}/billing`);
        const data = await res.json();
        const list = document.getElementById('billingList');
        if (!list) return;
        list.innerHTML = '';
        if (data.success && data.data.length > 0) {
            data.data.forEach(b => {
                list.innerHTML += `<div class="card"><h3>${b.description}</h3><p>RS ${b.amount} - ${b.status}</p></div>`;
            });
        } else {
            list.innerHTML = '<p>No billing</p>';
        }
    } catch (e) { console.error(e); }
}

function checkAuth() {
    const token = localStorage.getItem('token');
    if (!token) {
        localStorage.setItem('userId', '1');
        localStorage.setItem('userName', 'Patient');
    }
}
