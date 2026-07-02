// ==================== API CONFIGURATION ====================
const API_BASE_URL = '/api';

// ==================== UTILITY FUNCTIONS ====================
function getAuthHeaders() {
    const token = localStorage.getItem('token');
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    };
}

function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 1rem 1.5rem;
        background: ${type === 'success' ? '#4caf50' : '#f44336'};
        color: white;
        border-radius: 8px;
        z-index: 9999;
    `;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
}

// ==================== DASHBOARD STATISTICS ====================
async function loadDashboardStats() {
    try {
        const response = await fetch(`${API_BASE_URL}/dashboard/stats`);
        const stats = await response.json();
        
        if (document.getElementById('totalPatients')) {
            document.getElementById('totalPatients').textContent = stats.total_patients || 0;
        }
        if (document.getElementById('todayAppointments')) {
            document.getElementById('todayAppointments').textContent = stats.today_appointments || 0;
        }
        if (document.getElementById('doctorsAvailable')) {
            document.getElementById('doctorsAvailable').textContent = stats.doctors_available || 0;
        }
        if (document.getElementById('pendingTasks')) {
            document.getElementById('pendingTasks').textContent = stats.pending_tasks || 0;
        }
    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

// ==================== MODAL HANDLING ====================
function setupModalHandlers() {
    const modals = document.querySelectorAll('.modal');
    modals.forEach(modal => {
        const closeBtn = modal.querySelector('.close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                modal.style.display = 'none';
            });
        }
    });

    window.addEventListener('click', (event) => {
        if (event.target.classList.contains('modal')) {
            event.target.style.display = 'none';
        }
    });
}

// ==================== PATIENT FORM HANDLING ====================
const patientForm = document.getElementById('patientForm');
if (patientForm) {
    patientForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const formData = {
            name: document.getElementById('patientName').value,
            email: document.getElementById('patientEmail').value,
            phone: document.getElementById('patientPhone').value,
            dob: document.getElementById('patientDOB').value
        };

        try {
            const response = await fetch(`${API_BASE_URL}/patients`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify(formData)
            });

            if (response.ok) {
                showNotification('Patient registered successfully!', 'success');
                patientForm.reset();
                document.getElementById('patientModal').style.display = 'none';
                loadDashboardStats();
            } else {
                showNotification('Error registering patient', 'error');
            }
        } catch (error) {
            console.error('Error:', error);
            showNotification('An error occurred', 'error');
        }
    });
}

// ==================== MODAL BUTTON HANDLERS ====================
const patientModal = document.getElementById('patientModal');
const newPatientBtn = document.getElementById('newPatientBtn');

if (newPatientBtn && patientModal) {
    newPatientBtn.addEventListener('click', () => {
        patientModal.style.display = 'block';
    });
}

// ==================== INITIALIZATION ====================
document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('token');
    
    // Setup modal handlers
    setupModalHandlers();

    // Load stats
    loadDashboardStats();

    // Setup logout buttons
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            localStorage.clear();
            window.location.href = 'login.html';
        });
    }
});
document.getElementById('scheduleAppointmentBtn').addEventListener('click', () => {
    alert('Appointment scheduling module - Coming soon!');
});

document.getElementById('viewRecordsBtn').addEventListener('click', () => {
    alert('Medical records viewer - Coming soon!');
});

// ==================== NAVIGATION LINKS ====================
document.addEventListener('DOMContentLoaded', () => {
    setupNavigation();
});

function setupNavigation() {
    const navLinks = document.querySelectorAll('.nav-link');
    
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const text = link.textContent.trim().toLowerCase();
            
            // Check if user is logged in
            const token = localStorage.getItem('token');
            const userRole = localStorage.getItem('userRole');
            
            if (!token) {
                window.location.href = 'login.html';
                return;
            }
            
            switch(text) {
                case 'home':
                    window.location.href = 'index.html';
                    break;
                case 'patients':
                    window.location.href = userRole === 'doctor' ? 'doctor-dashboard.html' : 'patient-dashboard.html';
                    break;
                case 'appointments':
                    window.location.href = 'patient-dashboard.html';
                    break;
                case 'doctors':
                    window.location.href = userRole === 'doctor' ? 'doctor-dashboard.html' : 'patient-dashboard.html';
                    break;
                case 'logout':
                    logout();
                    break;
            }
        });
    });
}

function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('userId');
    localStorage.removeItem('userRole');
    window.location.href = 'login.html';
}

// ==================== PAGE INITIALIZATION ====================
document.addEventListener('DOMContentLoaded', () => {
    setupNavigation();
    loadDashboardData();
    
    // Refresh data every 30 seconds
    setInterval(loadDashboardData, 30000);
});

// ==================== UTILITY FUNCTIONS ====================
function formatDate(date) {
    const options = { year: 'numeric', month: 'long', day: 'numeric' };
    return new Date(date).toLocaleDateString('en-US', options);
}

function validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 3000);
}
