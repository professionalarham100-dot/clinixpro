// ==================== SUPPORT PAGE SCRIPTS ====================
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

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    initializeFAQ();
    initializeSearch();
    initializeForm();
    initializeContactButtons();
    applyClioPrefill();
    initializeKeyboardCards();
});

function initializeKeyboardCards() {
    const clickableCards = document.querySelectorAll('.option-card[onclick], .tutorial-card[onclick]');
    clickableCards.forEach((card) => {
        card.setAttribute('role', 'button');
        card.setAttribute('tabindex', '0');
        card.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                card.click();
            }
        });
    });
}

function setFieldError(fieldId, message) {
    const field = document.getElementById(fieldId);
    if (!field) return;
    field.style.borderColor = '#ff3333';
    field.style.boxShadow = '0 0 0 3px rgba(255, 51, 51, 0.12)';
    if (message) showNotification(message, 'error');
}

function clearFieldError(fieldId) {
    const field = document.getElementById(fieldId);
    if (!field) return;
    field.style.borderColor = '';
    field.style.boxShadow = '';
}

function scrollToSection(id) {
    const element = document.querySelector(id);
    if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

// ==================== FAQ Toggle Functionality ====================
function initializeFAQ() {
    const faqItems = document.querySelectorAll('.faq-item');
    
    faqItems.forEach(item => {
        const question = item.querySelector('.faq-question');
        
        question.addEventListener('click', function() {
            // Close other open items
            faqItems.forEach(otherItem => {
                if (otherItem !== item && otherItem.classList.contains('active')) {
                    otherItem.classList.remove('active');
                }
            });
            
            // Toggle current item
            item.classList.toggle('active');
        });
    });
}

// ==================== Search Functionality ====================
function initializeSearch() {
    const searchInput = document.getElementById('supportSearch');
    const faqItems = document.querySelectorAll('.faq-item');
    const guideCards = document.querySelectorAll('.guide-card');
    const troubleshootingCards = document.querySelectorAll('.troubleshooting-card');
    
    if (!searchInput) return;
    
    searchInput.addEventListener('input', function(e) {
        const searchTerm = e.target.value.toLowerCase();
        
        if (searchTerm === '') {
            // Show all items
            faqItems.forEach(item => item.style.display = '');
            guideCards.forEach(card => card.style.display = '');
            troubleshootingCards.forEach(card => card.style.display = '');
            return;
        }
        
        // Filter FAQ items
        faqItems.forEach(item => {
            const question = item.querySelector('h4').textContent.toLowerCase();
            const answer = item.querySelector('p').textContent.toLowerCase();
            
            if (question.includes(searchTerm) || answer.includes(searchTerm)) {
                item.style.display = '';
                item.classList.add('active');
            } else {
                item.style.display = 'none';
            }
        });
        
        // Filter guides
        guideCards.forEach(card => {
            const title = card.querySelector('h3').textContent.toLowerCase();
            const steps = card.querySelector('.guide-steps').textContent.toLowerCase();
            
            if (title.includes(searchTerm) || steps.includes(searchTerm)) {
                card.style.display = '';
            } else {
                card.style.display = 'none';
            }
        });
        
        // Filter troubleshooting
        troubleshootingCards.forEach(card => {
            const title = card.querySelector('h4').textContent.toLowerCase();
            const solutions = card.querySelector('.solution-list').textContent.toLowerCase();
            
            if (title.includes(searchTerm) || solutions.includes(searchTerm)) {
                card.style.display = '';
            } else {
                card.style.display = 'none';
            }
        });
    });
}

// ==================== Support Form Submission ====================
function initializeForm() {
    const supportForm = document.getElementById('supportForm');
    
    if (!supportForm) return;
    
    supportForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        const submitBtn = supportForm.querySelector('button[type="submit"]');
        const originalBtnHtml = submitBtn ? submitBtn.innerHTML : '';
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';
        }
        
        // Collect form data
        const formData = {
            name: document.getElementById('supportName').value,
            email: document.getElementById('supportEmail').value,
            phone: document.getElementById('supportPhone').value,
            category: document.getElementById('supportCategory').value,
            subject: document.getElementById('supportSubject').value,
            message: document.getElementById('supportMessage').value,
            timestamp: new Date().toISOString()
        };
        
        // Validate form
        if (!validateForm(formData)) {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalBtnHtml;
            }
            return;
        }
        
        try {
            const response = await fetch(`${API_BASE_URL}/support/tickets`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok || payload.success === false) {
                throw new Error(payload.message || payload.error || 'Unable to submit support ticket.');
            }
            showNotification('Ticket submitted successfully. We will contact you soon with an update.', 'success');
            supportForm.reset();
        } catch (error) {
            showNotification((error.message || 'Unable to submit support ticket.') + ' Please try again or email support@clinixpro.com.', 'error');
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalBtnHtml;
            }
        }
    });
}

