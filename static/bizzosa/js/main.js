/**
 * Sailing Bizzosa - Main JavaScript
 */

document.addEventListener('DOMContentLoaded', function() {
    // Initialize components
    initNavigation();
    initVideoBackground();
    initSmoothScroll();
    initGalleryLightbox();
});

/**
 * Navigation functionality
 */
function initNavigation() {
    const hamburger = document.getElementById('hamburger');
    const navMenu = document.getElementById('navMenu');
    const navbar = document.getElementById('navbar');
    
    // Flag to track if navbar has been shown
    let navbarShown = false;
    
    // Function to show navbar
    function showNavbar() {
        if (!navbarShown) {
            navbarShown = true;
            navbar.classList.add('visible');
        }
    }
    
    // Show navbar on first scroll
    let scrollListener = function() {
        if (window.pageYOffset > 20) {
            showNavbar();
            // Remove listener after first trigger
            window.removeEventListener('scroll', scrollListener);
        }
    };
    
    // Show navbar on first touch/mouse movement in top area
    let interactionListener = function(e) {
        // Check if interaction is in top 25% of screen or any touch event
        const isTouchEvent = e.type.includes('touch');
        const isTopArea = e.clientY < window.innerHeight * 0.25;
        
        if (isTouchEvent || isTopArea) {
            showNavbar();
            // Remove listeners after first trigger
            document.removeEventListener('mousemove', interactionListener);
            document.removeEventListener('touchstart', interactionListener);
        }
    };
    
    // Add event listeners for first interaction
    window.addEventListener('scroll', scrollListener);
    document.addEventListener('mousemove', interactionListener);
    document.addEventListener('touchstart', interactionListener);
    
    // Hamburger menu toggle
    if (hamburger && navMenu) {
        hamburger.addEventListener('click', () => {
            showNavbar(); // Ensure navbar is shown when hamburger is clicked
            hamburger.classList.toggle('active');
            navMenu.classList.toggle('active');
        });
        
        // Close menu when clicking on a link
        navMenu.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                hamburger.classList.remove('active');
                navMenu.classList.remove('active');
            });
        });
    }
    
    // Navbar scroll effect (only after navbar is shown)
    let lastScroll = 0;
    window.addEventListener('scroll', () => {
        if (!navbarShown) return;
        
        const currentScroll = window.pageYOffset;
        
        if (currentScroll > 100) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
        
        lastScroll = currentScroll;
    });
}

/**
 * Video background with responsive source switching and ping-pong loop
 */
