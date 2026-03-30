/**
 * Simple lazy loading for Friends gallery videos
 * Loads video sources only when they come into view
 */

document.addEventListener('DOMContentLoaded', function() {
    const friendsVideos = document.querySelectorAll('.friends-gallery video');
    
    if (friendsVideos.length === 0) return;
    
    const videoObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const video = entry.target;
                
                // Check if already loaded
                if (!video.dataset.loaded) {
                    const source = video.querySelector('source');
                    
                    if (source && source.dataset.src) {
                        // Set the actual src from data-src
                        source.src = source.dataset.src;
                        
                        // Load the video
                        video.load();
                        
                        // Mark as loaded
                        video.dataset.loaded = 'true';
                        
                        // Add autoplay when loaded if specified
                        if (video.dataset.autoplay === 'true') {
                            video.addEventListener('loadeddata', function() {
                                video.setAttribute('autoplay', '');
                                video.play().catch(() => {
                                    // Autoplay blocked, silent fail
                                });
                            }, { once: true });
                        }
                    }
                }
                
                // Stop observing this video
                videoObserver.unobserve(video);
            }
        });
    }, {
        // Start loading when video is 100px away from viewport
        rootMargin: '100px',
        threshold: 0.01
    });
    
    // Start observing all videos
    friendsVideos.forEach(video => {
        videoObserver.observe(video);
    });
});