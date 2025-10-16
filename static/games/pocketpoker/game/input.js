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
        this.slidePosition = {}; // Track slide position for each player
        this.slidePosition[0] = 0; // Player 0 slide position
        this.slidePosition[1] = 0; // Player 1 slide position
        this.startX = 0;
        
        // Drag-to-fold functionality
        this.longPressTimer = null;
        this.isDragging = false;
        this.dragStartTime = null;
        this.dragStartPosition = { x: 0, y: 0 };
        this.currentDragPosition = { x: 0, y: 0 };
        this.draggedCard = null;
        
        this.setupListeners();
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
        
        // Mouse events for desktop devices
        this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e), { passive: false });
        this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e), { passive: false });
        this.canvas.addEventListener('mouseup', (e) => this.handleMouseUp(e), { passive: false });
        this.canvas.addEventListener('mouseleave', (e) => this.handleMouseUp(e), { passive: false });
        
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
        
        // Check if touching in player's area and if there are cards to reveal
        const playerCards = this.renderer.getPlayerCards(owner);
        if (playerCards.length === 0) {
            this.activeTouch = null;
            return;
        }
        
        // Check turn gate
        if (this.config.turnGate === 'ownerOnly') {
            // Always allow in this mode for peek mechanics
        } else if (this.config.turnGate === 'turnOnly') {
            if (this.gameState.toAct !== owner) {
                this.activeTouch = null;
                return;
            }
        }
        
        this.targetOwner = owner;
        this.startX = touch.clientX;
        
        // Store initial drag position
        this.dragStartPosition.x = touch.clientX;
        this.dragStartPosition.y = touch.clientY;
        this.dragStartTime = Date.now();
        
        // Start long press timer for drag-to-fold
        this.startLongPressTimer();
        
        this.startAutoHideTimer();
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
        
        // Check if we're in drag mode
        if (this.isDragging) {
            // Handle drag-to-fold functionality
            this.updateDragVisuals();
            return;
        }
        
        // Regular card peek functionality
        // Calculate horizontal slide distance (can be positive or negative)
        const deltaX = touch.clientX - this.startX;
        const rect = this.canvas.getBoundingClientRect();
        const slideDistance = Math.abs(deltaX) / (rect.width * 0.3); // Normalize slide distance magnitude
        
        // Cancel long press timer if significant movement is detected (more than slide)
        const totalMovement = Math.sqrt(
            Math.pow(touch.clientX - this.dragStartPosition.x, 2) + 
            Math.pow(touch.clientY - this.dragStartPosition.y, 2)
        );
        if (totalMovement > 30) { // 30px threshold for movement
            this.clearLongPressTimer();
        }
        
        // Clamp slide to 0-1 range (0 = hidden, 1 = fully revealed at 180°)
        this.slidePosition[this.targetOwner] = Math.max(0, Math.min(1, slideDistance));
        
        
        // Update QA if enabled
        if (this.config.fpsDebug && window.game) {
            window.game.updateQA(
                `${touch.clientX.toFixed(0)}, ${touch.clientY.toFixed(0)}`,
                `ΔX: ${deltaX.toFixed(0)}, Slide: ${this.slidePosition[this.targetOwner].toFixed(2)}`,
                `Rotation: ${(this.slidePosition[this.targetOwner] * 180).toFixed(1)}°`,
                this.slidePosition[this.targetOwner] > 0.5 ? 'REVEALED' : 'HIDDEN'
            );
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
        
        // Check if clicking in player's area and if there are cards to reveal
        const playerCards = this.renderer.getPlayerCards(owner);
        if (playerCards.length === 0) {
            this.activeTouch = null;
            return;
        }
        
        // Check turn gate
        if (this.config.turnGate === 'ownerOnly') {
            // Always allow in this mode for peek mechanics
        } else if (this.config.turnGate === 'turnOnly') {
            if (this.gameState.toAct !== owner) {
                this.activeTouch = null;
                return;
            }
        }
        
        this.targetOwner = owner;
        this.startX = e.clientX;
        
        // Store initial drag position
        this.dragStartPosition.x = e.clientX;
        this.dragStartPosition.y = e.clientY;
        this.dragStartTime = Date.now();
        
        // Start long press timer for drag-to-fold
        this.startLongPressTimer();
        
        this.startAutoHideTimer();
    }
    
    handleMouseMove(e) {
        e.preventDefault();
        e.stopPropagation();
        
        if (this.activeTouch !== 'mouse' || this.targetOwner === null) return;
        
        // Update current drag position
        this.currentDragPosition.x = e.clientX;
        this.currentDragPosition.y = e.clientY;
        
        // Check if we're in drag mode
        if (this.isDragging) {
            // Handle drag-to-fold functionality
            this.updateDragVisuals();
            return;
        }
        
        // Regular card peek functionality
        // Calculate horizontal slide distance (can be positive or negative)
        const deltaX = e.clientX - this.startX;
        const rect = this.canvas.getBoundingClientRect();
        const slideDistance = Math.abs(deltaX) / (rect.width * 0.3); // Normalize slide distance magnitude
        
        // Cancel long press timer if significant movement is detected (more than slide)
        const totalMovement = Math.sqrt(
            Math.pow(e.clientX - this.dragStartPosition.x, 2) + 
            Math.pow(e.clientY - this.dragStartPosition.y, 2)
        );
        if (totalMovement > 30) { // 30px threshold for movement
            this.clearLongPressTimer();
        }
        
        // Clamp slide to 0-1 range (0 = hidden, 1 = fully revealed at 180°)
        this.slidePosition[this.targetOwner] = Math.max(0, Math.min(1, slideDistance));
        
        // Update QA if enabled
        if (this.config.fpsDebug && window.game) {
            window.game.updateQA(
                `${e.clientX.toFixed(0)}, ${e.clientY.toFixed(0)}`,
                `ΔX: ${deltaX.toFixed(0)}, Slide: ${this.slidePosition[this.targetOwner].toFixed(2)}`,
                `Rotation: ${(this.slidePosition[this.targetOwner] * 180).toFixed(1)}°`,
                this.slidePosition[this.targetOwner] > 0.5 ? 'REVEALED' : 'HIDDEN'
            );
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
    
    startAutoHideTimer() {
        this.clearAutoHideTimer();
        
        if (this.config.autoHideMs > 0) {
            this.autoHideTimer = setTimeout(() => {
                if (this.targetOwner !== null) {
                    this.slidePosition[this.targetOwner] = 0;
                    this.renderer.updatePlayerCardsRotation(this.targetOwner, 0);
                }
            }, this.config.autoHideMs);
        }
    }
    
    clearAutoHideTimer() {
        if (this.autoHideTimer) {
            clearTimeout(this.autoHideTimer);
            this.autoHideTimer = null;
        }
    }
    
    
    cancelSlide() {
        if (this.targetOwner !== null) {
            this.slidePosition[this.targetOwner] = 0;
            this.renderer.updatePlayerCardsRotation(this.targetOwner, 0);
        }
        
        
        // Clean up drag state
        this.isDragging = false;
        this.draggedCard = null;
        
        this.activeTouch = null;
        this.targetOwner = null;
        this.clearAutoHideTimer();
        this.clearLongPressTimer();
    }
    
    update() {
        if (this.targetOwner !== null && this.activeTouch !== null) {
            const rotationAngle = this.slidePosition[this.targetOwner] * 180; // 0 to 180 degrees
            this.renderer.updatePlayerCardsRotation(this.targetOwner, rotationAngle);
        }
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