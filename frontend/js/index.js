/* ==================== INDEX PAGE SCRIPTS ==================== */

/**
 * Handle contact form submission
 */
function handleContactForm(event) {
    event.preventDefault();
    const name = document.getElementById('name').value;
    const email = document.getElementById('email').value;
    const subject = document.getElementById('subject').value;
    const message = document.getElementById('message').value;

    alert(`Thank you ${name}!\n\nWe received your message and will get back to you at ${email} soon.\n\nRegards,\nClinixPro Team`);
    document.getElementById('contactForm').reset();
}

/**
 * Smooth scroll to sections
 */
document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({ behavior: 'smooth' });
            }
        });
    });
});
