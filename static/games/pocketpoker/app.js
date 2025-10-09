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
    turnGate: "ownerOnly", // "ownerOnly" | "freePeek" | "turnOnly"
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
        const foldBtn = document.getElementById('fold-btn');
        const checkCallBtn = document.getElementById('check-call-btn');
        const betRaiseBtn = document.getElementById('bet-raise-btn');
        const sizingPanel = document.getElementById('sizing-panel');
        const confirmBetBtn = document.getElementById('confirm-bet-btn');
        const cancelBetBtn = document.getElementById('cancel-bet-btn');
        const betSlider = document.getElementById('bet-slider');
        const sliderValue = document.getElementById('slider-value');
        const readyBtn = document.getElementById('ready-btn');
        const nextHandBtn = document.getElementById('next-hand-btn');
        
        let pendingBetAmount = 0;
        
        foldBtn.addEventListener('click', () => {
            this.gameState.processAction('fold', 0);
            this.checkForNextStreet();
        });
        
        checkCallBtn.addEventListener('click', () => {
            const callAmount = this.gameState.currentBet - this.gameState.players[this.gameState.toAct].currentBet;
            this.gameState.processAction('call', callAmount);
            this.checkForNextStreet();
        });
        
        betRaiseBtn.addEventListener('click', () => {
            sizingPanel.classList.remove('hidden');
            this.updateBetSlider();
        });
        
        document.querySelectorAll('.size-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const size = btn.dataset.size;
                if (size === 'allin') {
                    pendingBetAmount = this.gameState.players[this.gameState.toAct].stack;
                } else {
                    const potSize = parseFloat(size) * this.gameState.pot;
                    const currentPlayer = this.gameState.players[this.gameState.toAct];
                    const toCall = this.gameState.currentBet - currentPlayer.currentBet;
                    pendingBetAmount = Math.min(Math.floor(toCall + potSize), currentPlayer.stack);
                }
                sliderValue.textContent = `$${pendingBetAmount}`;
            });
        });
        
        betSlider.addEventListener('input', () => {
            const currentPlayer = this.gameState.players[this.gameState.toAct];
            const min = this.gameState.minRaise;
            const max = currentPlayer.stack;
            const value = parseInt(betSlider.value);
            pendingBetAmount = Math.floor(min + (max - min) * (value / 100));
            sliderValue.textContent = `$${pendingBetAmount}`;
        });
        
        confirmBetBtn.addEventListener('click', () => {
            sizingPanel.classList.add('hidden');
            this.gameState.processAction('raise', pendingBetAmount);
            this.checkForNextStreet();
        });
        
        cancelBetBtn.addEventListener('click', () => {
            sizingPanel.classList.add('hidden');
        });
        
        readyBtn.addEventListener('click', () => {
            document.getElementById('pass-device-overlay').classList.add('hidden');
        });
        
        nextHandBtn.addEventListener('click', () => {
            document.getElementById('result-overlay').classList.add('hidden');
            this.gameState.startNewHand();
            this.renderer.updateScene(this.gameState);
            this.updateUI();
        });
    }
    
    updateBetSlider() {
        const slider = document.getElementById('bet-slider');
        const currentPlayer = this.gameState.players[this.gameState.toAct];
        const min = this.gameState.minRaise;
        const max = currentPlayer.stack;
        
        slider.min = 0;
        slider.max = 100;
        slider.value = 50;
        
        document.getElementById('slider-value').textContent = `$${Math.floor((min + max) / 2)}`;
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
            resultMessage.textContent = `Tie! Both players split the pot.\n${winner.handName}`;
        } else {
            resultMessage.textContent = `Player ${winner.playerIndex + 1} wins with ${winner.handName}!`;
        }
        
        this.renderer.updateScene(this.gameState);
        resultOverlay.classList.remove('hidden');
    }
    
    updateUI() {
        const state = this.gameState;
        
        // Update player info
        document.querySelector('#top-player-info .player-stack').textContent = `Stack: $${state.players[1].stack}`;
        document.querySelector('#top-player-info .player-bet').textContent = state.players[1].currentBet > 0 ? `Bet: $${state.players[1].currentBet}` : '';
        
        document.querySelector('#bottom-player-info .player-stack').textContent = `Stack: $${state.players[0].stack}`;
        document.querySelector('#bottom-player-info .player-bet').textContent = state.players[0].currentBet > 0 ? `Bet: $${state.players[0].currentBet}` : '';
        
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
        
        // Update action buttons
        const currentPlayer = state.players[state.toAct];
        const toCall = state.currentBet - currentPlayer.currentBet;
        const canCheck = toCall === 0;
        
        document.getElementById('check-call-btn').textContent = canCheck ? 'Check' : `Call $${toCall}`;
        document.getElementById('bet-raise-btn').textContent = state.currentBet > 0 ? 'Raise' : 'Bet';
        
        const actionPanel = document.getElementById('action-panel');
        if (state.street === 'showdown' || state.players.some(p => p.folded)) {
            actionPanel.style.display = 'none';
        } else {
            actionPanel.style.display = 'block';
        }
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