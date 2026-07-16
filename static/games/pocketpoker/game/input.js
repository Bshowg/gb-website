import * as THREE from '../three.module.js';

export class InputHandler {
    constructor(canvas, renderer, gameState, config) {
        this.canvas = canvas;
        this.renderer = renderer;
        this.gameState = gameState;
        this.config = config;
        
        this.activeTouch = null;
        this.targetOwner = null;
        this.autoHideTimer = null;
        this.startX = 0;

        // Drag-to-fold functionality
        this.longPressTimer = null;
        this.isDragging = false;
        this.dragStartTime = null;
        this.dragStartPosition = { x: 0, y: 0 };
        this.currentDragPosition = { x: 0, y: 0 };
        this.draggedCard = null;

        this.setupListeners();

        // Card peeking lives on dedicated sliders, so the canvas gestures
        // above stay reserved for drag-to-fold and never conflict
        this.peekSliders = [
            new PeekSlider(document.getElementById('bottom-peek-slider'), 0, renderer, gameState, config),
            new PeekSlider(document.getElementById('top-peek-slider'), 1, renderer, gameState, config)
        ];
    }
    
    setupListeners() {
        // Touch events for mobile devices
        this.canvas.addEventListener('touchstart', (e) => this.handleTouchStart(e), { passive: false, capture: true });
        this.canvas.addEventListener('touchmove', (e) => this.handleTouchMove(e), { passive: false, capture: true });
        this.canvas.addEventListener('touchend', (e) => this.handleTouchEnd(e), { passive: false, capture: true });
        this.canvas.addEventListener('touchcancel', (e) => this.handleTouchEnd(e), { passive: false, capture: true });
        
        // Fallback document-level listeners for better touch handling
        document.addEventListener('touchmove', (e) => {
            if (this.activeTouch !== null) {
                this.handleTouchMove(e);
            }
        }, { passive: false });
        
        document.addEventListener('touchend', (e) => {
            if (this.activeTouch !== null) {
                this.handleTouchEnd(e);
            }
        }, { passive: false });
        
        document.addEventListener('touchcancel', (e) => {
            if (this.activeTouch !== null) {
                this.handleTouchEnd(e);
            }
        }, { passive: false });
        
        // Mouse events for desktop devices. Move/up listen on the document so
        // the fold drag keeps working when the cursor passes over UI overlays
        // (canvas-only listeners lose the pointer there and snapped cards back)
        this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e), { passive: false });
        document.addEventListener('mousemove', (e) => {
            if (this.activeTouch === 'mouse') {
                this.handleMouseMove(e);
            }
        }, { passive: false });
        document.addEventListener('mouseup', (e) => {
            if (this.activeTouch === 'mouse') {
                this.handleMouseUp(e);
            }
        }, { passive: false });
        
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.cancelSlide();
            }
        });
        
        window.addEventListener('orientationchange', () => {
            this.cancelSlide();
        });
    }
    
    handleTouchStart(e) {
        e.preventDefault();
        e.stopPropagation();
        
        if (this.activeTouch !== null || e.touches.length === 0) return;
        
        const touch = e.touches[0];
        this.activeTouch = touch.identifier;
        
        // Determine which player is touching based on screen position
        const rect = this.canvas.getBoundingClientRect();
        const y = touch.clientY - rect.top;
        const owner = y < rect.height / 2 ? 1 : 0;
        
        // Check if touching in player's area and if there are cards to fold
        const playerCards = this.renderer.getPlayerCards(owner);
        if (playerCards.length === 0) {
            this.activeTouch = null;
            return;
        }

        this.targetOwner = owner;
        this.startX = touch.clientX;

        // Store initial drag position
        this.dragStartPosition.x = touch.clientX;
        this.dragStartPosition.y = touch.clientY;
        this.dragStartTime = Date.now();

        // Start long press timer for drag-to-fold
        this.startLongPressTimer();
    }
    
    handleTouchMove(e) {
        e.preventDefault();
        e.stopPropagation();
        
        if (this.activeTouch === null || this.targetOwner === null) return;
        
        const touch = Array.from(e.touches).find(t => t.identifier === this.activeTouch);
        if (!touch) return;
        
        // Update current drag position
        this.currentDragPosition.x = touch.clientX;
        this.currentDragPosition.y = touch.clientY;
        
        // Only drag-to-fold uses canvas movement; peeking happens on the sliders
        if (this.isDragging) {
            this.updateDragVisuals();
        }
    }
    
    handleTouchEnd(e) {
        e.preventDefault();
        e.stopPropagation();
        
        if (this.activeTouch === null) return;
        
        const touch = Array.from(e.changedTouches).find(t => t.identifier === this.activeTouch);
        if (touch) {
            // Handle drag end if we were dragging
            if (this.isDragging) {
                this.handleDragEnd(touch);
                return;
            }
            this.cancelSlide();
        }
    }
    
    handleMouseDown(e) {
        e.preventDefault();
        e.stopPropagation();
        
        if (this.activeTouch !== null) return;
        
        // Simulate touch identifier for mouse
        this.activeTouch = 'mouse';
        
        // Determine which player is clicking based on screen position
        const rect = this.canvas.getBoundingClientRect();
        const y = e.clientY - rect.top;
        const owner = y < rect.height / 2 ? 1 : 0;
        
        // Check if clicking in player's area and if there are cards to fold
        const playerCards = this.renderer.getPlayerCards(owner);
        if (playerCards.length === 0) {
            this.activeTouch = null;
            return;
        }

        this.targetOwner = owner;
        this.startX = e.clientX;

        // Store initial drag position
        this.dragStartPosition.x = e.clientX;
        this.dragStartPosition.y = e.clientY;
        this.dragStartTime = Date.now();

        // Start long press timer for drag-to-fold
        this.startLongPressTimer();
    }
    
    handleMouseMove(e) {
        e.preventDefault();
        e.stopPropagation();
        
        if (this.activeTouch !== 'mouse' || this.targetOwner === null) return;
        
        // Update current drag position
        this.currentDragPosition.x = e.clientX;
        this.currentDragPosition.y = e.clientY;
        
        // Only drag-to-fold uses canvas movement; peeking happens on the sliders
        if (this.isDragging) {
            this.updateDragVisuals();
        }
    }
    
    handleMouseUp(e) {
        e.preventDefault();
        e.stopPropagation();
        
        if (this.activeTouch === 'mouse') {
            // Handle drag end if we were dragging
            if (this.isDragging) {
                this.handleDragEnd({ clientX: e.clientX, clientY: e.clientY });
            } else {
                this.cancelSlide();
            }
        }
    }
    
    clearAutoHideTimer() {
        if (this.autoHideTimer) {
            clearTimeout(this.autoHideTimer);
            this.autoHideTimer = null;
        }
    }

    cancelSlide() {
        // Clean up any pending fold gesture
        document.body.classList.remove('dragging-cards');
        this.isDragging = false;
        this.draggedCard = null;

        this.activeTouch = null;
        this.targetOwner = null;
        this.clearAutoHideTimer();
        this.clearLongPressTimer();
    }

    update() {
        // Peek rotation is driven by the sliders; drag visuals by move events
    }
    
    startLongPressTimer() {
        this.clearLongPressTimer();
        
        // Start configurable timer for long press detection
        this.longPressTimer = setTimeout(() => {
            this.startDragMode();
        }, this.config.longPressDurationMs);
    }
    
    clearLongPressTimer() {
        if (this.longPressTimer) {
            clearTimeout(this.longPressTimer);
            this.longPressTimer = null;
        }
    }
    
    startDragMode() {
        // Only start drag mode if player can currently act (fold)
        if (this.gameState.toAct !== this.targetOwner) {
            return;
        }

        console.log(`Starting drag mode for player ${this.targetOwner}`);
        this.isDragging = true;
        this.clearAutoHideTimer(); // Stop auto-hide during drag

        // Fade the UI overlay and stop it from catching the pointer, so the
        // drag survives passing over the sliders/betting controls
        document.body.classList.add('dragging-cards');

        // Scale up cards and start following touch
        this.renderer.startCardDrag(this.targetOwner, 1.5);
    }
    
    updateDragVisuals() {
        if (!this.isDragging || this.targetOwner === null) return;
        
        // Update card position to follow touch
        const rect = this.canvas.getBoundingClientRect();
        const normalizedX = (this.currentDragPosition.x - rect.left) / rect.width;
        const normalizedY = (this.currentDragPosition.y - rect.top) / rect.height;
        
        this.renderer.updateCardDragPosition(this.targetOwner, normalizedX, normalizedY);
    }
    
    handleDragEnd(touch) {
        if (!this.isDragging) {
            this.cancelSlide();
            return;
        }
        
        console.log('Handling drag end');
        
        // Determine drop zone
        const rect = this.canvas.getBoundingClientRect();
        const normalizedX = (touch.clientX - rect.left) / rect.width;
        const normalizedY = (touch.clientY - rect.top) / rect.height;
        
        // Define center area (middle 40% of screen both horizontally and vertically)
        const centerMinX = 0.3;
        const centerMaxX = 0.7;
        const centerMinY = 0.3;
        const centerMaxY = 0.7;
        
        const isInCenterArea = normalizedX >= centerMinX && normalizedX <= centerMaxX &&
                              normalizedY >= centerMinY && normalizedY <= centerMaxY;
        
        if (isInCenterArea) {
            // Dropped in center - trigger fold action
            console.log(`Player ${this.targetOwner} dropped cards in center - folding`);
            this.executeFold();
        } else {
            // Dropped elsewhere - return to original position
            console.log(`Player ${this.targetOwner} dropped cards outside center - returning to position`);
            this.returnCardsToPosition();
        }
        
        // Clean up drag state
        document.body.classList.remove('dragging-cards');
        this.isDragging = false;
        this.draggedCard = null;
        this.activeTouch = null;
        this.targetOwner = null;
        this.clearLongPressTimer();
    }
    
    executeFold() {
        // Trigger fold action through game state
        if (this.gameState.toAct === this.targetOwner) {
            console.log(`Executing fold for player ${this.targetOwner}`);
            this.gameState.processAction('fold', 0);
            
            // Notify the main game instance to handle the fold
            if (window.gameInstance) {
                window.gameInstance.saveGameState();
                window.gameInstance.checkForNextStreet();
            }
        }
        
        // Reset cards
        this.renderer.resetCardDrag(this.targetOwner);
    }
    
    returnCardsToPosition() {
        // Animate cards back to original position
        this.renderer.resetCardDrag(this.targetOwner);
    }
}

