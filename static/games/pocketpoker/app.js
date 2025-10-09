// /app.js
import * as THREE from './three.module.js';
import { GameState } from './game/gameState.js';
import { GameRenderer } from './game/renderer.js';
import { InputHandler } from './game/input.js';

export const CONFIG = {
    ROT_MAX_X_DEG: 65,
    ROT_MAX_Y_DEG: 20,
    REVEAL_THRESHOLD_DEG: 30,
    HYSTERESIS_DEG: 6,
    autoHideMs: 1200,
    turnGate: "freePeek", // "ownerOnly" | "freePeek" | "turnOnly"
    fpsDebug: false,
    seed: null,
};

class PokerGame {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.gameState = new GameState(CONFIG.seed);
        this.renderer = new GameRenderer(this.canvas, CONFIG);
        this.input = new InputHandler(this.canvas, this.renderer, this.gameState, CONFIG);
        
        this.fpsFrames = [];
        this.lastFrameTime = performance.now();
        console.log(`Using seed: ${this.gameState.seed}`);
        this.setupUI();
        this.setupQA();
        this.setupPWA();
        this.start();
    }
    
    setupUI() {
        const readyBtn = document.getElementById('ready-btn');
        
        // New player-specific UI elements
        this.playerControls = {
            0: {
                container: document.getElementById('bottom-player-controls'),
                foldBtn: document.getElementById('bottom-fold-btn'),
                actionBtn: document.getElementById('bottom-action-btn'),
                slider: document.getElementById('bottom-bet-slider'),
                sliderValue: document.getElementById('bottom-slider-value')
            },
            1: {
                container: document.getElementById('top-player-controls'),
                foldBtn: document.getElementById('top-fold-btn'),
                actionBtn: document.getElementById('top-action-btn'),
                slider: document.getElementById('top-bet-slider'),
                sliderValue: document.getElementById('top-slider-value')
            }
        };
        
        readyBtn.addEventListener('click', () => {
            document.getElementById('pass-device-overlay').classList.add('hidden');
        });
        
        // Add click listener to pot display for next hand
        const potDisplay = document.getElementById('pot-display');
        potDisplay.addEventListener('click', () => {
            if (this.gameState.isHandComplete()) {
                this.awardPotAndStartNextHand();
            }
        });
        
        // Setup player-specific controls
        this.setupPlayerControls();
    }
    
    setupPlayerControls() {
        [0, 1].forEach(playerId => {
            const controls = this.playerControls[playerId];
            
            // Fold button
            controls.foldBtn.addEventListener('click', () => {
                console.log(`Player ${playerId} fold button clicked, toAct: ${this.gameState.toAct}`);
                if (this.gameState.toAct === playerId) {
                    this.gameState.processAction('fold', 0);
                    this.checkForNextStreet();
                }
            });
            
            // Action button - executes action based on slider amount
            controls.actionBtn.addEventListener('click', () => {
                console.log(`Player ${playerId} action button clicked, toAct: ${this.gameState.toAct}`);
                if (this.gameState.toAct === playerId) {
                    const currentPlayer = this.gameState.players[playerId];
                    const toCall = this.gameState.currentBet - currentPlayer.currentBet;
                    const sliderAmount = parseInt(controls.slider.value);
                    
                    console.log(`Action: toCall=${toCall}, sliderAmount=${sliderAmount}`);
                    
                    if (toCall === 0 && sliderAmount === 0) {
                        // Check (no money to call, slider at 0)
                        this.gameState.processAction('call', 0);
                    } else if (sliderAmount === toCall) {
                        // Call (slider amount equals call amount)
                        this.gameState.processAction('call', toCall);
                    } else if (sliderAmount > toCall) {
                        // Raise/Bet (slider amount is more than call)
                        this.gameState.processAction('raise', sliderAmount);
                    } else {
                        // Call with whatever amount is on slider (shouldn't happen with proper slider setup)
                        this.gameState.processAction('call', sliderAmount);
                    }
                    this.checkForNextStreet();
                }
            });
            
            // Slider
            controls.slider.addEventListener('input', () => {
                if (this.gameState.toAct === playerId) {
                    const value = parseInt(controls.slider.value);
                    console.log(`Player ${playerId} slider input: ${value}`);
                    controls.sliderValue.textContent = `$${value}`;
                    
                    // Update action button text based on new slider value
                    const currentPlayer = this.gameState.players[playerId];
                    const toCall = this.gameState.currentBet - currentPlayer.currentBet;
                    const canCheck = toCall === 0;
                    this.updateActionButtonText(controls, canCheck, toCall);
                }
            });
            
            // Slider change (when user releases) - just update display, no action
            controls.slider.addEventListener('change', () => {
                // No automatic action, just ensure display is updated
                if (this.gameState.toAct === playerId) {
                    const value = parseInt(controls.slider.value);
                    controls.sliderValue.textContent = `$${value}`;
                    console.log(`Player ${playerId} slider set to: ${value}`);
                }
            });
        });
    }

    updateActionButtonText(controls, canCheck, toCall) {
        const sliderAmount = parseInt(controls.slider.value);
        
        if (canCheck && sliderAmount === 0) {
            controls.actionBtn.textContent = 'Check';
        } else if (sliderAmount === toCall) {
            controls.actionBtn.textContent = `Call`;
        } else if (sliderAmount > toCall) {
            controls.actionBtn.textContent = `$${sliderAmount}`;
        } else {
            controls.actionBtn.textContent = `Call`;
        }
    }

    
    checkForNextStreet() {
        if (this.gameState.isHandComplete()) {
            this.showResults();
        } else if (this.gameState.isStreetComplete()) {
            setTimeout(() => {
                this.gameState.advanceStreet();
                this.renderer.updateScene(this.gameState);
                this.updateUI();
            }, 500);
        } else {
            this.renderer.updateScene(this.gameState);
            this.updateUI();
        }
    }
    
    showResults() {
        const resultOverlay = document.getElementById('result-overlay');
        const resultMessage = document.getElementById('result-message');
        
        const winner = this.gameState.determineWinner();
        if (winner.tie) {
            resultMessage.textContent = `Tie! Both players split the pot.\n${winner.handName}\n\nClick pot to continue`;
        } else {
            resultMessage.textContent = `Player ${winner.playerIndex + 1} wins with ${winner.handName}!\n\nClick pot to continue`;
        }
        
        this.renderer.updateScene(this.gameState);
        resultOverlay.classList.remove('hidden');
    }
    
    awardPotAndStartNextHand() {
        const winner = this.gameState.determineWinner();
        
        // Award the pot to the winner
        if (winner.tie) {
            // Split the pot
            const halfPot = Math.floor(this.gameState.pot / 2);
            this.gameState.players[0].stack += halfPot;
            this.gameState.players[1].stack += this.gameState.pot - halfPot; // Handle odd amounts
        } else {
            // Winner takes all
            this.gameState.players[winner.playerIndex].stack += this.gameState.pot;
        }
        
        // Hide result overlay and start new hand
        document.getElementById('result-overlay').classList.add('hidden');
        this.gameState.startNewHand();
        this.renderer.updateScene(this.gameState);
        this.updateUI();
    }
    
    updateUI() {
        const state = this.gameState;
        
        // Update player info
        document.querySelector('#top-player-info #top-player-controls .player-stack').textContent = `Stack $${state.players[1].stack}`;
        //document.querySelector('#top-player-info .player-bet').textContent = state.players[1].currentBet > 0 ? `Bet: $${state.players[1].currentBet}` : '';
        
        document.querySelector('#bottom-player-info #bottom-player-controls .player-stack').textContent = `Stack $${state.players[0].stack}`;
        //document.querySelector('#bottom-player-info .player-bet').textContent = state.players[0].currentBet > 0 ? `Bet: $${state.players[0].currentBet}` : '';
        
        // Update pot
        document.getElementById('pot-display').textContent = `Pot: $${state.pot}`;
        
        // Update street
        const streetNames = { preflop: 'Pre-Flop', flop: 'Flop', turn: 'Turn', river: 'River', showdown: 'Showdown' };
        document.getElementById('street-display').textContent = streetNames[state.street] || '';
        
        // Update dealer button position
        const dealerBtn = document.getElementById('dealer-button');
        if (state.dealerIndex === 0) {
            dealerBtn.style.top = 'auto';
            dealerBtn.style.bottom = '-40px';
        } else {
            dealerBtn.style.top = '-40px';
            dealerBtn.style.bottom = 'auto';
        }
        
        
        // Update player-specific controls
        this.updatePlayerControls();
    }
    
    updatePlayerControls() {
        const state = this.gameState;
        const isGameActive = state.street !== 'showdown' && !state.players.some(p => p.folded);
        
        console.log(`Updating player controls: toAct=${state.toAct}, isGameActive=${isGameActive}, street=${state.street}`);
        
        [0, 1].forEach(playerId => {
            const controls = this.playerControls[playerId];
            const isActivePlayer = state.toAct === playerId;
            const currentPlayer = state.players[playerId];
            const toCall = state.currentBet - currentPlayer.currentBet;
            const canCheck = toCall === 0;
            
            console.log(`Player ${playerId}: isActive=${isActivePlayer}, disabled=${controls.container.classList.contains('disabled')}`);
            
            // Always show controls but enable/disable based on game state and active player
            if (isGameActive && isActivePlayer) {
                // Enable controls for active player
                controls.container.classList.remove('disabled');
                console.log(`Enabled controls for player ${playerId}`);
                
                // Update action button text based on slider
                this.updateActionButtonText(controls, canCheck, toCall);
                
                // Update slider to reflect next action
                const callAmount = toCall;
                const minRaise = state.minRaise;
                const max = currentPlayer.stack;
                
                // Slider should start with call amount, range up to all-in
                const minSliderValue = callAmount; // Minimum is the call amount
                const maxSliderValue = max; // Maximum is all-in
                
                controls.slider.min = minSliderValue;
                controls.slider.max = maxSliderValue;
                
                // Only reset slider value if it's outside valid range
                if (parseInt(controls.slider.value) < minSliderValue || parseInt(controls.slider.value) > maxSliderValue) {
                    controls.slider.value = callAmount; // Default to call amount
                }
                
                // Update display with current slider value
                const currentSliderValue = parseInt(controls.slider.value);
                controls.sliderValue.textContent = `$${currentSliderValue}`;
                
                // Enable controls
                controls.foldBtn.disabled = false;
                controls.actionBtn.disabled = false;
                controls.slider.disabled = false;
            } else {
                // Disable controls for inactive player or when game is over
                controls.container.classList.add('disabled');
                
                // Show what the action would be if it were their turn
                controls.actionBtn.textContent = canCheck ? 'Check' : `Call $${toCall}`;
                
                // Set default values for inactive player
                if (isGameActive) {
                    const min = state.minRaise;
                    const max = currentPlayer.stack;
                    const defaultBet = Math.floor((min + max) / 2);
                    controls.sliderValue.textContent = `$${defaultBet}`;
                } else {
                    controls.actionBtn.textContent = 'Action';
                    controls.sliderValue.textContent = '$0';
                }
                
                // Disable controls
                controls.foldBtn.disabled = true;
                controls.actionBtn.disabled = true;
                controls.slider.disabled = true;
            }
        });
    }
    
    setupQA() {
        const qaToggle = document.getElementById('qa-toggle');
        const qaOverlay = document.getElementById('qa-overlay');
        const qaClose = document.getElementById('qa-close');
        
        qaToggle.addEventListener('click', () => {
            qaOverlay.classList.toggle('hidden');
        });
        
        qaClose.addEventListener('click', () => {
            qaOverlay.classList.add('hidden');
        });
    }
    
    updateQA(touchInfo, cardInfo, rotInfo, stateInfo) {
        if (!CONFIG.fpsDebug) return;
        
        document.getElementById('qa-touch').textContent = touchInfo || '-';
        document.getElementById('qa-local').textContent = cardInfo || '-';
        document.getElementById('qa-rotation').textContent = rotInfo || '-';
        document.getElementById('qa-state').textContent = stateInfo || '-';
    }
    
    updateFPS() {
        const now = performance.now();
        this.fpsFrames.push(now);
        
        // Keep last 60 frames
        while (this.fpsFrames.length > 60) {
            this.fpsFrames.shift();
        }
        
        if (this.fpsFrames.length >= 2) {
            const elapsed = this.fpsFrames[this.fpsFrames.length - 1] - this.fpsFrames[0];
            const fps = Math.round((this.fpsFrames.length - 1) / elapsed * 1000);
            document.getElementById('qa-fps').textContent = fps;
        }
    }
    
    setupPWA() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js').catch(() => {});
        }
        
        let deferredPrompt;
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            deferredPrompt = e;
            
            const installPrompt = document.getElementById('install-prompt');
            installPrompt.classList.remove('hidden');
            
            document.getElementById('install-dismiss').addEventListener('click', () => {
                installPrompt.classList.add('hidden');
            });
        });
    }
    
    start() {
        this.gameState.startNewHand();
        this.renderer.updateScene(this.gameState);
        this.updateUI();
        this.animate();
    }
    
    animate() {
        requestAnimationFrame(() => this.animate());
        
        this.input.update();
        this.renderer.render();
        
        if (CONFIG.fpsDebug) {
            this.updateFPS();
        }
    }
}

// Parse seed from URL
const params = new URLSearchParams(window.location.search);
if (params.has('seed')) {
    CONFIG.seed = params.get('seed');
}

// Start game when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => new PokerGame());
} else {
    new PokerGame();
}