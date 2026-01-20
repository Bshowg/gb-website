
// Mobile navigation functionality
function initMobileNav() {
    const navToggle = document.getElementById("navToggle");
    const navMenu = document.getElementById("navMenuMobile");
    const navClose = document.getElementById("navClose");

    function closeMenu() {
        navMenu.classList.remove("open");
    }

    function openMenu() {
        navMenu.classList.add("open");
    }

    if (navToggle && navMenu) {
        navToggle.addEventListener("click", openMenu);

        if (navClose) {
            navClose.addEventListener("click", closeMenu);
        }

        navMenu.addEventListener("click", (e) => {
            if (e.target.tagName === "A") {
                closeMenu();
            }
        });

        document.addEventListener("click", (e) => {
            if (!navToggle.contains(e.target) && !navMenu.contains(e.target)) {
                closeMenu();
            }
        });
    }
}

// Show mobile nav header immediately
const navHeader = document.getElementById("navHeader");
if (navHeader) {
    navHeader.classList.add("visible");
}

// Initialize mobile navigation
document.addEventListener("DOMContentLoaded", initMobileNav);

// Read more functionality
function initReadMore(language = 'it') {
    const readMoreBtn = document.getElementById("readMoreBtn");
    const aboutMore = document.getElementById("aboutMore");

    const texts = {
        it: {
            more: 'leggi di più',
            less: 'leggi di meno'
        },
        en: {
            more: 'read more',
            less: 'read less'
        }
    };

    if (readMoreBtn && aboutMore) {
        readMoreBtn.addEventListener("click", () => {
            const isExpanded = aboutMore.classList.contains("expanded");

            if (isExpanded) {
                aboutMore.classList.remove("expanded");
                readMoreBtn.textContent = texts[language].more;
            } else {
                aboutMore.classList.add("expanded");
                readMoreBtn.textContent = texts[language].less;
            }
        });
    }
}



// Carousel functionality
function initCarousel(id_track, id_left, id_right) {
    const carouselTrack = document.getElementById(id_track);
    const leftArrow = document.getElementById(id_left);
    const rightArrow = document.getElementById(id_right);

    _initCarousel(carouselTrack, leftArrow, rightArrow);
}

function _initCarousel(carouselTrack, leftArrow, rightArrow) {

    if (!carouselTrack || !leftArrow || !rightArrow) return;

    let currentIndex = 0;
    const slides = carouselTrack.children;
    const totalSlides = slides.length;

    // Determine slides per view based on screen size
    function getSlidesPerView() {
        return window.innerWidth <= 768 ? 1 : 2;
    }

    function updateCarousel() {
        const slidesPerView = getSlidesPerView();
        const maxIndex = totalSlides - slidesPerView;

        // Calculate translation accounting for gap
        let translateX;
        if (slidesPerView === 1) {
            // Mobile: no gap, full width slides
            translateX = -(currentIndex * 100);
        } else {
            // Desktop: account for gap between slides
            const slideWidth = (100 - 1) / slidesPerView; // Subtract 1% for gap
            const gapWidth = 1 / slidesPerView;
            translateX = -(currentIndex * (slideWidth + gapWidth));
        }

        carouselTrack.style.transform = `translateX(${translateX}%)`;

        // Update arrow states
        leftArrow.disabled = currentIndex === 0;
        rightArrow.disabled = currentIndex >= maxIndex;
    }

    function moveLeft() {
        if (currentIndex > 0) {
            currentIndex--;
            updateCarousel();
        }
    }

    function moveRight() {
        const slidesPerView = getSlidesPerView();
        const maxIndex = totalSlides - slidesPerView;
        if (currentIndex < maxIndex) {
            currentIndex++;
            updateCarousel();
        }
    }

    leftArrow.addEventListener("click", moveLeft);
    rightArrow.addEventListener("click", moveRight);

    // Handle window resize
    window.addEventListener("resize", () => {
        updateCarousel();
    });

    // Initialize
    updateCarousel();
}
// Initialize carousel functionality
document.addEventListener("DOMContentLoaded", () => {
    initCarousel("carouselTrack", "carouselLeft", "carouselRight");
    initCarousel("coworkingCarouselTrack", "coworkingCarouselLeft", "coworkingCarouselRight");
});