function applyClioPrefill() {
    const role = (localStorage.getItem('userRole') || localStorage.getItem('userType') || 'guest').toLowerCase();
    const userId = Number(localStorage.getItem('userId') || 0) || 0;
    const draftKey = `clinixpro_support_draft_${role}_${userId || "guest"}`;
    const raw = localStorage.getItem(draftKey);
    if (!raw) return;

    let draft = null;
    try {
        draft = JSON.parse(raw);
    } catch (_err) {
        return;
    }
    if (!draft) return;

    const nameInput = document.getElementById('supportName');
    const emailInput = document.getElementById('supportEmail');
    const categoryInput = document.getElementById('supportCategory');
    const subjectInput = document.getElementById('supportSubject');
    const messageInput = document.getElementById('supportMessage');

    if (nameInput && !nameInput.value.trim()) {
        nameInput.value = localStorage.getItem('userName') || localStorage.getItem('fullName') || '';
    }
    if (emailInput && !emailInput.value.trim()) {
        emailInput.value = localStorage.getItem('userEmail') || localStorage.getItem('email') || '';
    }
    if (categoryInput && draft.category) categoryInput.value = draft.category;
    if (subjectInput && draft.subject) subjectInput.value = draft.subject;
    if (messageInput && draft.message) messageInput.value = draft.message;

    localStorage.removeItem(draftKey);
    scrollToSection('#form');
    showNotification('Clio filled your support ticket draft. Review and submit.', 'info');
}

function validateForm(data) {
    ['supportName', 'supportEmail', 'supportCategory', 'supportSubject', 'supportMessage'].forEach(clearFieldError);

    if (!data.name.trim()) {
        setFieldError('supportName', 'Please enter your name');
        document.getElementById('supportName').focus();
        return false;
    }
    
    if (!data.email.trim()) {
        setFieldError('supportEmail', 'Please enter your email');
        document.getElementById('supportEmail').focus();
        return false;
    }
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(data.email)) {
        setFieldError('supportEmail', 'Please enter a valid email');
        document.getElementById('supportEmail').focus();
        return false;
    }
    
    if (!data.category) {
        setFieldError('supportCategory', 'Please select a category');
        document.getElementById('supportCategory').focus();
        return false;
    }
    
    if (!data.subject.trim()) {
        setFieldError('supportSubject', 'Please enter a subject');
        document.getElementById('supportSubject').focus();
        return false;
    }
    
    if (!data.message.trim()) {
        setFieldError('supportMessage', 'Please enter your message');
        document.getElementById('supportMessage').focus();
        return false;
    }
    
    return true;
}

// ==================== Contact Button Actions ====================
function initializeContactButtons() {
    // Call button
    const callButtons = document.querySelectorAll('[data-action="call"]');
    callButtons.forEach(btn => {
        btn.addEventListener('click', function() {
            window.location.href = 'tel:03486277022';
        });
    });
    
    // Email button
    const emailButtons = document.querySelectorAll('[data-action="email"]');
    emailButtons.forEach(btn => {
        btn.addEventListener('click', function() {
            window.location.href = 'mailto:support@clinixpro.com?subject=Support%20Request';
        });
    });
    
    // Chat button
    const chatButtons = document.querySelectorAll('[data-action="chat"]');
    chatButtons.forEach(btn => {
        btn.addEventListener('click', function() {
            openLiveChat();
        });
    });
    
    // Ticket button
    const ticketButtons = document.querySelectorAll('[data-action="ticket"]');
    ticketButtons.forEach(btn => {
        btn.addEventListener('click', function() {
            scrollToSection('#contact');
            scrollToSection('#form');
        });
    });
}

