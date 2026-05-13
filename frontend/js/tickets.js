// ==================== SUPPORT TICKETS MANAGEMENT ====================

let currentTickets = [];
let filteredTickets = [];
let selectedTicket = null;

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    loadTickets();
    initializeFilters();
    updateStats();
});

// ==================== Load Tickets from LocalStorage ====================
function loadTickets() {
    const ticketsList = document.getElementById('ticketsList');
    if (ticketsList) {
        ticketsList.style.display = 'flex';
        ticketsList.innerHTML = '<div class="ticket-item" style="justify-content:center; color:#64748b;">Loading tickets...</div>';
    }

    // Load from localStorage
    const saved = localStorage.getItem('supportTickets');
    try {
        currentTickets = saved ? JSON.parse(saved) : [];
    } catch (_err) {
        currentTickets = [];
        localStorage.removeItem('supportTickets');
        showNotification('Ticket data was invalid and has been reset.', 'warning');
    }
    
    // If no tickets, create sample tickets for demo
    if (currentTickets.length === 0) {
        createSampleTickets();
    }
    
    filteredTickets = [...currentTickets];
    renderTickets();
}

function createSampleTickets() {
    const samples = [
        {
            id: 'TKT-2024001',
            subject: 'Unable to book appointment',
            category: 'technical',
            status: 'open',
            priority: 'high',
            createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toLocaleString(),
            updatedAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toLocaleString(),
            description: 'I\'m trying to book an appointment with Dr. Ahmed, but the system keeps showing an error message. I\'ve tried multiple times and different browsers, but the issue persists.',
            email: 'patient@example.com',
            messages: [
                {
                    author: 'You',
                    date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toLocaleString(),
                    content: 'I\'m trying to book an appointment with Dr. Ahmed, but the system keeps showing an error message.'
                },
                {
                    author: 'Support Team',
                    date: new Date(Date.now() - 1.5 * 24 * 60 * 60 * 1000).toLocaleString(),
                    content: 'Thank you for contacting us. We\'re looking into this issue. Could you please provide the error message you\'re seeing?',
                    isSupport: true
                }
            ]
        },
        {
            id: 'TKT-2024002',
            subject: 'Payment method issue',
            category: 'billing',
            status: 'in-progress',
            priority: 'medium',
            createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toLocaleString(),
            updatedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toLocaleString(),
            description: 'My credit card payment was declined even though I have sufficient balance. The card works on other websites. Please help me resolve this.',
            email: 'user@example.com',
            messages: [
                {
                    author: 'You',
                    date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toLocaleString(),
                    content: 'My credit card payment was declined'
                }
            ]
        },
        {
            id: 'TKT-2024003',
            subject: 'Request for new feature',
            category: 'feature',
            status: 'resolved',
            priority: 'low',
            createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toLocaleString(),
            updatedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toLocaleString(),
            description: 'Would it be possible to add voice call functionality between patients and doctors? This would be very helpful for consultations.',
            email: 'suggestion@example.com',
            messages: [
                {
                    author: 'You',
                    date: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toLocaleString(),
                    content: 'Would it be possible to add voice call functionality?'
                },
                {
                    author: 'Support Team',
                    date: new Date(Date.now() - 9 * 24 * 60 * 60 * 1000).toLocaleString(),
                    content: 'Great suggestion! This is on our roadmap for Q3 2024. We\'ll keep you updated!',
                    isSupport: true
                }
            ]
        }
    ];
    
    currentTickets = samples;
    localStorage.setItem('supportTickets', JSON.stringify(currentTickets));
}

// ==================== Render Tickets ====================
function renderTickets() {
    const ticketsList = document.getElementById('ticketsList');
    const emptyState = document.getElementById('emptyState');
    const emptyTitle = emptyState ? emptyState.querySelector('h3') : null;
    const emptyText = emptyState ? emptyState.querySelector('p') : null;
    
    if (filteredTickets.length === 0) {
        ticketsList.style.display = 'none';
        emptyState.style.display = 'block';
        if (currentTickets.length === 0) {
            if (emptyTitle) emptyTitle.textContent = 'No Support Tickets Yet';
            if (emptyText) emptyText.textContent = "You haven't created any support tickets. Create one to get help from our team.";
        } else {
            if (emptyTitle) emptyTitle.textContent = 'No Matching Tickets';
            if (emptyText) emptyText.textContent = 'No tickets match your current search/filter. Try clearing filters.';
        }
        return;
    }
    
    ticketsList.style.display = 'flex';
    emptyState.style.display = 'none';
    ticketsList.innerHTML = '';
    
    filteredTickets.forEach(ticket => {
        const ticketElement = createTicketElement(ticket);
        ticketsList.appendChild(ticketElement);
    });
}

