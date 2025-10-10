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
        this.startAutoHideTimer();
    }
    
    handleTouchMove(e) {
        e.preventDefault();
        e.stopPropagation();
        
        if (this.activeTouch === null || this.targetOwner === null) return;
        
        const touch = Array.from(e.touches).find(t => t.identifier === this.activeTouch);
        if (!touch) return;
        
        // Calculate horizontal slide distance (can be positive or negative)
        const deltaX = touch.clientX - this.startX;
        const rect = this.canvas.getBoundingClientRect();
        const slideDistance = Math.abs(deltaX) / (rect.width * 0.3); // Normalize slide distance magnitude
        
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
        this.startAutoHideTimer();
    }
    
    handleMouseMove(e) {
        e.preventDefault();
        e.stopPropagation();
        
        if (this.activeTouch !== 'mouse' || this.targetOwner === null) return;
        
        // Calculate horizontal slide distance (can be positive or negative)
        const deltaX = e.clientX - this.startX;
        const rect = this.canvas.getBoundingClientRect();
        const slideDistance = Math.abs(deltaX) / (rect.width * 0.3); // Normalize slide distance magnitude
        
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
            this.cancelSlide();
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
        
        this.activeTouch = null;
        this.targetOwner = null;
        this.clearAutoHideTimer();
    }
    
    update() {
        if (this.targetOwner !== null && this.activeTouch !== null) {
            const rotationAngle = this.slidePosition[this.targetOwner] * 180; // 0 to 180 degrees
            this.renderer.updatePlayerCardsRotation(this.targetOwner, rotationAngle);
        }
    }
}