function openLiveChat() {
    showNotification('Live chat opening... (Feature coming soon)', 'info');
    // In production, integrate with services like Intercom, Zendesk, etc.
}

// ==================== Notification System ====================
function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <div class="notification-content">
            <i class="fas fa-${getNotificationIcon(type)}"></i>
            <span>${message}</span>
        </div>
        <button class="notification-close" onclick="this.parentElement.remove()">
            <i class="fas fa-times"></i>
        </button>
    `;
    
    // Add styles if not exists
    addNotificationStyles();
    
    // Add to body
    document.body.appendChild(notification);
    
    // Auto remove after 4 seconds
    setTimeout(() => {
        if (notification.parentElement) {
            notification.remove();
        }
    }, 4000);
}

function getNotificationIcon(type) {
    const icons = {
        'success': 'check-circle',
        'error': 'exclamation-circle',
        'info': 'info-circle',
        'warning': 'warning'
    };
    return icons[type] || 'info-circle';
}

function addNotificationStyles() {
    if (document.getElementById('notificationStyles')) return;
    
    const style = document.createElement('style');
    style.id = 'notificationStyles';
    style.textContent = `
        .notification {
            position: fixed;
            top: 20px;
            right: 20px;
            background: white;
            padding: 1rem 1.5rem;
            border-radius: 8px;
            box-shadow: 0 12px 40px rgba(0, 0, 0, 0.15);
            z-index: 9999;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 1rem;
            animation: slideIn 0.3s ease-out;
            max-width: 400px;
        }
        
        @keyframes slideIn {
            from {
                transform: translateX(400px);
                opacity: 0;
            }
            to {
                transform: translateX(0);
                opacity: 1;
            }
        }
        
        .notification-success {
            border-left: 4px solid #4caf50;
        }
        
        .notification-success .notification-content i {
            color: #4caf50;
        }
        
        .notification-error {
            border-left: 4px solid #ff3333;
        }
        
        .notification-error .notification-content i {
            color: #ff3333;
        }
        
        .notification-info {
            border-left: 4px solid #2196f3;
        }
        
        .notification-info .notification-content i {
            color: #2196f3;
        }
        
        .notification-warning {
            border-left: 4px solid #ffa500;
        }
        
        .notification-warning .notification-content i {
            color: #ffa500;
        }
        
        .notification-content {
            display: flex;
            align-items: center;
            gap: 0.75rem;
        }
        
        .notification-content i {
            font-size: 1.3rem;
        }
        
        .notification-close {
            background: none;
            border: none;
            cursor: pointer;
            color: #90a4ae;
            font-size: 1.2rem;
            transition: color 0.2s;
        }
        
        .notification-close:hover {
            color: #263238;
        }
        
        @media (max-width: 640px) {
            .notification {
                right: 10px;
                left: 10px;
                max-width: none;
            }
        }
    `;
    document.head.appendChild(style);
}

// ==================== Smooth Scrolling ====================
document.addEventListener('DOMContentLoaded', function() {
    const links = document.querySelectorAll('a[href^="#"]');
    
    links.forEach(link => {
        link.addEventListener('click', function(e) {
            const href = this.getAttribute('href');
            
            if (href === '#') return;
            
            e.preventDefault();
            
            const target = document.querySelector(href);
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });
});

// ==================== Page Performance Tracking ====================
function trackPagePerformance() {
    if (window.performance && window.performance.timing) {
        const perfData = window.performance.timing;
        const pageLoadTime = perfData.loadEventEnd - perfData.navigationStart;
        console.log('Page load time:', pageLoadTime + 'ms');
    }
}

window.addEventListener('load', trackPagePerformance);

// ==================== Accessibility ====================
document.addEventListener('keydown', function(e) {
    // Close FAQ on Escape key
    if (e.key === 'Escape') {
        document.querySelectorAll('.faq-item.active').forEach(item => {
            item.classList.remove('active');
        });
    }
});