// Dedicated peek control: drag the card-back knob to rotate your own cards.
// Springs back (and hides the cards) on release, so a peek is always momentary.
export class PeekSlider {
    constructor(el, owner, renderer, gameState, config) {
        // Rebinding on a new match: detach the previous instance's listeners
        if (el._peekSlider) {
            el._peekSlider.destroy();
        }
        el._peekSlider = this;

        this.el = el;
        this.track = el.querySelector('.peek-track');
        this.thumb = el.querySelector('.peek-thumb');
        this.owner = owner;
        this.renderer = renderer;
        this.gameState = gameState;
        this.config = config;
        this.pointerId = null;
        this.idleTimer = null;

        this.onDown = this.onDown.bind(this);
        this.onMove = this.onMove.bind(this);
        this.onUp = this.onUp.bind(this);

        this.track.addEventListener('pointerdown', this.onDown);
        this.track.addEventListener('pointermove', this.onMove);
        this.track.addEventListener('pointerup', this.onUp);
        this.track.addEventListener('pointercancel', this.onUp);
    }

    onDown(e) {
        if (this.pointerId !== null) return;
        if (this.renderer.getPlayerCards(this.owner).length === 0) return;
        if (this.config.turnGate === 'turnOnly' && this.gameState.toAct !== this.owner) return;

        this.pointerId = e.pointerId;
        try { this.track.setPointerCapture(e.pointerId); } catch (err) { /* synthetic events */ }
        this.thumb.classList.add('dragging');
        this.applyClientX(e.clientX);
    }