function createTicketElement(ticket) {
    const div = document.createElement('div');
    div.className = 'ticket-item';
    div.setAttribute('role', 'button');
    div.setAttribute('tabindex', '0');
    div.onclick = () => openTicketModal(ticket);
    div.onkeydown = (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openTicketModal(ticket);
        }
    };
    
    div.innerHTML = `
        <div class="ticket-info">
            <div class="ticket-header">
                <span class="ticket-id">${ticket.id}</span>
                <span class="ticket-subject">${escapeHtml(ticket.subject)}</span>
            </div>
            <div class="ticket-meta">
                <span>
                    <i class="fas fa-folder"></i>
                    <span class="ticket-category">${ticket.category}</span>
                </span>
                <span>
                    <i class="fas fa-calendar"></i>
                    ${new Date(ticket.createdAt).toLocaleDateString()}
                </span>
                <span>
                    <i class="fas fa-clock"></i>
                    ${getTimeAgo(ticket.updatedAt)}
                </span>
            </div>
        </div>
        <div style="display: flex; gap: 1rem; align-items: center;">
            <span class="ticket-status ${('status-' + ticket.status).replace('-', '-')}">${ticket.status.replace('-', ' ')}</span>
            <span class="ticket-priority ${('priority-' + ticket.priority).replace('-', '-')}">${ticket.priority}</span>
            <i class="fas fa-chevron-right ticket-arrow"></i>
        </div>
    `;
    
    return div;
}

// ==================== Modal Functions ====================
function openTicketModal(ticket) {
    selectedTicket = ticket;
    const modal = document.getElementById('ticketModal');
    
    document.getElementById('modalTicketId').textContent = ticket.id;
    document.getElementById('modalTicketSubject').textContent = ticket.subject;
    document.getElementById('modalStatus').innerHTML = `<span class="ticket-status status-${ticket.status}">${ticket.status}</span>`;
    document.getElementById('modalCategory').textContent = ticket.category;
    document.getElementById('modalPriority').innerHTML = `<span class="ticket-priority priority-${ticket.priority}">${ticket.priority}</span>`;
    document.getElementById('modalCreated').textContent = new Date(ticket.createdAt).toLocaleString();
    document.getElementById('modalDescription').textContent = ticket.description;
    
    // Render conversation thread
    renderConversationThread(ticket.messages || []);
    
    // Update reply button visibility
    if (ticket.status === 'closed') {
        document.getElementById('replyBtn').style.display = 'none';
        document.getElementById('replySection').style.display = 'none';
    } else {
        document.getElementById('replyBtn').style.display = 'block';
        document.getElementById('replySection').style.display = 'block';
    }
    
    modal.classList.add('active');
}

function closeTicketModal() {
    document.getElementById('ticketModal').classList.remove('active');
    document.getElementById('replyForm').reset();
    selectedTicket = null;
}

function renderConversationThread(messages) {
    const thread = document.getElementById('conversationThread');
    thread.innerHTML = '';
    
    messages.forEach(message => {
        const msgDiv = document.createElement('div');
        msgDiv.className = `message ${message.isSupport ? 'from-support' : ''}`;
        msgDiv.innerHTML = `
            <div class="message-header">
                <span class="message-author">${escapeHtml(message.author)}</span>
                <span class="message-date">${message.date}</span>
            </div>
            <div class="message-content">${escapeHtml(message.content)}</div>
        `;
        thread.appendChild(msgDiv);
    });
}

function scrollToReply() {
    document.getElementById('replySection').scrollIntoView({ behavior: 'smooth' });
    document.getElementById('replyMessage').focus();
}

// ==================== Reply Form ====================
document.addEventListener('DOMContentLoaded', function() {
    const replyForm = document.getElementById('replyForm');
    if (replyForm) {
        replyForm.addEventListener('submit', function(e) {
            e.preventDefault();
            submitReply();
        });
    }
});

