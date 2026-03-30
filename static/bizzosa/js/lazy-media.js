/**
 * Simple Lazy Loading for Friends Gallery Videos
 * Only loads video when it comes into view
 */

class LazyMediaLoader {
    constructor() {
        this.init();
    }

    init() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.setupLazyLoading());
        } else {
            this.setupLazyLoading();
        }
    }

    setupLazyLoading() {
        // Only target Friends gallery videos
        const friendsSection = document.querySelector('#bizzosa-friends');
        if (!friendsSection) return;
        
        const videos = friendsSection.querySelectorAll('.friends-gallery video');
        if (videos.length === 0) return;

        // Simple intersection observer - load when visible
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const video = entry.target;
                    
                    // Only load if not already loaded
                    if (!video.dataset.loaded) {
                        // Get the data-src attribute if exists, otherwise use src
                        const src = video.dataset.src || video.getAttribute('src');
                        
                        if (src && !video.src.includes(src)) {
                            video.src = src;
                            video.load();
                            video.dataset.loaded = 'true';
                            
                            // Play when loaded
                            video.addEventListener('loadeddata', () => {
                                video.play().catch(() => {
                                    // Autoplay blocked, that's fine
                                });
                            }, { once: true });
                        }
                    }
                    
                    // Stop observing once loaded
                    observer.unobserve(video);
                }
            });
        }, {
            // Load when video is 50px away from viewport
            rootMargin: '50px'
        });

        // Prepare videos and start observing
        videos.forEach(video => {
            if (!video.dataset.loaded) {
                // Move src to data-src to prevent immediate loading
                const currentSrc = video.getAttribute('src');
                if (currentSrc) {
                    video.dataset.src = currentSrc;
                    video.removeAttribute('src');
                }
                
                // Observe this video
                observer.observe(video);
            }
        });
    }
}

// Initialize
new LazyMediaLoader();

// Simple lazy loading for gallery images too
document.addEventListener('DOMContentLoaded', () => {
    const galleryImages = document.querySelectorAll('#bizzosa-gallery img[data-src]');
    
    if (galleryImages.length > 0) {
        const imageObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const img = entry.target;
                    img.src = img.dataset.src;
                    img.removeAttribute('data-src');
                    imageObserver.unobserve(img);
                }
            });
        }, {
            rootMargin: '100px'
        });
        
        galleryImages.forEach(img => imageObserver.observe(img));
    }
});