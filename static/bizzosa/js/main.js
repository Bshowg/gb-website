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
    
    // Hamburger menu toggle
    if (hamburger && navMenu) {
        hamburger.addEventListener('click', () => {
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
    
    // Navbar scroll effect
    let lastScroll = 0;
    window.addEventListener('scroll', () => {
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
    if (!video) return;
    
    let playingBackward = false;
    let animationFrameId = null;
    
    // Function to set appropriate video source and poster
    function setVideoSource() {
        const isMobile = window.innerWidth < 768;
        const videoSrc = isMobile ? 'videos/video_mobile.mp4' : 'videos/video_desktop.mp4';
        const posterUrl = isMobile ? 'images/hero/hero-poster-mobile.jpg' : 'images/hero/hero-poster.jpg';
        
        // Set poster image
        video.poster = posterUrl;
        
        // Only change source if it's different
        if (video.src !== videoSrc) {
            video.src = videoSrc;
            video.load();
            
            // Reset ping-pong state
            playingBackward = false;
            if (animationFrameId) {
                cancelAnimationFrame(animationFrameId);
                animationFrameId = null;
            }
            
            // Attempt to play video
            video.play().catch(err => {
                console.log('Video autoplay failed, showing poster:', err);
                // If autoplay fails, the poster will be shown
            });
        }
    }
    
    // Ping-pong loop functionality
    function handlePingPongLoop() {
        if (playingBackward) {
            // Playing backward
            if (video.currentTime <= 0.1) {
                // Reached the beginning, play forward
                playingBackward = false;
                video.playbackRate = 1;
                video.play();
            } else {
                // Continue playing backward
                video.currentTime -= 0.033; // ~30fps backward playback
                animationFrameId = requestAnimationFrame(handlePingPongLoop);
            }
        }
    }
    
    // Handle video ended event
    video.addEventListener('ended', () => {
        if (!playingBackward) {
            // Start playing backward
            playingBackward = true;
            video.pause();
            animationFrameId = requestAnimationFrame(handlePingPongLoop);
        }
    });
    
    // Alternative smoother backward playback using playbackRate (if browser supports negative rates)
    // Note: Not all browsers support negative playbackRate
    function initPingPongWithPlaybackRate() {
        video.addEventListener('ended', () => {
            if (video.playbackRate > 0) {
                // Try to play backward (may not work in all browsers)
                video.playbackRate = -1;
                video.play().catch(() => {
                    // Fallback to manual backward playback
                    playingBackward = true;
                    video.pause();
                    animationFrameId = requestAnimationFrame(handlePingPongLoop);
                });
            } else {
                // Was playing backward, now play forward
                video.playbackRate = 1;
                video.currentTime = 0;
                video.play();
            }
        });
        
        // Check when video reaches the beginning while playing backward
        video.addEventListener('timeupdate', () => {
            if (video.playbackRate < 0 && video.currentTime <= 0.1) {
                video.playbackRate = 1;
                video.play();
            }
        });
    }
    
    // Remove the standard loop attribute to handle custom looping
    video.removeAttribute('loop');
    
    // Set initial source
    setVideoSource();
    
    // Handle resize events with debouncing
    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(setVideoSource, 250);
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