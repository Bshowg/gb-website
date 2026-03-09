/**
 * Interactive Note System
 * Handles footnote navigation with smooth scrolling and highlighting
 */

class NoteSystem {
    constructor() {
        this.notes = [];
        this.activeNote = null;
        this.init();
    }

    init() {
        // Wait for DOM to be ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.setup());
        } else {
            this.setup();
        }
    }

    setup() {
        // Find all note references and footnotes
        this.noteRefs = document.querySelectorAll('.note-ref');
        this.footnotes = document.querySelectorAll('.footnote');
        
        // Create note mappings
        this.createNoteMappings();
        
        // Add click handlers
        this.addEventListeners();
        
        // Add return links to footnotes
        this.addReturnLinks();
        
        // Handle hash navigation on page load
        this.handleInitialHash();
    }

    createNoteMappings() {
        this.noteRefs.forEach((ref, index) => {
            const noteId = ref.getAttribute('href').substring(1);
            const footnote = document.getElementById(noteId);
            
            if (footnote) {
                this.notes.push({
                    ref: ref,
                    footnote: footnote,
                    id: noteId,
                    index: index + 1
                });
            }
        });
    }

    addEventListeners() {
        // Note reference clicks
        this.noteRefs.forEach((ref, index) => {
            ref.addEventListener('click', (e) => {
                e.preventDefault();
                this.jumpToNote(index);
            });
        });

        // ESC key to return from note
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.activeNote !== null) {
                this.returnFromNote();
            }
        });

        // Click outside note to deactivate
        document.addEventListener('click', (e) => {
            if (this.activeNote !== null) {
                const isNoteClick = e.target.closest('.footnote') || 
                                   e.target.closest('.note-ref');
                if (!isNoteClick) {
                    this.clearActiveNote();
                }
            }
        });
    }

    addReturnLinks() {
        this.footnotes.forEach((footnote, index) => {
            // Add return arrow at the end of each footnote
            const returnLink = document.createElement('a');
            returnLink.className = 'note-return';
            returnLink.href = '#';
            returnLink.innerHTML = ' ↩';
            returnLink.title = 'Torna al testo';
            returnLink.setAttribute('aria-label', 'Torna al riferimento nel testo');
            
            returnLink.addEventListener('click', (e) => {
                e.preventDefault();
                this.returnFromNote(index);
            });
            
            footnote.appendChild(returnLink);
        });
    }

    jumpToNote(index) {
        const note = this.notes[index];
        if (!note) return;

        // Clear previous active note
        this.clearActiveNote();
        
        // Mark as active
        this.activeNote = index;
        note.ref.classList.add('active');
        note.footnote.classList.add('active');
        
        // Smooth scroll to footnote
        this.smoothScroll(note.footnote);
        
        // Focus for accessibility
        note.footnote.setAttribute('tabindex', '-1');
        note.footnote.focus();
        
        // Update URL hash without jumping
        history.pushState(null, null, `#${note.id}`);
        
        // Highlight effect
        this.highlightElement(note.footnote);
    }

    returnFromNote(index = null) {
        const noteIndex = index !== null ? index : this.activeNote;
        if (noteIndex === null) return;
        
        const note = this.notes[noteIndex];
        if (!note) return;
        
        // Smooth scroll back to reference
        this.smoothScroll(note.ref);
        
        // Clear active state
        this.clearActiveNote();
        
        // Focus back to reference
        note.ref.focus();
        
        // Clear hash
        history.pushState(null, null, window.location.pathname);
        
        // Highlight reference briefly
        this.highlightElement(note.ref.parentElement);
    }

    clearActiveNote() {
        if (this.activeNote !== null) {
            const note = this.notes[this.activeNote];
            if (note) {
                note.ref.classList.remove('active');
                note.footnote.classList.remove('active');
            }
            this.activeNote = null;
        }
    }

    smoothScroll(element) {
        const rect = element.getBoundingClientRect();
        const absoluteTop = window.pageYOffset + rect.top;
        const offset = 100; // Offset from top for better visibility
        
        window.scrollTo({
            top: absoluteTop - offset,
            behavior: 'smooth'
        });
    }

    highlightElement(element) {
        element.classList.add('highlight');
        setTimeout(() => {
            element.classList.remove('highlight');
        }, 2000);
    }

    handleInitialHash() {
        if (window.location.hash) {
            const noteId = window.location.hash.substring(1);
            const noteIndex = this.notes.findIndex(n => n.id === noteId);
            
            if (noteIndex !== -1) {
                setTimeout(() => {
                    this.jumpToNote(noteIndex);
                }, 100);
            }
        }
    }

    // Public method to programmatically navigate to a note
    navigateToNote(noteNumber) {
        if (noteNumber > 0 && noteNumber <= this.notes.length) {
            this.jumpToNote(noteNumber - 1);
        }
    }
}

// Initialize the note system
let noteSystem = new NoteSystem();

// Export for use in other scripts if needed
window.NoteSystem = NoteSystem;
window.noteSystemInstance = noteSystem;

// Reinitialize when content changes (for SPAs)
document.addEventListener('DOMContentLoaded', () => {
    // Watch for content changes
    const observer = new MutationObserver((mutations) => {
        // Check if article content has changed
        if (document.querySelector('.footnotes-section')) {
            // Reinitialize the note system
            noteSystem = new NoteSystem();
            window.noteSystemInstance = noteSystem;
        }
    });
    
    // Start observing the document with the configured parameters
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
});

// Also reinitialize on history changes (for SPA navigation)
window.addEventListener('popstate', () => {
    setTimeout(() => {
        if (document.querySelector('.footnotes-section')) {
            noteSystem = new NoteSystem();
            window.noteSystemInstance = noteSystem;
        }
    }, 100);
});