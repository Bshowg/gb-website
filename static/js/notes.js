/**
 * Simple Static Note System
 * Uses standard HTML anchor links for navigation
 */

// Smooth scrolling for anchor links (optional enhancement)
document.addEventListener('DOMContentLoaded', function() {
    // Only add smooth scrolling, no other behaviors
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            const targetId = this.getAttribute('href');
            const targetElement = document.querySelector(targetId);
            
            if (targetElement) {
                e.preventDefault();
                targetElement.scrollIntoView({
                    behavior: 'smooth',
                    block: 'center'
                });
                
                // Update URL
                history.pushState(null, null, targetId);
            }
        });
    });
});