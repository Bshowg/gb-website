/**
 * Lazy Loading for Media Elements
 * Optimizes loading of videos and images for better performance
 */

class LazyMediaLoader {
    constructor() {
        this.videos = [];
        this.images = [];
        this.observer = null;
        this.init();
    }

    init() {
        // Wait for DOM to be ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                this.setupLazyLoading();
                this.setupImageLazyLoading();
            });
        } else {
            this.setupLazyLoading();
            this.setupImageLazyLoading();
        }
    }

    setupLazyLoading() {
        // Find all video elements in the friends gallery - be very specific with selector
        const friendsSection = document.querySelector('#bizzosa-friends');
        if (!friendsSection) return;
        
        this.videos = friendsSection.querySelectorAll('.friends-gallery video');
        
        if (this.videos.length === 0) return;

        // Prepare videos for lazy loading
        this.videos.forEach(video => {
            // Skip if already processed or if it's the hero video
            if (video.dataset.lazyProcessed === 'true' || video.id === 'heroVideo') return;
            
            // Mark as processed
            video.dataset.lazyProcessed = 'true';
            
            // Remove autoplay initially
            video.removeAttribute('autoplay');
            
            // Store the sources but don't load yet
            const sources = video.querySelectorAll('source');
            const sourceData = [];
            
            sources.forEach(source => {
                if (source.src) {
                    sourceData.push({
                        src: source.src,
                        type: source.type
                    });
                    // Remove the src to prevent loading
                    source.removeAttribute('src');
                }
            });
            
            // Store source data on the video element
            video.dataset.sources = JSON.stringify(sourceData);
            
            // Add a poster or placeholder
            this.addVideoPlaceholder(video);
            
            // Remove video src if directly set
            if (video.src && video.src !== '') {
                video.dataset.videoSrc = video.src;
                video.removeAttribute('src');
            }
        });

        // Setup Intersection Observer for videos
        this.setupVideoObserver();
    }
    
    setupImageLazyLoading() {
        // Find all gallery images
        const gallerySection = document.querySelector('#bizzosa-gallery');
        if (!gallerySection) return;
        
        this.images = gallerySection.querySelectorAll('.gallery-item img');
        
        if (this.images.length === 0) return;

        // Prepare images for lazy loading
        this.images.forEach(img => {
            // Skip if already processed
            if (img.dataset.lazyProcessed === 'true') return;
            
            // Mark as processed
            img.dataset.lazyProcessed = 'true';
            
            // Store original src and set placeholder
            if (img.src && !img.src.includes('data:')) {
                img.dataset.originalSrc = img.src;
                
                // Create a simple placeholder
                const canvas = document.createElement('canvas');
                canvas.width = 400;
                canvas.height = 300;
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = '#1e3a5f';
                ctx.fillRect(0, 0, 400, 300);
                ctx.fillStyle = 'white';
                ctx.font = '16px Arial';
                ctx.textAlign = 'center';
                ctx.fillText('Loading...', 200, 150);
                
                img.src = canvas.toDataURL();
                img.classList.add('lazy-loading');
            }
        });

        // Setup Intersection Observer for images
        this.setupImageObserver();
    }

    addVideoPlaceholder(video) {
        // Add a loading class for styling
        video.parentElement.classList.add('video-loading');
        
        // Create a play button overlay
        const overlay = document.createElement('div');
        overlay.className = 'video-overlay';
        overlay.innerHTML = `
            <div class="video-placeholder">
                <svg class="play-icon" viewBox="0 0 24 24" width="48" height="48">
                    <path fill="currentColor" d="M8 5v14l11-7z"/>
                </svg>
                <span class="loading-text">Video</span>
            </div>
        `;
        
        video.parentElement.appendChild(overlay);
    }

    setupVideoObserver() {
        // Options for the observer
        const options = {
            root: null, // viewport
            rootMargin: '100px', // Start loading 100px before entering viewport
            threshold: 0.01 // Trigger when even 1% is visible
        };

        this.videoObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    this.loadVideo(entry.target);
                } else {
                    // Pause video when out of view to save resources
                    if (!entry.target.paused) {
                        entry.target.pause();
                    }
                }
            });
        }, options);

        // Start observing all videos
        this.videos.forEach(video => {
            this.videoObserver.observe(video);
        });
    }
    
    setupImageObserver() {
        // Options for the observer  
        const options = {
            root: null, // viewport
            rootMargin: '200px', // Start loading 200px before entering viewport
            threshold: 0.1 // Trigger when 10% is visible
        };

        this.imageObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    this.loadImage(entry.target);
                }
            });
        }, options);

        // Start observing all images
        this.images.forEach(img => {
            this.imageObserver.observe(img);
        });
    }

    loadVideo(video) {
        // Check if already loaded
        if (video.dataset.loaded === 'true') {
            // Just play if already loaded
            if (video.paused) {
                video.play().catch(e => console.log('Autoplay prevented:', e));
            }
            return;
        }

        // Get stored source data
        const sources = JSON.parse(video.dataset.sources || '[]');
        
        // Create and append sources with WebM priority
        sources.forEach(sourceData => {
            const source = document.createElement('source');
            
            // Update to use WebM if available
            if (sourceData.src.endsWith('.mp4')) {
                // First try WebM version
                const webmSrc = sourceData.src.replace('.mp4', '.webm');
                const webmSource = document.createElement('source');
                webmSource.src = webmSrc;
                webmSource.type = 'video/webm';
                video.appendChild(webmSource);
            }
            
            // Add original source as fallback
            source.src = sourceData.src;
            source.type = sourceData.type;
            video.appendChild(source);
        });

        // Load the video
        video.load();
        
        // Mark as loaded
        video.dataset.loaded = 'true';
        
        // Remove loading state and overlay
        const parent = video.parentElement;
        parent.classList.remove('video-loading');
        const overlay = parent.querySelector('.video-overlay');
        if (overlay) {
            overlay.remove();
        }

        // Set up autoplay when video is ready
        video.addEventListener('loadeddata', () => {
            // Add autoplay attributes back
            video.setAttribute('autoplay', '');
            video.setAttribute('loop', '');
            video.setAttribute('muted', '');
            video.setAttribute('playsinline', '');
            
            // Try to play
            video.play().catch(e => {
                console.log('Autoplay prevented:', e);
                // If autoplay fails, show play button
                this.addPlayButton(video);
            });
        }, { once: true });
    }

    addPlayButton(video) {
        const playBtn = document.createElement('button');
        playBtn.className = 'video-play-btn';
        playBtn.innerHTML = '▶';
        playBtn.setAttribute('aria-label', 'Play video');
        
        playBtn.addEventListener('click', () => {
            video.play();
            playBtn.remove();
        });
        
        video.parentElement.appendChild(playBtn);
    }
    
    loadImage(img) {
        // Check if already loaded
        if (img.dataset.loaded === 'true') return;
        
        const originalSrc = img.dataset.originalSrc;
        if (!originalSrc) return;
        
        // Mark as loading
        img.classList.add('loading');
        
        // Create new image to preload
        const newImg = new Image();
        
        newImg.onload = () => {
            // Image loaded successfully
            img.src = originalSrc;
            img.dataset.loaded = 'true';
            img.classList.remove('lazy-loading', 'loading');
            img.classList.add('loaded');
            
            // Stop observing this image
            if (this.imageObserver) {
                this.imageObserver.unobserve(img);
            }
        };
        
        newImg.onerror = () => {
            // Failed to load, show fallback
            img.classList.remove('loading');
            img.classList.add('error');
            console.log('Failed to load image:', originalSrc);
        };
        
        // Start loading
        newImg.src = originalSrc;
    }

    // Clean up observers when needed
    destroy() {
        if (this.videoObserver) {
            this.videoObserver.disconnect();
        }
        if (this.imageObserver) {
            this.imageObserver.disconnect();
        }
    }
}

// Initialize lazy loading
const lazyMediaLoader = new LazyMediaLoader();

// Also handle dynamically added videos
document.addEventListener('DOMContentLoaded', () => {
    // Re-initialize if new videos are added dynamically
    const friendsSection = document.querySelector('#bizzosa-friends');
    if (friendsSection) {
        const mutationObserver = new MutationObserver((mutations) => {
            // Only process if videos were actually added
            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                    if (node.nodeType === 1 && (node.tagName === 'VIDEO' || node.querySelector?.('video'))) {
                        lazyMediaLoader.setupLazyLoading();
                        return;
                    }
                }
            }
        });
        
        mutationObserver.observe(friendsSection, {
            childList: true,
            subtree: true
        });
    }
});