// Scroll animations
const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -100px 0px'
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('animate-in');
        }
    });
}, observerOptions);

// Observe elements for animation
document.addEventListener('DOMContentLoaded', () => {
    // Add animation classes to elements
    const elementsToAnimate = [
        '.message-card',
        '.gallery-item',
        '.description-content p',
        '.philosophy-text blockquote',
        '.nature-wisdom p'
    ];

    elementsToAnimate.forEach(selector => {
        document.querySelectorAll(selector).forEach(el => {
            el.style.opacity = '0';
            el.style.transform = 'translateY(20px)';
            el.style.transition = 'opacity 0.8s ease, transform 0.8s ease';
            observer.observe(el);
        });
    });

    // Smooth scroll for scroll indicator
    const scrollIndicator = document.querySelector('.scroll-indicator');
    if (scrollIndicator) {
        scrollIndicator.addEventListener('click', () => {
            const projectSection = document.querySelector('.project-description');
            projectSection.scrollIntoView({ behavior: 'smooth' });
        });
    }

    // Removed parallax effect - keeping background fixed

    // Newsletter form handling
    const newsletterForm = document.getElementById('newsletterForm');
    const formMessage = document.getElementById('formMessage');
    const emailInput = document.getElementById('emailInput');

    if (newsletterForm) {
        newsletterForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const email = emailInput.value;
            const submitBtn = newsletterForm.querySelector('.submit-btn');
            
            // Detect language from URL or page content
            const language = document.documentElement.lang || 'it';
            
            // Disable button and show loading
            submitBtn.disabled = true;
            submitBtn.textContent = language === 'en' ? 'Sending...' : 'Invio...';
            
            try {
                // Send data to PHP
                const formData = new FormData();
                formData.append('email', email);
                formData.append('language', language);
                
                const response = await fetch('send_email.php', {
                    method: 'POST',
                    body: formData
                });
                
                const result = await response.json();
                
                // Show message
                formMessage.textContent = result.message;
                formMessage.classList.add('show');
                formMessage.className = `form-message show ${result.status}`;
                
                if (result.status === 'success') {
                    emailInput.value = '';
                }
                
            } catch (error) {
                // Fallback error message
                const errorMsg = language === 'en' ? 
                    'An error occurred. Please try again later.' : 
                    'Si è verificato un errore. Riprova più tardi.';
                formMessage.textContent = errorMsg;
                formMessage.classList.add('show');
                formMessage.className = 'form-message show error';
            } finally {
                // Re-enable button
                submitBtn.disabled = false;
                submitBtn.textContent = language === 'en' ? 'Subscribe' : 'Iscriviti';
                
                // Hide message after 5 seconds
                setTimeout(() => {
                    formMessage.classList.remove('show');
                }, 5000);
            }
        });
    }

    // Gallery lightbox effect (optional)
    const galleryItems = document.querySelectorAll('.gallery-item');
    
    galleryItems.forEach(item => {
        item.addEventListener('click', function() {
            const img = this.querySelector('img');
            const lightbox = createLightbox(img.src, img.alt);
            document.body.appendChild(lightbox);
            
            // Fade in
            setTimeout(() => {
                lightbox.classList.add('active');
            }, 10);
        });
    });

    function createLightbox(src, alt) {
        const lightbox = document.createElement('div');
        lightbox.className = 'lightbox';
        lightbox.innerHTML = `
            <div class="lightbox-content">
                <span class="lightbox-close">&times;</span>
                <img src="${src}" alt="${alt}">
            </div>
        `;
        
        // Close on click
        lightbox.addEventListener('click', function(e) {
            if (e.target === lightbox || e.target.classList.contains('lightbox-close')) {
                lightbox.classList.remove('active');
                setTimeout(() => {
                    lightbox.remove();
                }, 300);
            }
        });
        
        return lightbox;
    }

    // Add lightbox styles dynamically
    const lightboxStyles = `
        .lightbox {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.95);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
            opacity: 0;
            transition: opacity 0.3s ease;
        }
        
        .lightbox.active {
            opacity: 1;
        }
        
        .lightbox-content {
            position: relative;
            max-width: 90%;
            max-height: 90%;
        }
        
        .lightbox-content img {
            width: 100%;
            height: auto;
            max-height: 90vh;
            object-fit: contain;
        }
        
        .lightbox-close {
            position: absolute;
            top: -40px;
            right: 0;
            color: white;
            font-size: 2rem;
            cursor: pointer;
            transition: transform 0.3s ease;
        }
        
        .lightbox-close:hover {
            transform: scale(1.2);
        }
        
        .animate-in {
            opacity: 1 !important;
            transform: translateY(0) !important;
        }
    `;
    
    const styleSheet = document.createElement('style');
    styleSheet.textContent = lightboxStyles;
    document.head.appendChild(styleSheet);

    // Smooth scroll for all internal links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });

    // Dynamic header on scroll (optional)
    let lastScroll = 0;
    const header = document.querySelector('.hero');
    
    window.addEventListener('scroll', () => {
        const currentScroll = window.pageYOffset;
        
        if (currentScroll > 100) {
            document.body.classList.add('scrolled');
        } else {
            document.body.classList.remove('scrolled');
        }
        
        lastScroll = currentScroll;
    });
});

// Text animation is now handled by CSS