function submitReply() {
    if (!selectedTicket) return;
    
    const message = document.getElementById('replyMessage').value.trim();
    
    if (!message) {
        showNotification('Please enter a message', 'error');
        return;
    }
    
    // Add message to ticket
    if (!selectedTicket.messages) {
        selectedTicket.messages = [];
    }
    
    selectedTicket.messages.push({
        author: 'You',
        date: new Date().toLocaleString(),
        content: message
    });
    
    // Update ticket in the array
    const index = currentTickets.findIndex(t => t.id === selectedTicket.id);
    if (index !== -1) {
        currentTickets[index] = selectedTicket;
        currentTickets[index].updatedAt = new Date().toLocaleString();
        localStorage.setItem('supportTickets', JSON.stringify(currentTickets));
    }
    
    // Re-render
    renderConversationThread(selectedTicket.messages);
    document.getElementById('replyForm').reset();
    
    showNotification('Reply sent successfully!', 'success');
}

function closeTicket() {
    if (!selectedTicket) return;
    
    if (confirm('Are you sure you want to close this ticket?')) {
        const index = currentTickets.findIndex(t => t.id === selectedTicket.id);
        if (index !== -1) {
            currentTickets[index].status = 'closed';
            localStorage.setItem('supportTickets', JSON.stringify(currentTickets));
            loadTickets();
            closeTicketModal();
            showNotification('Ticket closed successfully', 'success');
        }
    }
}

// ==================== Filters ====================
function initializeFilters() {
    document.getElementById('ticketSearch').addEventListener('input', applyFilters);
    document.getElementById('statusFilter').addEventListener('change', applyFilters);
    document.getElementById('categoryFilter').addEventListener('change', applyFilters);
    document.getElementById('sortFilter').addEventListener('change', applyFilters);
}

function applyFilters() {
    const searchTerm = document.getElementById('ticketSearch').value.toLowerCase();
    const statusFilter = document.getElementById('statusFilter').value;
    const categoryFilter = document.getElementById('categoryFilter').value;
    const sortBy = document.getElementById('sortFilter').value;
    
    // Filter tickets
    filteredTickets = currentTickets.filter(ticket => {
        const matchesSearch = 
            ticket.id.toLowerCase().includes(searchTerm) ||
            ticket.subject.toLowerCase().includes(searchTerm) ||
            ticket.description.toLowerCase().includes(searchTerm);
        
        const matchesStatus = !statusFilter || ticket.status === statusFilter;
        const matchesCategory = !categoryFilter || ticket.category === categoryFilter;
        
        return matchesSearch && matchesStatus && matchesCategory;
    });
    
    // Sort tickets
    switch(sortBy) {
        case 'newest':
            filteredTickets.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            break;
        case 'oldest':
            filteredTickets.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
            break;
        case 'updated':
            filteredTickets.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
            break;
        case 'priority':
            const priorityOrder = { high: 0, medium: 1, low: 2 };
            filteredTickets.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
            break;
    }
    
    renderTickets();
}

// ==================== Stats Update ====================
function updateStats() {
    const total = currentTickets.length;
    const open = currentTickets.filter(t => t.status === 'open').length;
    const inProgress = currentTickets.filter(t => t.status === 'in-progress').length;
    const resolved = currentTickets.filter(t => t.status === 'resolved').length;
    
    document.getElementById('totalTickets').textContent = total;
    document.getElementById('openTickets').textContent = open;
    document.getElementById('inProgressTickets').textContent = inProgress;
    document.getElementById('resolvedTickets').textContent = resolved;
}

// ==================== Utility Functions ====================
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function getTimeAgo(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);
    
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago';
    if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago';
    if (seconds < 604800) return Math.floor(seconds / 86400) + 'd ago';
    
    return date.toLocaleDateString();
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <div class="notification-content">
            <i class="fas fa-${getNotificationIcon(type)}"></i>
            <span>${message}</span>
        </div>
    `;
    
    addNotificationStyles();
    document.body.appendChild(notification);
    
    setTimeout(() => notification.remove(), 3000);
}

function getNotificationIcon(type) {
    const icons = {
        'success': 'check-circle',
        'error': 'exclamation-circle',
        'info': 'info-circle'
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
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 9999;
            animation: slideIn 0.3s ease-out;
        }
        
        .notification-success { border-left: 4px solid #4caf50; }
        .notification-error { border-left: 4px solid #ff3333; }
        .notification-info { border-left: 4px solid #2196f3; }
        
        .notification-content {
            display: flex;
            align-items: center;
            gap: 0.75rem;
        }
        
        @keyframes slideIn {
            from { transform: translateX(400px); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
    `;
    document.head.appendChild(style);
}

// Close modal when clicking outside
window.onclick = function(event) {
    const modal = document.getElementById('ticketModal');
    if (event.target === modal) {
        closeTicketModal();
    }
};
