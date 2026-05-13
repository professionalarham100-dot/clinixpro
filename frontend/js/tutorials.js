// ==================== TUTORIALS PAGE SCRIPTS ====================

const tutorials = [
    {
        id: 1,
        title: 'Getting Started with ClinixPro in 5 Minutes',
        description: 'A quick tour of the platform covering all main features for both patients and healthcare providers.',
        category: 'getting-started',
        duration: '5:23',
        views: '15.2K',
        rating: 4.8,
        videoId: 'dQw4w9WgXcQ',
        thumbnail: 'https://img.youtube.com/vi/dQw4w9WgXcQ/maxresdefault.jpg',
        featured: true
    },
    {
        id: 2,
        title: 'Patient Account Setup Guide',
        description: 'Step-by-step instructions on how to create and set up your patient account.',
        category: 'patients',
        duration: '4:15',
        views: '8.9K',
        rating: 4.6,
        videoId: 'dQw4w9WgXcQ',
        thumbnail: 'https://img.youtube.com/vi/dQw4w9WgXcQ/maxresdefault.jpg'
    },
    {
        id: 3,
        title: 'Booking Your First Appointment',
        description: 'Learn how to search for doctors and book appointments easily.',
        category: 'patients',
        duration: '3:47',
        views: '12.3K',
        rating: 4.9,
        videoId: 'dQw4w9WgXcQ',
        thumbnail: 'https://img.youtube.com/vi/dQw4w9WgXcQ/maxresdefault.jpg'
    },
    {
        id: 4,
        title: 'Managing Medical Records',
        description: 'How to access, organize, and share your medical records securely.',
        category: 'patients',
        duration: '6:12',
        views: '7.5K',
        rating: 4.7,
        videoId: 'dQw4w9WgXcQ',
        thumbnail: 'https://img.youtube.com/vi/dQw4w9WgXcQ/maxresdefault.jpg'
    },
    {
        id: 5,
        title: 'Doctor Account Setup & Configuration',
        description: 'Complete guide for healthcare providers to set up their accounts and configure settings.',
        category: 'doctors',
        duration: '8:34',
        views: '5.2K',
        rating: 4.5,
        videoId: 'dQw4w9WgXcQ',
        thumbnail: 'https://img.youtube.com/vi/dQw4w9WgXcQ/maxresdefault.jpg'
    },
    {
        id: 6,
        title: 'Managing Patient Appointments',
        description: 'Tips and tricks for doctors to manage their daily appointments efficiently.',
        category: 'doctors',
        duration: '5:56',
        views: '4.1K',
        rating: 4.4,
        videoId: 'dQw4w9WgXcQ',
        thumbnail: 'https://img.youtube.com/vi/dQw4w9WgXcQ/maxresdefault.jpg'
    },
    {
        id: 7,
        title: 'Advanced Search Features',
        description: 'Master the advanced search and filtering options to find exactly what you need.',
        category: 'advanced',
        duration: '4:28',
        views: '3.8K',
        rating: 4.3,
        videoId: 'dQw4w9WgXcQ',
        thumbnail: 'https://img.youtube.com/vi/dQw4w9WgXcQ/maxresdefault.jpg'
    },
    {
        id: 8,
        title: 'Data Privacy & Security',
        description: 'Understanding how your data is protected and how to maintain privacy on ClinixPro.',
        category: 'advanced',
        duration: '7:15',
        views: '9.7K',
        rating: 4.8,
        videoId: 'dQw4w9WgXcQ',
        thumbnail: 'https://img.youtube.com/vi/dQw4w9WgXcQ/maxresdefault.jpg'
    },
    {
        id: 9,
        title: 'Common Login Issues & Solutions',
        description: 'Troubleshoot common login problems and reset your password if forgotten.',
        category: 'troubleshooting',
        duration: '3:42',
        views: '11.2K',
        rating: 4.6,
        videoId: 'dQw4w9WgXcQ',
        thumbnail: 'https://img.youtube.com/vi/dQw4w9WgXcQ/maxresdefault.jpg'
    },
    {
        id: 10,
        title: 'Fixing Browser Compatibility Issues',
        description: 'Solutions for common browser-related issues and how to enable required features.',
        category: 'troubleshooting',
        duration: '4:05',
        views: '6.4K',
        rating: 4.2,
        videoId: 'dQw4w9WgXcQ',
        thumbnail: 'https://img.youtube.com/vi/dQw4w9WgXcQ/maxresdefault.jpg'
    },
    {
        id: 11,
        title: 'Mobile App Guide',
        description: 'Using ClinixPro on your mobile device - tips for the best experience.',
        category: 'patients',
        duration: '5:30',
        views: '8.3K',
        rating: 4.7,
        videoId: 'dQw4w9WgXcQ',
        thumbnail: 'https://img.youtube.com/vi/dQw4w9WgXcQ/maxresdefault.jpg'
    },
    {
        id: 12,
        title: 'Payment Methods & Billing',
        description: 'How to add payment methods and understand your billing statements.',
        category: 'patients',
        duration: '4:50',
        views: '5.9K',
        rating: 4.5,
        videoId: 'dQw4w9WgXcQ',
        thumbnail: 'https://img.youtube.com/vi/dQw4w9WgXcQ/maxresdefault.jpg'
    }
];

