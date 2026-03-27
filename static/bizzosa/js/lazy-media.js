/**
 * Lazy Loading for Media Elements
 * Optimizes loading of videos and images for better performance
 */

class LazyMediaLoader {
    constructor() {
        this.videos = [];
        this.observer = null;
        this.init();
    }

    init() {
        // Wait for DOM to be ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.setupLazyLoading());
        } else {
            this.setupLazyLoading();
        }
    }

    setupLazyLoading() {
        // Find all video elements in the friends gallery
        this.videos = document.querySelectorAll('.friends-gallery video');
        
        if (this.videos.length === 0) return;

        // Prepare videos for lazy loading
        this.videos.forEach(video => {
            // Remove autoplay initially
            video.removeAttribute('autoplay');
            
            // Store the sources but don't load yet
            const sources = video.querySelectorAll('source');
            const sourceData = [];
            
            sources.forEach(source => {
                sourceData.push({
                    src: source.src,
                    type: source.type
                });
                // Remove the src to prevent loading
                source.removeAttribute('src');
            });
            
            // Store source data on the video element
            video.dataset.sources = JSON.stringify(sourceData);
            
            // Add a poster or placeholder
            this.addVideoPlaceholder(video);
            
            // Remove video src if directly set
            if (video.src) {
                video.dataset.videoSrc = video.src;
                video.removeAttribute('src');
            }
        });

        // Setup Intersection Observer
        this.setupObserver();
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

    setupObserver() {
        // Options for the observer
        const options = {
            root: null, // viewport
            rootMargin: '100px', // Start loading 100px before entering viewport
            threshold: 0.01 // Trigger when even 1% is visible
        };

        this.observer = new IntersectionObserver((entries) => {
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
            this.observer.observe(video);
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

    // Clean up observer when needed
    destroy() {
        if (this.observer) {
            this.observer.disconnect();
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
        const mutationObserver = new MutationObserver(() => {
            lazyMediaLoader.setupLazyLoading();
        });
        
        mutationObserver.observe(friendsSection, {
            childList: true,
            subtree: true
        });
    }
});