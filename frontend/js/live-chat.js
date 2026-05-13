// ==================== LIVE CHAT WIDGET ====================
// This file integrates a live chat interface into your website
// Supports multiple integrations: Intercom, Zendesk, Firebase, or custom backend

class LiveChat {
    constructor(config = {}) {
        this.config = {
            position: config.position || 'bottom-right',
            theme: config.theme || 'light',
            title: config.title || 'Chat with us',
            subtitle: config.subtitle || 'We typically reply in minutes',
            integrationProvider: config.integrationProvider || 'custom', // 'intercom', 'zendesk', 'firebase', 'custom'
            apiEndpoint: config.apiEndpoint || '/api/chat',
            ...config
        };
        
        this.isOpen = false;
        this.messages = [];
        this.init();
    }
    
    init() {
        this.createWidget();
        this.attachEventListeners();
    }
    
    createWidget() {
        // Create container
        const container = document.createElement('div');
        container.id = 'liveChatWidget';
        container.className = `live-chat-widget ${this.config.position}`;
        
        container.innerHTML = `
            <!-- Chat Button -->
            <button class="chat-toggle-btn" id="chatToggleBtn" aria-label="Open chat">
                <i class="fas fa-comments"></i>
                <span class="chat-badge" id="unreadBadge" style="display: none;">1</span>
            </button>
            
            <!-- Chat Window -->
            <div class="chat-window" id="chatWindow" style="display: none;">
                <!-- Header -->
                <div class="chat-header">
                    <div class="chat-header-content">
                        <h3>${this.config.title}</h3>
                        <p>${this.config.subtitle}</p>
                    </div>
                    <button class="chat-close-btn" id="chatCloseBtn" aria-label="Close chat">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                
                <!-- Messages Container -->
                <div class="chat-messages" id="chatMessages">
                    <div class="chat-message bot-message">
                        <div class="message-avatar">
                            <i class="fas fa-user-tie"></i>
                        </div>
                        <div class="message-content">
                            <p>Hi! 👋 How can we help you today?</p>
                            <span class="message-time">${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                    </div>
                </div>
                
                <!-- Quick Reply Options -->
                <div class="quick-replies" id="quickReplies">
                    <button class="quick-reply-btn" data-action="appointment">
                        <i class="fas fa-calendar"></i> Book Appointment
                    </button>
                    <button class="quick-reply-btn" data-action="billing">
                        <i class="fas fa-receipt"></i> Billing Help
                    </button>
                    <button class="quick-reply-btn" data-action="technical">
                        <i class="fas fa-tools"></i> Technical Support
                    </button>
                    <button class="quick-reply-btn" data-action="other">
                        <i class="fas fa-ellipsis-h"></i> Other
                    </button>
                </div>
                
                <!-- Input Area -->
                <div class="chat-input-area">
                    <div class="input-wrapper">
                        <input 
                            type="text" 
                            id="chatMessageInput" 
                            placeholder="Type your message..."
                            aria-label="Chat message input"
                        >
                        <button class="send-btn" id="sendMessageBtn" aria-label="Send message">
                            <i class="fas fa-paper-plane"></i>
                        </button>
                    </div>
                    <div class="chat-footer">
                        <p>We're online</p>
                        <div class="online-status">
                            <span class="status-dot"></span> Available
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(container);
        this.injectStyles();
    }
    
    injectStyles() {
        if (document.getElementById('liveChatStyles')) return;
        
        const style = document.createElement('style');
        style.id = 'liveChatStyles';
        style.textContent = `
            /* Live Chat Widget Styles */
            #liveChatWidget {
                position: fixed;
                z-index: 9998;
                font-family: 'Segoe UI', Roboto, sans-serif;
            }
            