    onMove(e) {
        if (this.pointerId === null || e.pointerId !== this.pointerId) return;
        this.applyClientX(e.clientX);
    }

    onUp(e) {
        if (this.pointerId === null || e.pointerId !== this.pointerId) return;
        this.release();
    }

    applyClientX(clientX) {
        const rect = this.track.getBoundingClientRect();
        let fraction = (clientX - rect.left) / rect.width;
        fraction = Math.max(0, Math.min(1, fraction));
        // The top player's slider is rendered rotated 180°, so screen X is inverted
        if (this.owner === 1) fraction = 1 - fraction;

        const travel = this.track.clientWidth - this.thumb.offsetWidth - 4;
        this.thumb.style.transform = `translateX(${fraction * travel}px)`;
        this.renderer.updatePlayerCardsRotation(this.owner, fraction * 180);
        this.restartIdleTimer();
    }

    restartIdleTimer() {
        clearTimeout(this.idleTimer);
        if (this.config.autoHideMs > 0) {
            this.idleTimer = setTimeout(() => this.release(), this.config.autoHideMs);
        }
    }

    release() {
        clearTimeout(this.idleTimer);
        this.idleTimer = null;
        if (this.pointerId !== null) {
            try { this.track.releasePointerCapture(this.pointerId); } catch (err) { /* already released */ }
            this.pointerId = null;
        }
        this.thumb.classList.remove('dragging');
        this.thumb.style.transform = 'translateX(0px)';
        this.renderer.updatePlayerCardsRotation(this.owner, 0);
    }

    destroy() {
        this.release();
        this.track.removeEventListener('pointerdown', this.onDown);
        this.track.removeEventListener('pointermove', this.onMove);
        this.track.removeEventListener('pointerup', this.onUp);
        this.track.removeEventListener('pointercancel', this.onUp);
        if (this.el._peekSlider === this) {
            this.el._peekSlider = null;
        }
    }
}