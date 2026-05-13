# ClinicXPro Support System - Implementation Guide

## Overview
This guide explains how to integrate the new support features into your ClinicXPro application:
1. **Support Page** - FAQ, Guides, Troubleshooting
2. **Ticket Tracking** - User dashboard for support tickets
3. **Live Chat Widget** - Real-time chat for visitors
4. **Video Tutorials** - Educational videos library
5. **Backend API** - Support ticket and chat management

---

## 1. Support Page (support.html)
**File:** `frontend/support.html`

### Features:
- Quick search across all support content
- Expandable FAQ with 8 common questions
- Getting Started guides (4 tutorials)
- Troubleshooting cards for common issues
- Contact form for support inquiries
- Video tutorials section

### How to Use:
- Link from navigation: `<a href="support.html">Support</a>`
- Users can search, filter, and find answers
- Contact form saves support tickets to localStorage (or backend)

### Customization:
- Edit FAQ items in the HTML
- Update contact information
- Add more guide cards
- Modify email address: `support@clinicxpro.com`

---

## 2. Ticket Tracking Page (tickets.html)
**Files:** 
- `frontend/tickets.html`
- `frontend/css/tickets.css`
- `frontend/js/tickets.js`

### Features:
- View all support tickets with filtering
- Real-time ticket status updates
- Search by ticket ID, subject, or content
- Filter by status, category, priority
- View ticket details in modal
- Add replies to tickets
- Close tickets

### How to Use:
```html
<!-- Link in navigation -->
<a href="tickets.html">My Tickets</a>

<!-- Or from support page -->
<button onclick="window.location.href='tickets.html'">View My Tickets</button>
```

### Data Storage:
Currently uses localStorage. To use database:

1. Connect to backend API instead:
```javascript
// In js/tickets.js, update loadTickets():
async function loadTickets() {
    const email = localStorage.getItem('userEmail');
    const response = await fetch(`/api/support/tickets?email=${email}`);
    const data = await response.json();
    currentTickets = data.tickets || [];
    renderTickets();
}
```

2. Update form submission:
```javascript
function submitReply() {
    const response = await fetch(`/api/support/tickets/${selectedTicket.id}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            message: document.getElementById('replyMessage').value,
            author: 'Customer'
        })
    });
}
```

---

## 3. Live Chat Widget
**File:** `frontend/js/live-chat.js`

### Features:
- Floating chat button on every page
- Message history
- Quick reply buttons
- Online/offline status
- Unread message badge

### How to Initialize:

1. **Include in your HTML:**
```html
<script src="js/live-chat.js"></script>
```

2. **Auto-initializes with default config:**
```javascript
window.liveChat = new LiveChat({
    position: 'bottom-right',  // bottom-right, bottom-left, top-right
    title: 'ClinicXPro Support',
    subtitle: 'We usually reply within minutes',
    integrationProvider: 'custom',
    apiEndpoint: '/api/support/chat'
});
```

3. **For production, integrate with:**
   - **Intercom:** Replace `js/live-chat.js` with Intercom script
   - **Zendesk:** Use Zendesk Web Widget
   - **Firebase:** Use Firebase Realtime Database
   - **Custom:** Keep current implementation and connect to backend

### Customization:

Change position:
```javascript
new LiveChat({
    position: 'bottom-left'  // Different corner
});
```

Add to specific pages only:
```html
<!-- Only on support page -->
<script>
if (window.location.pathname.includes('support')) {
    // Initialize chat
    new LiveChat({ /* config */ });
}
</script>
```

---

## 4. Video Tutorials (tutorials.html)
**Files:**
- `frontend/tutorials.html`
- `frontend/css/tutorials.css`
- `frontend/js/tutorials.js`

### Features:
- Video library with 12 tutorials (customizable)
- Search and filter by category
- Featured tutorial section
- Video player with modal
- YouTube embed support
- Newsletter signup

### How to Use:

1. **Add to navigation:**
```html
<li><a href="tutorials.html">Tutorials</a></li>
```

2. **Add more videos** - Edit `frontend/js/tutorials.js`:
```javascript
const tutorials = [
    {
        id: 13,
        title: 'Your Tutorial Title',
        description: 'What it teaches',
        category: 'patients',  // getting-started, patients, doctors, advanced, troubleshooting
        duration: '5:30',
        views: '2.1K',
        rating: 4.8,
        videoId: 'YouTube_Video_ID',  // From youtube.com/watch?v=VIDEO_ID
        thumbnail: 'https://img.youtube.com/vi/VIDEO_ID/maxresdefault.jpg'
    }
];
```

3. **Get YouTube Video ID:**
   - Go to YouTube video
   - URL: `youtube.com/watch?v=jNQXAC9IVRw`
   - Video ID: `jNQXAC9IVRw`

---

## 5. Backend API Integration

### Setup Backend Endpoints

**File:** `backend/support_api.py`

### Step 1: Copy Code to app.py

1. Open `backend/app.py`
2. Add these imports at the top:
```python
from datetime import datetime
import json
import os
```

3. Copy the entire content from `backend/support_api.py`
4. Paste it at the end of `app.py` (before `if __name__ == '__main__'`)

### Step 2: Create Data Directory
```bash
mkdir -p backend/data
```

### Step 3: Test the APIs

**Create a Support Ticket:**
```bash
curl -X POST http://localhost:5000/api/support/tickets \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe",
    "email": "john@example.com",
    "phone": "03001234567",
    "category": "technical",
    "subject": "Cannot login",
    "message": "I am unable to login to my account",
    "priority": "high"
  }'
