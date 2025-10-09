// /game/input.js
export class InputHandler {
    constructor(canvas, renderer, gameState, config) {
        this.canvas = canvas;
        this.renderer = renderer;
        this.gameState = gameState;
        this.config = config;
        
        this.activeTouch = null;
        this.targetCard = null;
        this.autoHideTimer = null;
        this.smoothRotX = 0;
        this.smoothRotY = 0;
        
        this.setupListeners();
    }
    
    setupListeners() {
        this.canvas.addEventListener('touchstart', (e) => this.handleTouchStart(e), { passive: false });
        this.canvas.addEventListener('touchmove', (e) => this.handleTouchMove(e), { passive: false });
        this.canvas.addEventListener('touchend', (e) => this.handleTouchEnd(e), { passive: false });
        this.canvas.addEventListener('touchcancel', (e) => this.handleTouchEnd(e), { passive: false });
        
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.cancelPeek();
            }
        });
        
        window.addEventListener('orientationchange', () => {
            this.cancelPeek();
        });
    }
    
    handleTouchStart(e) {
        e.preventDefault();
        
        if (this.activeTouch || e.touches.length === 0) return;
        
        const touch = e.touches[0];
        this.activeTouch = touch.identifier;
        
        // Determine which player is touching based on screen position
        const rect = this.canvas.getBoundingClientRect();
        const y = touch.clientY - rect.top;
        const owner = y < rect.height / 2 ? 1 : 0;
        
        // Check turn gate
        if (this.config.turnGate === 'ownerOnly') {
            // Always allow in this mode for peek mechanics
        } else if (this.config.turnGate === 'turnOnly') {
            if (this.gameState.toAct !== owner) {
                return;
            }
        }
        
        // Find card at touch position
        this.targetCard = this.renderer.getCardMeshAt(touch.clientX, touch.clientY, owner);
        
        if (this.targetCard && this.targetCard.userData.owner === owner) {
            // Start auto-hide timer
            this.startAutoHideTimer();
        } else {
            this.targetCard = null;
        }
    }
    
    handleTouchMove(e) {
        e.preventDefault();
        
        if (!this.activeTouch || !this.targetCard) return;
        
        const touch = Array.from(e.touches).find(t => t.identifier === this.activeTouch);
        if (!touch) return;
        
        // Check if still over card
        const rect = this.canvas.getBoundingClientRect();
        const card = this.renderer.getCardMeshAt(touch.clientX, touch.clientY, this.targetCard.userData.owner);
        
        if (!card || card !== this.targetCard) {
            this.cancelPeek();
            return;
        }
        
        // Calculate card-local normalized coordinates
        const cardWorldPos = this.targetCard.position;
        
        // Project card position to screen
        const tempVec = new THREE.Vector3().copy(cardWorldPos);
        tempVec.project(this.renderer.camera);
        
        const cardScreenX = (tempVec.x + 1) / 2 * rect.width + rect.left;
        const cardScreenY = (-tempVec.y + 1) / 2 * rect.height + rect.top;
        
        // Calculate normalized offset from card center
        const cardWidth = 1.4 * rect.width / 20;
        const cardHeight = 1.96 * rect.height / 20;
        
        let nx = (touch.clientX - cardScreenX) / cardWidth;
        let ny = (touch.clientY - cardScreenY) / cardHeight;
        
        // Clamp to reasonable range
        nx = Math.max(-1, Math.min(1, nx));
        ny = Math.max(-1, Math.min(1, ny));
        
        // Adjust for owner (top player is rotated)
        if (this.targetCard.userData.owner === 1) {
            nx = -nx;
            ny = -ny;
        }
        
        // Calculate target rotations
        const targetRotX = ny * this.config.ROT_MAX_X_DEG;
        const targetRotY = nx * this.config.ROT_MAX_Y_DEG;
        
        // Smooth interpolation
        this.smoothRotX += (targetRotX - this.smoothRotX) * 0.3;
        this.smoothRotY += (targetRotY - this.smoothRotY) * 0.3;
        
        // Update QA if enabled
        if (this.config.fpsDebug && window.game) {
            window.game.updateQA(
                `${touch.clientX.toFixed(0)}, ${touch.clientY.toFixed(0)}`,
                `${nx.toFixed(2)}, ${ny.toFixed(2)}`,
                `X:${this.smoothRotX.toFixed(1)}° Y:${this.smoothRotY.toFixed(1)}°`,
                this.targetCard.userData.isRevealed ? 'REVEALED' : 'HIDDEN'
            );
        }
    }
    
    handleTouchEnd(e) {
        e.preventDefault();
        
        if (!this.activeTouch) return;
        
        const touch = Array.from(e.changedTouches).find(t => t.identifier === this.activeTouch);
        if (touch) {
            this.cancelPeek();
        }
    }
    
    startAutoHideTimer() {
        this.clearAutoHideTimer();
        
        if (this.config.autoHideMs > 0) {
            this.autoHideTimer = setTimeout(() => {
                if (this.targetCard) {
                    this.renderer.resetPeekRotation(this.targetCard);
                    this.smoothRotX = 0;
                    this.smoothRotY = 0;
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
    
    cancelPeek() {
        if (this.targetCard) {
            this.renderer.resetPeekRotation(this.targetCard);
        }
        
        this.activeTouch = null;
        this.targetCard = null;
        this.smoothRotX = 0;
        this.smoothRotY = 0;
        this.clearAutoHideTimer();
    }
    
    update() {
        if (this.targetCard && this.activeTouch) {
            this.renderer.applyPeekRotation(this.targetCard, this.smoothRotX, this.smoothRotY);
        }
    }
}