function initVideoBackground() {
    const video = document.getElementById('heroVideo');
    const container = document.querySelector('.video-container');
    if (!video) return;
    
    let isReversing = false;
    let reverseInterval = null;
    
    // Immediately set correct poster before anything else
    function setInitialPoster() {
        const isMobile = window.innerWidth < 768;
        const posterUrl = isMobile ? 'images/hero/hero-poster-mobile.jpg' : 'images/hero/hero-poster.jpg';
        
        // Set poster on both video and container to prevent flash
        video.poster = posterUrl;
        video.style.backgroundImage = `url(${posterUrl})`;
        video.style.backgroundSize = 'cover';
        video.style.backgroundPosition = 'center';
        
        // Also set on container as backup
        if (container) {
            container.style.backgroundImage = `url(${posterUrl})`;
            container.style.backgroundSize = 'cover';
            container.style.backgroundPosition = 'center';
        }
    }
    
    // Set up video with poster showing first
    function setupVideo() {
        const isMobile = window.innerWidth < 768;
        const videoSrc = isMobile ? 'videos/video_mobile.mp4' : 'videos/video_desktop.mp4';
        const posterUrl = isMobile ? 'images/hero/hero-poster-mobile.jpg' : 'images/hero/hero-poster.jpg';
        
        console.log('Setting up video:', videoSrc, 'Poster:', posterUrl);
        
        // Update poster if needed
        video.poster = posterUrl;
        video.style.backgroundImage = `url(${posterUrl})`;
        
        // Set video source
        video.src = videoSrc;
        
        // Wait for video to be fully ready before playing
        video.addEventListener('canplaythrough', function onReady() {
            console.log('Video ready, starting playback');
            // Video is ready, start playing
            video.play().then(() => {
                console.log('Video playing successfully');
                // Keep background image until first frame is painted
                setTimeout(() => {
                    video.style.backgroundImage = 'none';
                    if (container) {
                        container.style.backgroundImage = 'none';
                    }
                }, 100);
            }).catch(err => {
                console.log('Autoplay blocked, poster remains visible:', err);
            });
        }, { once: true });
        
        // Load the video
        video.load();
    }
    
    // Improved ping-pong effect
    function startReversePlayback() {
        if (isReversing) return;
        
        isReversing = true;
        const fps = 30;
        const frameTime = 1000 / fps;
        const step = 1 / fps;
        
        reverseInterval = setInterval(() => {
            if (video.currentTime <= 0.1) {
                // Reached beginning, play forward again
                clearInterval(reverseInterval);
                reverseInterval = null;
                isReversing = false;
                video.currentTime = 0;
                video.play();
            } else {
                // Step backward
                video.currentTime = Math.max(0, video.currentTime - step);
            }
        }, frameTime);
    }
    
    // Handle video ended event for ping-pong
    video.addEventListener('ended', () => {
        if (!isReversing) {
            video.pause();
            startReversePlayback();
        }
    });
    
    // Remove the standard loop attribute
    video.removeAttribute('loop');
    
    // Set initial poster immediately (before DOM ready)
    setInitialPoster();
    
    // Initial setup
    setupVideo();
    
    // Handle resize - only reload if crossing mobile/desktop boundary
    let lastWidth = window.innerWidth;
    window.addEventListener('resize', () => {
        const currentWidth = window.innerWidth;
        const wasMobile = lastWidth < 768;
        const isMobile = currentWidth < 768;
        
        if (wasMobile !== isMobile) {
            lastWidth = currentWidth;
            // Stop any reverse playback
            if (reverseInterval) {
                clearInterval(reverseInterval);
                reverseInterval = null;
                isReversing = false;
            }
            // Update poster immediately for new size
            setInitialPoster();
            // Reload video for new size
            setupVideo();
        }
    });
    
    // Create poster fallback if video fails to load
    video.addEventListener('error', () => {
        console.log('Video failed to load, showing poster image');
        const container = video.parentElement;
        const isMobile = window.innerWidth < 768;
        const fallbackPoster = isMobile ? 'images/hero/hero-poster-mobile.jpg' : 'images/hero/hero-poster.jpg';
        
        // Create fallback image
        const fallbackImg = document.createElement('div');
        fallbackImg.className = 'video-fallback';
        fallbackImg.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-image: url('${fallbackPoster}');
            background-size: cover;
            background-position: center;
        `;
        
        // Replace video with image
        container.insertBefore(fallbackImg, video);
        video.style.display = 'none';
    });
    
    // Add loading state
    video.addEventListener('loadstart', () => {
        video.classList.add('loading');
    });
    
    video.addEventListener('canplay', () => {
        video.classList.remove('loading');
    });
}

/**
 * Smooth scroll for anchor links
 */
function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            
            if (target) {
                const headerOffset = 70; // Height of fixed navbar
                const elementPosition = target.offsetTop;
                const offsetPosition = elementPosition - headerOffset;
                
                window.scrollTo({
                    top: offsetPosition,
                    behavior: 'smooth'
                });
            }
        });
    });
}

/**
 * Gallery Lightbox functionality
 */
function initGalleryLightbox() {
    const galleryItems = document.querySelectorAll('.gallery-item img');
    
    // Create lightbox element
    const lightbox = document.createElement('div');
    lightbox.className = 'lightbox';
    lightbox.innerHTML = `
        <span class="lightbox-close">&times;</span>
        <img src="" alt="">
    `;
    document.body.appendChild(lightbox);
    
    const lightboxImg = lightbox.querySelector('img');
    const closeBtn = lightbox.querySelector('.lightbox-close');
    
    // Open lightbox
    galleryItems.forEach(item => {
        item.addEventListener('click', () => {
            lightboxImg.src = item.src;
            lightboxImg.alt = item.alt;
            lightbox.classList.add('active');
            document.body.style.overflow = 'hidden';
        });
    });
    
    // Close lightbox
    function closeLightbox() {
        lightbox.classList.remove('active');
        document.body.style.overflow = '';
    }
    
    closeBtn.addEventListener('click', closeLightbox);
    lightbox.addEventListener('click', (e) => {
        if (e.target === lightbox) {
            closeLightbox();
        }
    });
    
    // Close on escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && lightbox.classList.contains('active')) {
            closeLightbox();
        }
    });
}

/**
 * Utility function for showing messages
 */
function showMessage(message, type = 'info') {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message message-${type}`;
    messageDiv.textContent = message;
    
    // Add to body
    document.body.appendChild(messageDiv);
    
    // Style it
    messageDiv.style.cssText = `
        position: fixed;
        top: 80px;
        right: 20px;
        padding: 1rem 1.5rem;
        border-radius: 5px;
        z-index: 9999;
        animation: slideIn 0.3s ease;
    `;
    
    // Remove after 3 seconds
    setTimeout(() => {
        messageDiv.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => messageDiv.remove(), 300);
    }, 3000);
}

// Add CSS animations
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
    
    .message {
        background: #333;
        color: white;
    }
    
    .message-success {
        background: #28a745;
    }
    
    .message-error {
        background: #dc3545;
    }
    
    .message-info {
        background: #17a2b8;
    }
    
    .navbar.scrolled {
        background: rgba(255, 255, 255, 0.98);
        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    }
    
    video.loading {
        opacity: 0;
    }
    
    video {
        transition: opacity 0.5s ease;
    }
`;
document.head.appendChild(style);