let filteredTutorials = [...tutorials];
let videoLoadTimeout = null;

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    const grid = document.getElementById('tutorialsGrid');
    if (grid) {
        grid.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 2rem; color: var(--cp-text-muted, #64748b);">
                <i class="fas fa-spinner fa-spin" style="font-size: 1.6rem; margin-bottom: 0.75rem;"></i>
                <p>Loading tutorials...</p>
            </div>
        `;
    }
    renderTutorials();
    initializeCategoryFilter();
    initializeSearch();
});

// ==================== Category Filter ====================
function initializeCategoryFilter() {
    const buttons = document.querySelectorAll('.category-btn');
    
    buttons.forEach(btn => {
        btn.addEventListener('click', function() {
            // Remove active class from all buttons
            buttons.forEach(b => b.classList.remove('active'));
            
            // Add active class to clicked button
            this.classList.add('active');
            
            // Filter tutorials
            const category = this.dataset.category;
            if (category === 'all') {
                filteredTutorials = [...tutorials];
            } else {
                filteredTutorials = tutorials.filter(t => t.category === category);
            }
            
            renderTutorials();
        });
    });
}

// ==================== Search Functionality ====================
function initializeSearch() {
    const searchInput = document.getElementById('tutorialSearch');
    
    searchInput.addEventListener('input', function(e) {
        const searchTerm = e.target.value.toLowerCase();
        
        filteredTutorials = tutorials.filter(tutorial => 
            tutorial.title.toLowerCase().includes(searchTerm) ||
            tutorial.description.toLowerCase().includes(searchTerm) ||
            tutorial.category.toLowerCase().includes(searchTerm)
        );
        
        renderTutorials();
    });
}

// ==================== Render Tutorials ====================
function renderTutorials() {
    const grid = document.getElementById('tutorialsGrid');
    if (!grid) return;
    grid.innerHTML = '';
    
    if (filteredTutorials.length === 0) {
        grid.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 2rem;">
                <i class="fas fa-search" style="font-size: 3rem; color: var(--text-light); margin-bottom: 1rem;"></i>
                <p style="color: var(--text-light);">No tutorials found. Try a different search or category.</p>
            </div>
        `;
        return;
    }
    
    filteredTutorials.forEach(tutorial => {
        const card = createTutorialCard(tutorial);
        grid.appendChild(card);
    });
}