// Ink Trail functionality
function initInkTrail() {
    const inkTrailSvg = document.getElementById("inkTrailSvg");
    const inkTrailPath = document.getElementById("inkTrailPath");

    if (!inkTrailSvg || !inkTrailPath) return;

    let points = [];
    const maxPoints = 100;
    const svgHeight = window.innerHeight;
    const svgWidth = 100;

    function generateBezierPath(points) {
        if (points.length < 2) return "";

        let path = `M ${points[0].x} ${points[0].y}`;

        for (let i = 1; i < points.length; i++) {
            const prev = points[i - 1];
            const curr = points[i];
            const next = points[i + 1] || curr;

            // Calculate smooth control points using adjacent points
            const tension = 0.4;

            // Vector from previous to next point
            const dx = next.x - prev.x;
            const dy = next.y - prev.y;

            // Control points for smoother curves
            const cp1x = prev.x + dx * tension;
            const cp1y = prev.y + dy * tension;
            const cp2x = curr.x - dx * tension;
            const cp2y = curr.y - dy * tension;

            path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${curr.x} ${curr.y}`;
        }

        return path;
    }

    function updateInkTrail() {
        const scrollPercent =
            window.scrollY /
            (document.documentElement.scrollHeight - window.innerHeight);
        const scrollProgress = Math.min(scrollPercent, 1);

        // Calculate how many points we should have based on scroll
        const targetPoints = Math.floor(scrollProgress * maxPoints);

        // Generate points from start to current scroll position
        points = [];
        for (let i = 0; i <= targetPoints; i++) {
            const progress = i / maxPoints;
            const y = progress * svgHeight;
            const x =
                30 +
                Math.sin(progress * Math.PI * 4) * 20 +
                Math.sin(progress * 10) * 3;
            points.push({ x, y });
        }

        // Generate and apply path
        const pathData = generateBezierPath(points);
        inkTrailPath.setAttribute("d", pathData);
    }

    // Update on scroll
    window.addEventListener("scroll", updateInkTrail);

    // Initial draw
    updateInkTrail();
}

// Initialize ink trail functionality
document.addEventListener("DOMContentLoaded", initInkTrail);

// Sidebar opacity control
function initSidebarOpacity() {
    const sidebar = document.querySelector(".sidebar");
    if (!sidebar) return;

    function updateSidebarOpacity() {
        const scrollY = window.scrollY;
        const viewportHeight = window.innerHeight;
        const maxScroll = viewportHeight * 0.5; // 50vh

        // Calculate opacity (0 to 1) based on scroll position
        const opacity = Math.min(scrollY / maxScroll, 1);
        sidebar.style.opacity = opacity;
    }

    // Update on scroll
    window.addEventListener("scroll", updateSidebarOpacity);

    // Initial check
    updateSidebarOpacity();
}

// Initialize sidebar opacity functionality
document.addEventListener("DOMContentLoaded", initSidebarOpacity);

// Hide sidebar when in contatti section
function initContattiSectionObserver() {
    const sidebar = document.querySelector('.sidebar');
    const contattiSection = document.getElementById('contatti');
    const footerSection = document.querySelector('.footer-section');

    if (!sidebar || !contattiSection) return;

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting && entry.intersectionRatio > 0.1) {
                sidebar.classList.add('hidden');
            } else {
                // Check if footer is not in view before showing sidebar
                const footerRect = footerSection?.getBoundingClientRect();
                const windowHeight = window.innerHeight;

                if (!footerRect || footerRect.top > windowHeight) {
                    sidebar.classList.remove('hidden');
                }
            }
        });
    }, {
        threshold: [0.3, 0.7]
    });

    observer.observe(contattiSection);

    // Also observe footer
    if (footerSection) {
        const footerObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    sidebar.classList.add('hidden');
                }
            });
        }, {
            threshold: 0.3
        });

        footerObserver.observe(footerSection);
    }
}

// Initialize contatti section observer
document.addEventListener("DOMContentLoaded", initContattiSectionObserver);


// Store active modal instance
let activeModalInstance = null;

// Generic modal functionality for any image collection
function initImageModal(containerElement, itemSelector) {
    const modal = document.getElementById('imageModal');
    const modalImage = document.getElementById('modalImage');
    const modalText = document.getElementById('modalText');
    const modalClose = document.getElementById('modalClose');
    const modalLoader = document.getElementById('modalLoader');
    const modalPrev = document.getElementById('modalPrev');
    const modalNext = document.getElementById('modalNext');
    const modalPrevMobile = document.getElementById('modalPrevMobile');
    const modalNextMobile = document.getElementById('modalNextMobile');

    if (!containerElement || !modal) return;

    // Create a local instance for this specific gallery
    const instance = {
        isModalOpen: false,
        currentImageIndex: 0,
        imageItems: [],
        containerElement: containerElement
    };

    // Get all image items for this specific container
    function updateImageItems() {
        instance.imageItems = Array.from(containerElement.querySelectorAll(itemSelector));
    }
    updateImageItems();

    // Load image into modal
    function loadModalImage(index) {
        if (index < 0 || index >= instance.imageItems.length) return;

        instance.currentImageIndex = index;
        const item = instance.imageItems[index];
        const img = item.querySelector('img') || item;
        const src = img.src;
        const caption = item.dataset.caption || item.closest('[data-caption]')?.dataset.caption || '';

        // Update navigation buttons state
        modalPrev.classList.toggle('disabled', index === 0);
        modalNext.classList.toggle('disabled', index === instance.imageItems.length - 1);
        modalPrevMobile?.classList.toggle('disabled', index === 0);
        modalNextMobile?.classList.toggle('disabled', index === instance.imageItems.length - 1);

        // Show loader
        modalLoader.style.display = 'block';
        modalImage.style.display = 'none';
        modalText.textContent = caption;

        // Load image
        if (img.complete && img.src === src) {
            modalImage.src = src;
            modalImage.style.display = 'block';
            modalLoader.style.display = 'none';
        } else {
            const tempImg = new Image();
            tempImg.onload = () => {
                modalImage.src = src;
                modalImage.style.display = 'block';
                modalLoader.style.display = 'none';
            };
            tempImg.onerror = () => {
                modalImage.src = src;
                modalImage.style.display = 'block';
                modalLoader.style.display = 'none';
            };
            tempImg.src = src;
        }
    }

    // Navigate to previous image
    function navigatePrev() {
        if (instance.currentImageIndex > 0) {
            loadModalImage(instance.currentImageIndex - 1);
        }
    }

    // Navigate to next image
    function navigateNext() {
        if (instance.currentImageIndex < instance.imageItems.length - 1) {
            loadModalImage(instance.currentImageIndex + 1);
        }
    }

    // Handle clicks on images
    containerElement.addEventListener('click', (e) => {
        if (activeModalInstance && activeModalInstance.isModalOpen) return;

        // Check if clicked element matches selector or is within it
        const clickedItem = e.target.closest(itemSelector);
        if (!clickedItem) return;

        // Check if it's an image or contains an image
        const img = clickedItem.tagName === 'IMG' ? clickedItem : clickedItem.querySelector('img');
        if (!img) return;

        e.preventDefault();

        // Find index of clicked item
        const index = instance.imageItems.indexOf(clickedItem);
        if (index === -1) return;

        // Set this instance as active
        activeModalInstance = instance;
        instance.isModalOpen = true;

        // Show modal and load image
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
        loadModalImage(index);
    }, { passive: false });

    // Store navigation functions on the instance
    instance.navigatePrev = navigatePrev;
    instance.navigateNext = navigateNext;

    // Return the instance with its methods
    return instance;
}

// Global modal controls (initialized once)
let modalControlsInitialized = false;

function initGlobalModalControls() {
    if (modalControlsInitialized) return;
    modalControlsInitialized = true;

    const modal = document.getElementById('imageModal');
    const modalImage = document.getElementById('modalImage');
    const modalClose = document.getElementById('modalClose');
    const modalLoader = document.getElementById('modalLoader');
    const modalPrev = document.getElementById('modalPrev');
    const modalNext = document.getElementById('modalNext');
    const modalPrevMobile = document.getElementById('modalPrevMobile');
    const modalNextMobile = document.getElementById('modalNextMobile');

    // Close modal function
    function closeModal() {
        if (!activeModalInstance || !activeModalInstance.isModalOpen) return;

        activeModalInstance.isModalOpen = false;
        activeModalInstance = null;
        modal.classList.remove('active');
        document.body.style.overflow = '';

        // Clean up after transition
        setTimeout(() => {
            modalImage.src = '';
            modalImage.style.display = 'none';
            modalLoader.style.display = 'none';
        }, 200);
    }

    // Navigation button handlers
    modalPrev?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (activeModalInstance) activeModalInstance.navigatePrev();
    });

    modalNext?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (activeModalInstance) activeModalInstance.navigateNext();
    });

    modalPrevMobile?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (activeModalInstance) activeModalInstance.navigatePrev();
    });

    modalNextMobile?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (activeModalInstance) activeModalInstance.navigateNext();
    });

    // Close button
    modalClose?.addEventListener('click', closeModal, { passive: true });

    // Click outside to close
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    }, { passive: true });

    // Keyboard navigation
    document.addEventListener('keydown', (e) => {
        if (!activeModalInstance || !activeModalInstance.isModalOpen) return;

        switch (e.key) {
            case 'Escape':
                closeModal();
                break;
            case 'ArrowLeft':
                e.preventDefault();
                if (activeModalInstance) activeModalInstance.navigatePrev();
                break;
            case 'ArrowRight':
                e.preventDefault();
                if (activeModalInstance) activeModalInstance.navigateNext();
                break;
        }
    }, { passive: false });
}

// Initialize all gallery modal functionality
document.addEventListener("DOMContentLoaded", () => {
    // Initialize global modal controls first
    initGlobalModalControls();

    // Archivio gallery
    const archivioGallery = document.getElementById('archivioGallery');
    if (archivioGallery) {
        initImageModal(archivioGallery, '.gallery-item');
    }

    // Spazio carousel
    const spazioCarousel = document.getElementById('carouselTrack');
    if (spazioCarousel) {
        initImageModal(spazioCarousel, '.carousel-slide');
    }

    // Coworking carousel
    const coworkingCarousel = document.getElementById('coworkingCarouselTrack');
    if (coworkingCarousel) {
        initImageModal(coworkingCarousel, '.carousel-slide');
    }
});

// Archivio read more functionality
function initArchivioReadMore(language = 'it') {
    const archivioBtn = document.getElementById('archivioBtn');
    const archivioIntro = document.getElementById('archivioIntro');

    const texts = {
        it: {
            more: 'scopri di più',
            less: 'scopri di meno'
        },
        en: {
            more: 'read more',
            less: 'read less'
        }
    };

    if (archivioBtn && archivioIntro) {
        archivioBtn.addEventListener('click', () => {
            const isExpanded = archivioIntro.classList.contains('expanded');
            console.log(texts[language]);
            if (isExpanded) {
                archivioIntro.classList.remove('expanded');
                archivioBtn.textContent = texts[language].more;
            } else {
                archivioIntro.classList.add('expanded');
                archivioBtn.textContent = texts[language].less;
            }
        });
    }
}

// Initialize buttons read more functionality
document.addEventListener("DOMContentLoaded", () => {
    // Detect language from URL or meta tag
    const isEnglish = window.location.pathname.includes('eng') || document.documentElement.lang === 'en';
    console.log("isEnglish:", isEnglish);
    const language = isEnglish ? 'en' : 'it';
    initReadMore(language);
    initArchivioReadMore(language);
});