```

**List User Tickets:**
```bash
curl "http://localhost:5000/api/support/tickets?email=john@example.com&status=open"
```

**Get Specific Ticket:**
```bash
curl "http://localhost:5000/api/support/tickets/TKT-1234567890"
```

**Add Reply to Ticket:**
```bash
curl -X POST "http://localhost:5000/api/support/tickets/TKT-1234567890/reply" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "We are looking into this issue",
    "author": "Support"
  }'
```

**Send Chat Message:**
```bash
curl -X POST http://localhost:5000/api/support/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Hello, can you help me?",
    "sender": "anonymous",
    "sessionId": "session-123"
  }'
```

**Get Support Statistics:**
```bash
curl http://localhost:5000/api/support/stats
```

### Step 4: Connect Frontend to Backend

Update `frontend/js/support.js` form submission:
```javascript
async function handleContactForm(e) {
    e.preventDefault();
    
    const data = {
        name: document.getElementById('supportName').value,
        email: document.getElementById('supportEmail').value,
        phone: document.getElementById('supportPhone').value,
        category: document.getElementById('supportCategory').value,
        subject: document.getElementById('supportSubject').value,
        message: document.getElementById('supportMessage').value
    };
    
    try {
        const response = await fetch('/api/support/tickets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        
        const result = await response.json();
        
        if (result.success) {
            showNotification('Ticket created: ' + result.ticket_id, 'success');
            document.getElementById('supportForm').reset();
        }
    } catch (error) {
        showNotification('Error submitting form: ' + error.message, 'error');
    }
}
```

Update `frontend/js/live-chat.js`:
```javascript
// In sendToBackend() method, the endpoint is already configured:
sendToBackend(message) {
    fetch(this.config.apiEndpoint, {  // '/api/support/chat'
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message })
    })
    .then(res => res.json())
    .then(data => {
        this.addMessage(data.botResponse.message || 'Thanks for your message!', 'bot');
    })
    .catch(err => {
        console.error('Chat error:', err);
        this.addMessage('Sorry, something went wrong.', 'bot');
    });
}
```

---

## 6. Database Integration (Optional but Recommended)

For production, replace file storage with a database:

### Install SQLAlchemy:
```bash
pip install sqlalchemy flask-sqlalchemy
```

### Create Models (backend/models.py):
```python
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime

db = SQLAlchemy()

