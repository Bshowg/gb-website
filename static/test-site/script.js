// Mobile menu toggle
const menuToggle = document.querySelector('.mobile-menu-toggle');
const navMenu = document.querySelector('nav ul');

menuToggle.addEventListener('click', function() {
    navMenu.classList.toggle('active');
    this.textContent = navMenu.classList.contains('active') ? '✕' : '☰';
});

// Smooth scrolling for navigation links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
            // Close mobile menu after clicking
            if (window.innerWidth <= 768) {
                navMenu.classList.remove('active');
                menuToggle.textContent = '☰';
            }
        }
    });
});

// Form submission handler with AJAX
document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('contactForm');
    if (form) {
        form.addEventListener('submit', function(e) {
            e.preventDefault();
            
            const formData = new FormData(this);
            const submitButton = this.querySelector('button[type="submit"]');
            const formMessage = document.getElementById('formMessage');
            
            // Disable submit button during request
            submitButton.disabled = true;
            submitButton.textContent = 'Invio in corso...';
            
            // Send AJAX request
            fetch('send_email.php', {
                method: 'POST',
                body: formData
            })
            .then(response => response.json())
            .then(data => {
                // Display message
                formMessage.style.display = 'block';
                formMessage.textContent = data.message;
                
                if (data.status === 'success') {
                    formMessage.style.backgroundColor = '#d4edda';
                    formMessage.style.color = '#155724';
                    formMessage.style.border = '1px solid #c3e6cb';
                    // Reset form on success
                    form.reset();
                } else {
                    formMessage.style.backgroundColor = '#f8d7da';
                    formMessage.style.color = '#721c24';
                    formMessage.style.border = '1px solid #f5c6cb';
                }
                
                // Hide message after 5 seconds
                setTimeout(() => {
                    formMessage.style.display = 'none';
                }, 5000);
            })
            .catch(error => {
                // Handle network errors
                formMessage.style.display = 'block';
                formMessage.textContent = 'Errore di connessione. Riprova più tardi.';
                formMessage.style.backgroundColor = '#f8d7da';
                formMessage.style.color = '#721c24';
                formMessage.style.border = '1px solid #f5c6cb';
                
                console.error('Error:', error);
            })
            .finally(() => {
                // Re-enable submit button
                submitButton.disabled = false;
                submitButton.textContent = 'Invia la tua richiesta';
            });
        });
    }
});

// Carousel functionality
function initCarousels() {
    const carousels = document.querySelectorAll('.studio-carousel');
    
    carousels.forEach(carousel => {
        const slides = carousel.querySelectorAll('.carousel-slide');
        const dots = carousel.querySelectorAll('.carousel-dot');
        const prevBtn = carousel.querySelector('.carousel-prev');
        const nextBtn = carousel.querySelector('.carousel-next');
        let currentSlide = 0;

        function showSlide(index) {
            slides.forEach((slide, i) => {
                slide.classList.toggle('active', i === index);
            });
            dots.forEach((dot, i) => {
                dot.classList.toggle('active', i === index);
            });
            currentSlide = index;
        }

        function nextSlide() {
            const next = (currentSlide + 1) % slides.length;
            showSlide(next);
        }

        function prevSlide() {
            const prev = (currentSlide - 1 + slides.length) % slides.length;
            showSlide(prev);
        }

        // Event listeners
        nextBtn.addEventListener('click', nextSlide);
        prevBtn.addEventListener('click', prevSlide);

        dots.forEach((dot, index) => {
            dot.addEventListener('click', () => showSlide(index));
        });

        // Auto-advance carousel every 10 seconds
        setInterval(nextSlide, 10000);
    });
}

// Initialize carousels when DOM is loaded
document.addEventListener('DOMContentLoaded', initCarousels);

// Card flip functionality
document.addEventListener('DOMContentLoaded', function() {
    const cards = document.querySelectorAll('.card');
    
    cards.forEach(card => {
        card.addEventListener('click', function(e) {
            this.classList.toggle('flipped');
        });
    });
});