            #liveChatWidget.bottom-right {
                bottom: 20px;
                right: 20px;
            }
            
            #liveChatWidget.bottom-left {
                bottom: 20px;
                left: 20px;
            }
            
            #liveChatWidget.top-right {
                top: 20px;
                right: 20px;
            }
            
            /* Chat Toggle Button */
            .chat-toggle-btn {
                width: 56px;
                height: 56px;
                border-radius: 50%;
                background: linear-gradient(135deg, #0066cc 0%, #00bcd4 100%);
                color: white;
                border: none;
                cursor: pointer;
                font-size: 1.5rem;
                box-shadow: 0 4px 12px rgba(0, 102, 204, 0.3);
                transition: all 0.3s ease;
                display: flex;
                align-items: center;
                justify-content: center;
                position: relative;
            }
            
            .chat-toggle-btn:hover {
                transform: scale(1.1);
                box-shadow: 0 8px 24px rgba(0, 102, 204, 0.4);
            }
            
            .chat-toggle-btn:active {
                transform: scale(0.95);
            }
            
            .chat-badge {
                position: absolute;
                top: -5px;
                right: -5px;
                background: #ff3333;
                color: white;
                width: 24px;
                height: 24px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 0.75rem;
                font-weight: 700;
            }
            
            /* Chat Window */
            .chat-window {
                position: absolute;
                bottom: 80px;
                right: 0;
                width: 380px;
                max-width: calc(100vw - 40px);
                height: 600px;
                background: white;
                border-radius: 12px;
                box-shadow: 0 5px 40px rgba(0, 0, 0, 0.16);
                display: flex;
                flex-direction: column;
                animation: chatSlideIn 0.3s ease;
            }
            
            @keyframes chatSlideIn {
                from {
                    opacity: 0;
                    transform: translateY(20px);
                }
                to {
                    opacity: 1;
                    transform: translateY(0);
                }
            }
            
            /* Chat Header */
            .chat-header {
                background: linear-gradient(135deg, #0066cc 0%, #00bcd4 100%);
                color: white;
                padding: 1.5rem;
                border-radius: 12px 12px 0 0;
                display: flex;
                justify-content: space-between;
                align-items: flex-start;
            }
            
            .chat-header-content h3 {
                margin: 0;
                font-size: 1.1rem;
                font-weight: 600;
            }
            
            .chat-header-content p {
                margin: 0.25rem 0 0;
                font-size: 0.85rem;
                opacity: 0.9;
            }
            
            .chat-close-btn {
                background: rgba(255, 255, 255, 0.2);
                border: none;
                color: white;
                cursor: pointer;
                width: 32px;
                height: 32px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.2s;
            }
            
            .chat-close-btn:hover {
                background: rgba(255, 255, 255, 0.3);
            }
            
            /* Messages Container */
            .chat-messages {
                flex: 1;
                overflow-y: auto;
                padding: 1.5rem;
                background: #f8f9fa;
                display: flex;
                flex-direction: column;
                gap: 1rem;
            }
            
            .chat-message {
                display: flex;
                gap: 0.75rem;
                animation: messageSlideIn 0.3s ease;
            }
            
            @keyframes messageSlideIn {
                from {
                    opacity: 0;
                    transform: translateY(10px);
                }
                to {
                    opacity: 1;
                    transform: translateY(0);
                }
            }
            
            .chat-message.user-message {
                justify-content: flex-end;
            }
            
            .message-avatar {
                width: 32px;
                height: 32px;
                border-radius: 50%;
                background: #0066cc;
                color: white;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 0.9rem;
                flex-shrink: 0;
            }
            
            .chat-message.user-message .message-avatar {
                background: #00bcd4;
            }
            
            .message-content {
                display: flex;
                flex-direction: column;
                gap: 0.25rem;
            }
            
            .message-content p {
                margin: 0;
                padding: 0.75rem 1rem;
                border-radius: 12px;
                font-size: 0.9rem;
                line-height: 1.5;
                background: white;
                color: #263238;
                box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
            }
            
            .chat-message.user-message .message-content p {
                background: #0066cc;
                color: white;
            }
            
            .message-time {
                font-size: 0.75rem;
                color: #90a4ae;
                padding: 0 1rem;
            }
            
            /* Quick Replies */
            .quick-replies {
                padding: 1rem;
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 0.5rem;
                border-top: 1px solid #eceff1;
            }
            
            .quick-reply-btn {
                padding: 0.75rem;
                background: white;
                border: 1px solid #e0e0e0;
                border-radius: 8px;
                cursor: pointer;
                font-size: 0.8rem;
                transition: all 0.2s;
                color: #263238;
                font-weight: 500;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                gap: 0.25rem;
            }
            
            .quick-reply-btn i {
                font-size: 1rem;
            }
            
            .quick-reply-btn:hover {
                background: #f5f5f5;
                border-color: #0066cc;
                color: #0066cc;
            }
            
            /* Input Area */
            .chat-input-area {
                padding: 1rem;
                border-top: 1px solid #eceff1;
                background: white;
                border-radius: 0 0 12px 12px;
            }
            
            .input-wrapper {
                display: flex;
                gap: 0.5rem;
                margin-bottom: 0.75rem;
            }
            
            #chatMessageInput {
                flex: 1;
                border: 2px solid #e0e0e0;
                border-radius: 8px;
                padding: 0.75rem;
                font-size: 0.9rem;
                font-family: inherit;
                transition: all 0.2s;
            }
            
            #chatMessageInput:focus {
                outline: none;
                border-color: #0066cc;
                box-shadow: 0 0 0 3px rgba(0, 102, 204, 0.1);
            }
            
            .send-btn {
                background: #0066cc;
                color: white;
                border: none;
                border-radius: 8px;
                width: 40px;
                height: 40px;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.2s;
            }
            
            .send-btn:hover {
                background: #0052a3;
            }
            
            /* Chat Footer */
            .chat-footer {
                display: flex;
                align-items: center;
                justify-content: space-between;
                font-size: 0.8rem;
            }
            
            .chat-footer p {
                margin: 0;
                color: #90a4ae;
            }
            
            .online-status {
                display: flex;
                align-items: center;
                gap: 0.5rem;
                color: #4caf50;
                font-weight: 500;
            }
            
            .status-dot {
                width: 8px;
                height: 8px;
                background: #4caf50;
                border-radius: 50%;
                animation: pulse 2s infinite;
            }
            
            @keyframes pulse {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.5; }
            }
            
            /* Responsive */
            @media (max-width: 480px) {
                .chat-window {
                    width: calc(100vw - 20px);
                    height: calc(100vh - 100px);
                    bottom: 70px;
                }
                
                .chat-toggle-btn {
                    width: 48px;
                    height: 48px;
                    font-size: 1.2rem;
                }
            }
        `;
        document.head.appendChild(style);
    }
    
    attachEventListeners() {
        const toggleBtn = document.getElementById('chatToggleBtn');
        const closeBtn = document.getElementById('chatCloseBtn');
        const sendBtn = document.getElementById('sendMessageBtn');
        const input = document.getElementById('chatMessageInput');
        
        toggleBtn.addEventListener('click', () => this.toggleChat());
        closeBtn.addEventListener('click', () => this.closeChat());
        sendBtn.addEventListener('click', () => this.sendMessage());
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendMessage();
        });
        
        // Quick replies
        document.querySelectorAll('.quick-reply-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.handleQuickReply(e.target.closest('.quick-reply-btn').dataset.action));
        });
        
        // Load chat history
        this.loadChatHistory();
    }
    
    toggleChat() {
        this.isOpen ? this.closeChat() : this.openChat();
    }
    
    openChat() {
        document.getElementById('chatWindow').style.display = 'flex';
        document.getElementById('chatMessageInput').focus();
        this.isOpen = true;
        
        // Clear unread badge
        const badge = document.getElementById('unreadBadge');
        if (badge) badge.style.display = 'none';
    }
    
    closeChat() {
        document.getElementById('chatWindow').style.display = 'none';
        this.isOpen = false;
    }
    
    sendMessage() {
        const input = document.getElementById('chatMessageInput');
        const message = input.value.trim();
        
        if (!message) return;
        
        // Add user message to UI
        this.addMessage(message, 'user');
        input.value = '';
        
        // Save to localStorage
        this.saveChatHistory();
        
        // Send to backend (for production)
        if (this.config.integrationProvider === 'custom' && this.config.apiEndpoint) {
            this.sendToBackend(message);
        } else {
            // Simulate bot response
            setTimeout(() => {
                this.addMessage('Thanks for your message! Our team will get back to you shortly.', 'bot');
            }, 1000);
        }
    }
    
    handleQuickReply(action) {
        let message = '';
        switch(action) {
            case 'appointment':
                message = 'I would like to book an appointment';
                break;
            case 'billing':
                message = 'I have a billing question';
                break;
            case 'technical':
                message = 'I\'m experiencing a technical issue';
                break;
            case 'other':
                message = 'I have another question';
                break;
        }
        
        if (message) {
            document.getElementById('chatMessageInput').value = message;
            this.sendMessage();
        }
    }
    
    addMessage(text, sender = 'bot') {
        const messagesContainer = document.getElementById('chatMessages');
        const messageDiv = document.createElement('div');
        messageDiv.className = `chat-message ${sender === 'user' ? 'user-message' : 'bot-message'}`;
        
        const avatarDiv = document.createElement('div');
        avatarDiv.className = 'message-avatar';
        avatarDiv.innerHTML = sender === 'user' ? '<i class="fas fa-user"></i>' : '<i class="fas fa-user-tie"></i>';
        
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        contentDiv.innerHTML = `
            <p>${text}</p>
            <span class="message-time">${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        `;
        
        messageDiv.appendChild(avatarDiv);
        messageDiv.appendChild(contentDiv);
        messagesContainer.appendChild(messageDiv);
        
        // Scroll to bottom
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
        
        // Store message
        this.messages.push({ text, sender, timestamp: new Date().toISOString() });
    }
    
    sendToBackend(message) {
        fetch(this.config.apiEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message })
        })
        .then(res => res.json())
        .then(data => {
            this.addMessage(data.reply || 'Thanks for your message!', 'bot');
        })
        .catch(err => {
            console.error('Chat error:', err);
            this.addMessage('Sorry, something went wrong. Please try again.', 'bot');
        });
    }
    
    saveChatHistory() {
        localStorage.setItem('chatHistory', JSON.stringify(this.messages));
    }
    
    loadChatHistory() {
        const saved = localStorage.getItem('chatHistory');
        if (saved) {
            this.messages = JSON.parse(saved);
        }
    }
}

// Initialize chat when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    // Initialize live chat with Intercom
    if (window.location.hostname === 'clinixpro.com' || true) { // Change domain check as needed
        window.liveChat = new LiveChat({
            position: 'bottom-right',
            title: 'ClinixPro Support',
            subtitle: 'We usually reply within minutes',
            integrationProvider: 'custom',
            apiEndpoint: '/api/support/chat'
        });
    }
});

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = LiveChat;
}