class SupportTicket(db.Model):
    __tablename__ = 'support_tickets'
    
    id = db.Column(db.String(50), primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    email = db.Column(db.String(100), nullable=False)
    phone = db.Column(db.String(20))
    category = db.Column(db.String(50), nullable=False)
    subject = db.Column(db.String(200), nullable=False)
    message = db.Column(db.Text, nullable=False)
    priority = db.Column(db.String(20), default='medium')
    status = db.Column(db.String(20), default='open')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class ChatMessage(db.Model):
    __tablename__ = 'chat_messages'
    
    id = db.Column(db.String(50), primary_key=True)
    session_id = db.Column(db.String(100), nullable=False)
    sender = db.Column(db.String(100), nullable=False)
    message = db.Column(db.Text, nullable=False)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)
```

### Update app.py:
```python
from flask_sqlalchemy import SQLAlchemy

app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///clinicxpro.db'
# Or for PostgreSQL:
# app.config['SQLALCHEMY_DATABASE_URI'] = 'postgresql://user:password@localhost/clinicxpro'

db = SQLAlchemy(app)
```

---

## 7. Email Service Integration (Recommended)

### Using SendGrid:

Install:
```bash
pip install sendgrid
```

Update `backend/support_api.py`:
```python
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail

def send_ticket_confirmation_email(ticket):
    sg = SendGridAPIClient('YOUR_SENDGRID_API_KEY')
    
    message = Mail(
        from_email='noreply@clinicxpro.com',
        to_emails=ticket['email'],
        subject=f'Support Ticket Created: {ticket["id"]}',
        plain_text_content=f'Your ticket has been created. Ticket ID: {ticket["id"]}'
    )
    
    try:
        sg.send(message)
    except Exception as e:
        print(f"Email error: {e}")
```

---

## 8. Testing Checklist

- [ ] Support page loads and displays FAQ
- [ ] FAQ items expand/collapse
- [ ] Search works on support page
- [ ] Contact form submits successfully
- [ ] Tickets page displays sample tickets
- [ ] Can filter tickets by status/category
- [ ] Can open ticket details modal
- [ ] Can add reply to ticket
- [ ] Live chat widget appears on pages
- [ ] Can send chat messages
- [ ] Chat responses appear
- [ ] Tutorials page loads with videos
- [ ] Can search tutorials
- [ ] Can filter by category
- [ ] Video player opens in modal
- [ ] Backend API endpoints respond correctly

---

## 9. Deployment Checklist

Before deploying to production:

- [ ] Set proper environment variables for API keys
- [ ] Set up database (not just file storage)
- [ ] Implement email service
- [ ] Set up SSL/HTTPS
- [ ] Add authentication to protected endpoints
- [ ] Rate limit API endpoints
- [ ] Add input validation
- [ ] Configure CORS properly
- [ ] Set up logging
- [ ] Test all features thoroughly
- [ ] Update documentation
- [ ] Set up automated backups

---

## 10. Common Issues & Solutions

### Issue: Chat widget not appearing
**Solution:** Check if `js/live-chat.js` is loaded in HTML

### Issue: API returns 404
**Solution:** Verify endpoints are added to `app.py` before running server

### Issue: Videos not playing
**Solution:** Check YouTube video IDs are correct

### Issue: Tickets not saving
**Solution:** Verify `backend/data/` directory exists and is writable

### Issue: CORS errors
**Solution:** Check CORS configuration in `app.py`

---

## Support & Future Enhancements

### Planned Features:
1. AI-powered chatbot responses
2. Ticket priority auto-assignment
3. SMS notifications
4. Multilingual support
5. Video call support
6. Mobile app integration

### Next Steps:
1. Deploy changes to production
2. Monitor support ticket volume
3. Gather user feedback
4. Optimize based on usage patterns
5. Add more tutorials as needed

---

**Need Help?**
- Check the browser console for errors
- Review backend logs: `tail -f backend/app.log`
- Test API endpoints with Postman
- Review Flask documentation: https://flask.palletsprojects.com/