function createTutorialCard(tutorial) {
    const div = document.createElement('div');
    div.className = 'tutorial-card';
    div.setAttribute('role', 'button');
    div.setAttribute('tabindex', '0');
    div.onclick = () => playVideo(tutorial);
    div.onkeydown = (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            playVideo(tutorial);
        }
    };
    
    const stars = Array(Math.floor(tutorial.rating))
        .fill(0)
        .map(() => '<i class="fas fa-star"></i>')
        .join('');
    
    div.innerHTML = `
        <div class="tutorial-thumbnail">
            <img src="${tutorial.thumbnail}" alt="${tutorial.title}">
            <button class="play-btn" onclick="event.stopPropagation(); playVideo(${JSON.stringify(tutorial).replace(/"/g, '&quot;')})">
                <i class="fas fa-play"></i>
            </button>
            <div class="duration">${tutorial.duration}</div>
        </div>
        <div class="tutorial-content">
            <span class="tutorial-category">${formatCategory(tutorial.category)}</span>
            <h4>${tutorial.title}</h4>
            <p>${tutorial.description}</p>
            <div class="tutorial-info">
                <span><i class="fas fa-play"></i> ${tutorial.views} views</span>
                <span class="tutorial-rating">${stars}</span>
            </div>
        </div>
    `;
    
    return div;
}

// ==================== Video Player ====================
function playVideo(tutorial) {
    if (!tutorial || !tutorial.videoId) {
        showNotification('This tutorial video is currently unavailable.', 'error');
        return;
    }

    const modal = document.getElementById('videoModal');
    const iframe = document.getElementById('videoFrame');
    const title = document.getElementById('videoTitle');
    const description = document.getElementById('videoDescription');
    if (!modal || !iframe || !title || !description) {
        showNotification('Unable to open video player right now.', 'error');
        return;
    }
    
    // YouTube embed URL
    iframe.src = `https://www.youtube.com/embed/${tutorial.videoId}?autoplay=1`;
    title.textContent = tutorial.title;
    description.textContent = tutorial.description;
    
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';

    if (videoLoadTimeout) clearTimeout(videoLoadTimeout);
    videoLoadTimeout = setTimeout(() => {
        showNotification('Video is taking longer than usual to load. Check your internet and try again.', 'info');
    }, 5000);
}

function playFeaturedVideo() {
    playVideo(tutorials.find(t => t.featured));
}

function closeVideoModal() {
    const modal = document.getElementById('videoModal');
    const iframe = document.getElementById('videoFrame');
    if (!modal || !iframe) return;
    
    modal.classList.remove('active');
    iframe.src = '';
    document.body.style.overflow = 'auto';
    if (videoLoadTimeout) {
        clearTimeout(videoLoadTimeout);
        videoLoadTimeout = null;
    }
}

// ==================== Newsletter ====================
function subscribeNewsletter(e) {
    e.preventDefault();
    const email = e.target.querySelector('input[type="email"]').value;
    
    // Save to localStorage
    let subscribers = JSON.parse(localStorage.getItem('newsletterSubscribers')) || [];
    if (!subscribers.includes(email)) {
        subscribers.push(email);
        localStorage.setItem('newsletterSubscribers', JSON.stringify(subscribers));
    }
    
    // Show confirmation
    showNotification('Thank you for subscribing! You\'ll receive notifications about new tutorials.', 'success');
    e.target.reset();
}

// ==================== Utility Functions ====================
function formatCategory(category) {
    const map = {
        'getting-started': 'Getting Started',
        'patients': 'For Patients',
        'doctors': 'For Doctors',
        'advanced': 'Advanced Tips',
        'troubleshooting': 'Troubleshooting'
    };
    return map[category] || category;
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
    
    setTimeout(() => notification.remove(), 4000);
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

// Close modal on ESC key
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        closeVideoModal();
    }
});

// Close modal when clicking outside
document.addEventListener('click', function(e) {
    const modal = document.getElementById('videoModal');
    if (e.target === modal) {
        closeVideoModal();
    }
});
