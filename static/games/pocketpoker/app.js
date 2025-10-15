// /app.js
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
        
        // Match statistics tracking
        this.matchStats = {
            startTime: Date.now(),
            handsPlayed: 0,
            biggestPot: 0,
            totalPots: 0
        };
        
        // UI state flags
        this.showingWinnerMessage = false;
        console.log(`Using seed: ${this.gameState.seed}`);
        this.applyUserSettings(); // Apply saved settings
        this.setupUI();
        this.setupQA();
        this.setupPWA();
        this.setupAutoSave();
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
        
        // Add click listener to pot display for manual advance or immediate continue
        const potDisplay = document.getElementById('pot-display');
        potDisplay.addEventListener('click', () => {
            if (this.gameState.isHandComplete() && this.showingWinnerMessage) {
                // If showing winner message, immediately advance to next hand
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
                    this.saveGameState(); // Auto-save after action
                    this.checkForNextStreet();
                }
            });
            
            // Action button - executes action based on slider amount or handles continue in all-in
            controls.actionBtn.addEventListener('click', () => {
                console.log(`Player ${playerId} action button clicked, toAct: ${this.gameState.toAct}`);
                
               
                
                // Normal betting flow - only active player can act
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
                    this.saveGameState(); // Auto-save after action
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

    updateActionButtonText(controls, canCheck, toCall, isAllIn=false) {
        const sliderAmount = parseInt(controls.slider.value);
        
        if (isAllIn) {
            controls.actionBtn.textContent = 'Continue';
        }else if (canCheck && sliderAmount === 0) {
            controls.actionBtn.textContent = 'Check';
        } else if (sliderAmount === toCall) {
            controls.actionBtn.textContent = `Call`;
        } else if (sliderAmount > toCall) {
            controls.actionBtn.textContent = `$${sliderAmount}`;
        }
        else {
            controls.actionBtn.textContent = `Call`;
        }
    }

    
    checkForNextStreet() {
        if (this.gameState.isHandComplete()) {
            this.showResults();
        } else if (this.gameState.isStreetComplete()) {
            setTimeout(() => {
                this.gameState.advanceStreet();
                this.saveGameState(); // Auto-save after street advance
                this.renderer.updateScene(this.gameState);
                this.updateUI();
            }, 500);
        } else {
            this.renderer.updateScene(this.gameState);
            this.updateUI();
        }
    }
    
    showResults() {
        const winner = this.gameState.determineWinner();
        
        // Set a flag to indicate we're showing winner message
        this.showingWinnerMessage = true;
        
        // Update street display to show winner info instead of using overlay
        const streetDisplay = document.getElementById('street-display');
        if (winner.tie) {
            streetDisplay.textContent = `Tie! Both players split the pot. ${winner.handName} (Click pot to continue)`;
        } else {
            streetDisplay.textContent = `Player ${winner.playerIndex + 1} wins with ${winner.handName}! (Click pot to continue)`;
        }
        
        console.log('Winner message set:', streetDisplay.textContent);
        
        this.renderer.updateScene(this.gameState);
        this.updateUI(); // Update UI but preserve winner message
        
        // Auto-continue to next hand after a short delay (can be skipped by clicking pot)
        this.autoAdvanceTimer = setTimeout(() => {
            if (this.showingWinnerMessage) { // Only advance if still showing winner message
                this.awardPotAndStartNextHand();
            }
        }, 30000); // 3 second delay to read the result
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
        
        // Clear auto-advance timer if it exists
        if (this.autoAdvanceTimer) {
            clearTimeout(this.autoAdvanceTimer);
            this.autoAdvanceTimer = null;
        }
        
        // Clear winner message flag and display
        this.showingWinnerMessage = false;
        const streetDisplay = document.getElementById('street-display');
        streetDisplay.textContent = '';
        
        console.log('Winner message cleared, starting new hand');
        
        // Update match statistics
        this.matchStats.handsPlayed++;
        this.matchStats.biggestPot = Math.max(this.matchStats.biggestPot, this.gameState.pot);
        this.matchStats.totalPots += this.gameState.pot;
        
        // Check if match is over (one player eliminated)
        if (this.isMatchComplete()) {
            this.showEndScreen();
            return;
        }
        
        this.gameState.startNewHand();
        this.saveGameState(); // Auto-save after new hand starts
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
        
        // Update street (only if not showing winner message)
        const streetDisplay = document.getElementById('street-display');
        if (!this.showingWinnerMessage) {
            const streetNames = { preflop: 'Pre-Flop', flop: 'Flop', turn: 'Turn', river: 'River', showdown: 'Showdown' };
            streetDisplay.textContent = streetNames[state.street] || '';
        }
        
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
        const isGameActive = !state.isHandComplete() && !state.players.some(p => p.folded);
        const isAllInScenario = state.isAllInScenario();
        
        console.log(`Updating player controls: toAct=${state.toAct}, isGameActive=${isGameActive}, street=${state.street}, isAllInScenario=${isAllInScenario}`);
        
        [0, 1].forEach(playerId => {
            const controls = this.playerControls[playerId];
            const isActivePlayer = state.toAct === playerId;
            const currentPlayer = state.players[playerId];
            const toCall = state.currentBet - currentPlayer.currentBet;
            const canCheck = toCall === 0;
            
            console.log(`Player ${playerId}: isActive=${isActivePlayer}, disabled=${controls.container.classList.contains('disabled')}`);

            if (isGameActive && isActivePlayer) {

                if(isAllInScenario) {
                    console.log('All-in scenario: showing only continue button');
                    // Set slider min/max first, then value
                    controls.slider.min = 0;
                    controls.slider.max = 0;
                    controls.slider.value = 0;
                    controls.actionBtn.disabled = false;
                    controls.slider.disabled = true;
                    // Update display with current slider value
                    controls.sliderValue.textContent = `$0`;
                
                    // Update action button text based on slider
                    this.updateActionButtonText(controls, canCheck, toCall,isAllInScenario);
                    
                    // Enable controls for active player
                    controls.container.classList.remove('disabled');
                    console.log(`Enabled controls for player ${playerId}`);
                    return
                }
                // Show all controls (in case they were hidden during all-in)
                controls.slider.style.display = '';
                controls.sliderValue.style.display = '';
                controls.foldBtn.style.display = '';
                
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
                controls.slider.value = callAmount; // Default to call amount
                
                
                // Update display with current slider value
                const currentSliderValue = parseInt(controls.slider.value);
                controls.sliderValue.textContent = `$${currentSliderValue}`;
                
                // Update action button text based on slider
                this.updateActionButtonText(controls, canCheck, toCall, isAllInScenario);

                // Enable controls for active player
                controls.container.classList.remove('disabled');
                console.log(`Enabled controls for player ${playerId}`);
                
                controls.foldBtn.disabled = false;
                controls.actionBtn.disabled = false;
                controls.slider.disabled = false;
            } else {
                // Disable controls for inactive player or when game is over
                controls.container.classList.add('disabled');
                
                // Show all controls (in case they were hidden during all-in)
                controls.slider.style.display = '';
                controls.sliderValue.style.display = '';
                controls.foldBtn.style.display = '';
                
                // Show what the action would be if it were their turn
                controls.actionBtn.textContent = canCheck ? 'Check' : `Call $${toCall}`;
                
                
                
                // Disable controls
                controls.foldBtn.disabled = true;
                controls.actionBtn.disabled = true;
                controls.slider.disabled = true;
            }
        });
    }
    
    setupQA() {
        // Settings toggle (replaces QA toggle for main settings)
        const settingsToggle = document.getElementById('settings-toggle');
        const settingsClose = document.getElementById('settings-close');
        
        settingsToggle.addEventListener('click', () => {
            this.openSettings();
        });
        
        settingsClose.addEventListener('click', () => {
            this.closeSettings();
        });
        
        // QA Debug overlay (kept for debugging)
        const qaOverlay = document.getElementById('qa-overlay');
        const qaClose = document.getElementById('qa-close');
        
        qaClose.addEventListener('click', () => {
            qaOverlay.classList.add('hidden');
        });
        
        // Settings functionality
        this.setupSettingsHandlers();
    }
    
    setupSettingsHandlers() {
        // End Match button
        document.getElementById('end-match-btn').addEventListener('click', () => {
            this.showConfirmation(
                'End Current Match',
                'Are you sure you want to end the current match? All progress will be lost.',
                () => this.endCurrentMatch()
            );
        });
        
        // Return to Start Screen button  
        document.getElementById('return-start-btn').addEventListener('click', () => {
            this.showConfirmation(
                'Return to Start Screen',
                'Are you sure you want to return to the start screen? Current match will be saved.',
                () => this.returnToStartFromSettings()
            );
        });
        
        // Clear Saved Game button
        document.getElementById('clear-save-btn').addEventListener('click', () => {
            this.showConfirmation(
                'Clear Saved Game',
                'Are you sure you want to delete your saved game? This cannot be undone.',
                () => this.clearSavedGame()
            );
        });
        
        // Reset to Defaults button
        document.getElementById('reset-defaults-btn').addEventListener('click', () => {
            this.showConfirmation(
                'Reset Settings',
                'Are you sure you want to reset all settings to their default values?',
                () => this.resetToDefaults()
            );
        });
        
        // Settings change handlers
        document.getElementById('starting-stack').addEventListener('change', (e) => {
            this.updateGameSetting('startingStack', parseInt(e.target.value));
        });
        
        document.getElementById('blind-level').addEventListener('change', (e) => {
            this.updateBlindLevel(e.target.value);
        });
        
        document.getElementById('auto-hide-time').addEventListener('change', (e) => {
            CONFIG.autoHideMs = parseInt(e.target.value);
            this.saveSettings();
        });
        
        document.getElementById('turn-gate').addEventListener('change', (e) => {
            CONFIG.turnGate = e.target.value;
            this.saveSettings();
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
    
    setupAutoSave() {
        // Auto-save on page unload
        window.addEventListener('beforeunload', () => {
            this.saveGameState();
        });
        
        // Auto-save on page visibility change (when user switches tabs)
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.saveGameState();
            }
        });
    }
    
    setupPWA() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('./sw.js').catch(() => {});
        }
        
        let deferredPrompt;
        const installButton = document.getElementById('install-app-btn');
        const installPrompt = document.getElementById('install-prompt');
        
        // Handle beforeinstallprompt event
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            deferredPrompt = e;
            
            // Show install button on start screen
            installButton.classList.remove('hidden');
            
            // Also show bottom prompt for redundancy
            installPrompt.classList.remove('hidden');
        });
        
        // Install button click handler
        installButton.addEventListener('click', async () => {
            if (deferredPrompt) {
                deferredPrompt.prompt();
                const { outcome } = await deferredPrompt.userChoice;
                
                if (outcome === 'accepted') {
                    installButton.classList.add('hidden');
                    installPrompt.classList.add('hidden');
                }
                
                deferredPrompt = null;
            }
        });
        
        // Dismiss button for bottom prompt
        document.getElementById('install-dismiss').addEventListener('click', () => {
            installPrompt.classList.add('hidden');
        });
        
        // Hide install button if already installed
        window.addEventListener('appinstalled', () => {
            installButton.classList.add('hidden');
            installPrompt.classList.add('hidden');
        });
        
        // Check if already running as PWA
        if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) {
            installButton.classList.add('hidden');
            installPrompt.classList.add('hidden');
        }
    }
    
    start() {
        this.gameState.startNewHand();
        this.saveGameState(); // Auto-save initial game state
        this.renderer.updateScene(this.gameState);
        this.updateUI();
        this.animate();
    }
    
    animate() {
        this.animationId = requestAnimationFrame(() => this.animate());
        
        this.input.update();
        this.renderer.render();
        
        if (CONFIG.fpsDebug) {
            this.updateFPS();
        }
    }
    
    // Save/Load functionality
    saveGameState() {
        try {
            const saveData = {
                // Game state
                players: this.gameState.players.map(player => ({
                    stack: player.stack,
                    hole: player.hole,
                    currentBet: player.currentBet,
                    folded: player.folded,
                    isDealer: player.isDealer
                })),
                blinds: this.gameState.blinds,
                pot: this.gameState.pot,
                street: this.gameState.street,
                board: this.gameState.board,
                currentBet: this.gameState.currentBet,
                minRaise: this.gameState.minRaise,
                toAct: this.gameState.toAct,
                dealerIndex: this.gameState.dealerIndex,
                deck: this.gameState.deck,
                lastAggressorIndex: this.gameState.lastAggressorIndex,
                actionsThisStreet: Array.from(this.gameState.actionsThisStreet),
                
                // Match statistics
                matchStats: this.matchStats,
                
                // Additional metadata
                timestamp: Date.now(),
                version: '1.0'
            };
            
            localStorage.setItem('pocketPokerSave', JSON.stringify(saveData));
            console.log('Game state saved successfully');
            
            // Update continue button visibility if we're not currently in game
            updateContinueButtonVisibility();
            
            return true;
        } catch (error) {
            console.error('Failed to save game state:', error);
            return false;
        }
    }
    
    loadGameState() {
        try {
            const savedData = localStorage.getItem('pocketPokerSave');
            if (!savedData) {
                console.log('No saved game found');
                return false;
            }
            
            const saveData = JSON.parse(savedData);
            
            // Validate save data version
            if (!saveData.version || saveData.version !== '1.0') {
                console.warn('Save data version mismatch, starting new game');
                localStorage.removeItem('pocketPokerSave');
                return false;
            }
            
            // Restore game state
            this.gameState.players = saveData.players.map(playerData => ({
                stack: playerData.stack,
                hole: playerData.hole || [],
                currentBet: playerData.currentBet || 0,
                folded: playerData.folded || false,
                isDealer: playerData.isDealer || false
            }));
            
            this.gameState.blinds = saveData.blinds || { sb: 5, bb: 10 };
            this.gameState.pot = saveData.pot || 0;
            this.gameState.street = saveData.street || 'preflop';
            this.gameState.board = saveData.board || [];
            this.gameState.currentBet = saveData.currentBet || 0;
            this.gameState.minRaise = saveData.minRaise || this.gameState.blinds.bb;
            this.gameState.toAct = saveData.toAct !== undefined ? saveData.toAct : 0;
            this.gameState.dealerIndex = saveData.dealerIndex !== undefined ? saveData.dealerIndex : 1;
            this.gameState.deck = saveData.deck || [];
            this.gameState.lastAggressorIndex = saveData.lastAggressorIndex !== undefined ? saveData.lastAggressorIndex : -1;
            this.gameState.actionsThisStreet = new Set(saveData.actionsThisStreet || []);
            
            // Restore match statistics
            this.matchStats = saveData.matchStats || {
                startTime: Date.now(),
                handsPlayed: 0,
                biggestPot: 0,
                totalPots: 0
            };
            
            // Update the UI and renderer with loaded state
            this.renderer.updateScene(this.gameState);
            this.updateUI();
            
            console.log('Game state loaded successfully');
            return true;
        } catch (error) {
            console.error('Failed to load game state:', error);
            localStorage.removeItem('pocketPokerSave');
            return false;
        }
    }
    
    // Settings Management
    openSettings() {
        // Show match control section (active game)
        const matchControlSection = document.querySelector('#settings-overlay .settings-section:first-child');
        if (matchControlSection) {
            matchControlSection.style.display = 'block';
        }
        
        // Load current settings into form
        this.loadSettingsIntoForm();
        document.getElementById('settings-overlay').classList.remove('hidden');
    }
    
    closeSettings() {
        document.getElementById('settings-overlay').classList.add('hidden');
    }
    
    loadSettingsIntoForm() {
        // Load current CONFIG values into the form
        document.getElementById('auto-hide-time').value = CONFIG.autoHideMs;
        document.getElementById('turn-gate').value = CONFIG.turnGate;
        
        // Load starting stack (from current game or default)
        const currentStack = this.gameState?.players?.[0]?.stack || 1000;
        document.getElementById('starting-stack').value = currentStack <= 500 ? 500 :
                                                        currentStack <= 1000 ? 1000 :
                                                        currentStack <= 2000 ? 2000 : 5000;
        
        // Load blind level
        const sb = this.gameState?.blinds?.sb || 5;
        const bb = this.gameState?.blinds?.bb || 10;
        const blindLevel = `${sb}-${bb}`;
        document.getElementById('blind-level').value = blindLevel;
    }
    
    showConfirmation(title, message, onConfirm) {
        document.getElementById('confirmation-title').textContent = title;
        document.getElementById('confirmation-message').textContent = message;
        document.getElementById('confirmation-overlay').classList.remove('hidden');
        
        // Set up event handlers
        const confirmBtn = document.getElementById('confirmation-confirm');
        const cancelBtn = document.getElementById('confirmation-cancel');
        
        // Remove existing listeners
        const newConfirmBtn = confirmBtn.cloneNode(true);
        const newCancelBtn = cancelBtn.cloneNode(true);
        confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
        cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
        
        // Add new listeners
        newConfirmBtn.addEventListener('click', () => {
            document.getElementById('confirmation-overlay').classList.add('hidden');
            onConfirm();
        });
        
        newCancelBtn.addEventListener('click', () => {
            document.getElementById('confirmation-overlay').classList.add('hidden');
        });
    }
    
    endCurrentMatch() {
        // Clear saved game and return to start screen
        localStorage.removeItem('pocketPokerSave');
        this.closeSettings();
        returnToStartScreen();
    }
    
    returnToStartFromSettings() {
        // Save current game and return to start screen
        this.saveGameState();
        this.closeSettings();
        returnToStartScreen();
    }
    
    clearSavedGame() {
        localStorage.removeItem('pocketPokerSave');
        updateContinueButtonVisibility();
        this.closeSettings();
    }
    
    resetToDefaults() {
        // Reset CONFIG to defaults
        CONFIG.autoHideMs = 1200;
        CONFIG.turnGate = "freePeek";
        CONFIG.fpsDebug = false; // Always false, not a user setting
        
        // Update form
        this.loadSettingsIntoForm();
        this.saveSettings();
    }
    
    updateGameSetting(setting, value) {
        // Store setting for new games
        const settings = this.loadUserSettings();
        settings[setting] = value;
        localStorage.setItem('pocketPokerSettings', JSON.stringify(settings));
    }
    
    updateBlindLevel(level) {
        const [sb, bb] = level.split('-').map(Number);
        
        // Store for new games
        const settings = this.loadUserSettings();
        settings.blinds = { sb, bb };
        localStorage.setItem('pocketPokerSettings', JSON.stringify(settings));
        
        // Update current game if active
        if (this.gameState) {
            this.gameState.blinds = { sb, bb };
            this.saveGameState();
        }
    }
    
    saveSettings() {
        const settings = {
            autoHideMs: CONFIG.autoHideMs,
            turnGate: CONFIG.turnGate
            // Note: fpsDebug is no longer saved as a user setting
        };
        localStorage.setItem('pocketPokerSettings', JSON.stringify(settings));
    }
    
    loadUserSettings() {
        try {
            const saved = localStorage.getItem('pocketPokerSettings');
            return saved ? JSON.parse(saved) : {};
        } catch (error) {
            console.error('Failed to load user settings:', error);
            return {};
        }
    }
    
    applyUserSettings() {
        const settings = this.loadUserSettings();
        
        if (settings.autoHideMs !== undefined) CONFIG.autoHideMs = settings.autoHideMs;
        if (settings.turnGate !== undefined) CONFIG.turnGate = settings.turnGate;
        // Note: fpsDebug is no longer a user setting, always keep it false
        CONFIG.fpsDebug = false;
        
        // Apply starting stack to new games
        if (settings.startingStack && this.gameState) {
            this.gameState.players.forEach(player => {
                if (player.stack === 1000) { // Only if still at default
                    player.stack = settings.startingStack;
                }
            });
        }
        
        // Apply blinds to new games
        if (settings.blinds && this.gameState) {
            this.gameState.blinds = settings.blinds;
        }
    }
    
    // Match Completion and End Screen
    isMatchComplete() {
        // Match is complete when one player has all the chips or is eliminated
        return this.gameState.players.some(player => player.stack <= 0) ||
               this.gameState.players.some(player => player.stack >= this.getTotalStartingChips());
    }
    
    getTotalStartingChips() {
        // Calculate total chips that started the match
        return this.gameState.players.reduce((total, player) => total + player.stack, 0);
    }
    
    getMatchWinner() {
        // Return the player with the most chips
        const player0Chips = this.gameState.players[0].stack;
        const player1Chips = this.gameState.players[1].stack;
        
        if (player0Chips > player1Chips) {
            return { playerIndex: 0, chips: player0Chips };
        } else if (player1Chips > player0Chips) {
            return { playerIndex: 1, chips: player1Chips };
        } else {
            return { playerIndex: -1, chips: player0Chips }; // Tie (shouldn't happen in poker)
        }
    }
    
    showEndScreen() {
        const winner = this.getMatchWinner();
        const matchDuration = Date.now() - this.matchStats.startTime;
        
        // Hide game and show end screen
        document.getElementById('game-container').classList.add('hidden');
        document.getElementById('end-screen').classList.remove('hidden');
        
        // Update winner information
        if (winner.playerIndex === -1) {
            document.getElementById('winner-title').textContent = '🤝 It\'s a Tie! 🤝';
            document.getElementById('winner-subtitle').textContent = 'Both players played excellently!';
        } else {
            const playerNum = winner.playerIndex + 1;
            document.getElementById('winner-title').textContent = `🎉 Player ${playerNum} Wins! 🎉`;
            document.getElementById('winner-subtitle').textContent = 'Congratulations on your victory!';
        }
        
        // Update match statistics
        document.getElementById('stat-hands').textContent = this.matchStats.handsPlayed;
        document.getElementById('stat-duration').textContent = this.formatDuration(matchDuration);
        document.getElementById('stat-biggest-pot').textContent = `$${this.matchStats.biggestPot}`;
        document.getElementById('stat-final-chips').textContent = `$${this.getTotalStartingChips()}`;
        
        // Update final standings
        const sortedPlayers = this.gameState.players
            .map((player, index) => ({ ...player, originalIndex: index }))
            .sort((a, b) => b.stack - a.stack);
        
        // Winner
        const winnerData = sortedPlayers[0];
        document.getElementById('winner-name').textContent = `Player ${winnerData.originalIndex + 1}`;
        document.getElementById('winner-chips').textContent = `$${winnerData.stack}`;
        
        // Runner-up
        const loserData = sortedPlayers[1];
        document.getElementById('loser-name').textContent = `Player ${loserData.originalIndex + 1}`;
        document.getElementById('loser-chips').textContent = `$${loserData.stack}`;
        
        // Clear saved game (match is over)
        localStorage.removeItem('pocketPokerSave');
        
        // Setup end screen event listeners
        this.setupEndScreenHandlers();
    }
    
    formatDuration(milliseconds) {
        const minutes = Math.floor(milliseconds / 60000);
        const seconds = Math.floor((milliseconds % 60000) / 1000);
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
    
    setupEndScreenHandlers() {
        // Remove existing listeners to prevent duplicates
        const playAgainBtn = document.getElementById('play-again-btn');
        const backToMenuBtn = document.getElementById('back-to-menu-btn');
        
        const newPlayAgainBtn = playAgainBtn.cloneNode(true);
        const newBackToMenuBtn = backToMenuBtn.cloneNode(true);
        
        playAgainBtn.parentNode.replaceChild(newPlayAgainBtn, playAgainBtn);
        backToMenuBtn.parentNode.replaceChild(newBackToMenuBtn, backToMenuBtn);
        
        // Add new event listeners
        newPlayAgainBtn.addEventListener('click', () => {
            this.startNewMatch();
        });
        
        newBackToMenuBtn.addEventListener('click', () => {
            this.returnToStartFromEndScreen();
        });
    }
    
    startNewMatch() {
        // Hide end screen and start a new game
        document.getElementById('end-screen').classList.add('hidden');
        document.getElementById('game-container').classList.remove('hidden');
        
        // Clean up current instance first
        this.cleanup();
        
        // Completely reinitialize the game
        this.canvas = document.getElementById('gameCanvas');
        this.gameState = new GameState(CONFIG.seed);
        this.renderer = new GameRenderer(this.canvas, CONFIG);
        this.input = new InputHandler(this.canvas, this.renderer, this.gameState, CONFIG);
        
        // Reset match statistics
        this.matchStats = {
            startTime: Date.now(),
            handsPlayed: 0,
            biggestPot: 0,
            totalPots: 0
        };
        
        // Reset UI state flags
        this.showingWinnerMessage = false;
        
        // Apply settings and start
        this.applyUserSettings();
        this.setupAutoSave();
        this.gameState.startNewHand();
        this.saveGameState();
        this.renderer.updateScene(this.gameState);
        this.updateUI();
        this.animate();
    }
    
    returnToStartFromEndScreen() {
        // Hide end screen and show start screen
        document.getElementById('end-screen').classList.add('hidden');
        
        // Properly clean up the current game instance
        this.cleanup();
        
        returnToStartScreen();
    }
    
    cleanup() {
        // Stop the animation loop
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }
        
        // Clean up renderer resources
        if (this.renderer) {
            // Clear all card meshes from the scene
            this.renderer.cardMeshes.player0.forEach(mesh => {
                this.renderer.scene.remove(mesh);
                if (mesh.geometry) mesh.geometry.dispose();
                if (mesh.material && mesh.material.map) mesh.material.map.dispose();
                if (mesh.material) mesh.material.dispose();
            });
            
            this.renderer.cardMeshes.player1.forEach(mesh => {
                this.renderer.scene.remove(mesh);
                if (mesh.geometry) mesh.geometry.dispose();
                if (mesh.material && mesh.material.map) mesh.material.map.dispose();
                if (mesh.material) mesh.material.dispose();
            });
            
            this.renderer.cardMeshes.board.forEach(mesh => {
                this.renderer.scene.remove(mesh);
                if (mesh.geometry) mesh.geometry.dispose();
                if (mesh.material && mesh.material.map) mesh.material.map.dispose();
                if (mesh.material) mesh.material.dispose();
            });
            
            // Clear the card mesh arrays
            this.renderer.cardMeshes.player0 = [];
            this.renderer.cardMeshes.player1 = [];
            this.renderer.cardMeshes.board = [];
        }
        
        // Clear input handlers
        if (this.input) {
            this.input.activeTouch = null;
            this.input.targetOwner = null;
            this.input.clearAutoHideTimer();
        }
        
        // Dispose of Three.js renderer
        if (this.renderer && this.renderer.renderer) {
            this.renderer.renderer.dispose();
        }
    }
}

// Parse seed from URL
const params = new URLSearchParams(window.location.search);
if (params.has('seed')) {
    CONFIG.seed = params.get('seed');
}

// Global game instance
let gameInstance = null;

// Initialize start screen when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initializeStartScreen());
} else {
    initializeStartScreen();
}

function initializeStartScreen() {
    // Check if there's a saved game in localStorage
    const savedGame = localStorage.getItem('pocketPokerSave');
    const continueBtn = document.getElementById('continue-game-btn');
    
    if (savedGame) {
        continueBtn.classList.remove('hidden');
    }
    
    // Set up start screen event listeners
    document.getElementById('new-game-btn').addEventListener('click', startNewGame);
    document.getElementById('continue-game-btn').addEventListener('click', continueGame);
    document.getElementById('start-settings-btn').addEventListener('click', openStartSettings);
    
    // Set up settings handlers for start screen
    setupStartScreenSettings();
}

function setupStartScreenSettings() {
    // Settings close button
    document.getElementById('settings-close').addEventListener('click', () => {
        document.getElementById('settings-overlay').classList.add('hidden');
    });
    
    // Only allow certain settings from start screen (no game-ending actions)
    const startScreenHandlers = {
        'starting-stack': (e) => updateStartSetting('startingStack', parseInt(e.target.value)),
        'blind-level': (e) => updateStartBlindLevel(e.target.value),
        'auto-hide-time': (e) => updateStartSetting('autoHideMs', parseInt(e.target.value)),
        'turn-gate': (e) => updateStartSetting('turnGate', e.target.value),
        'reset-defaults-btn': () => resetStartDefaults(),
        'clear-save-btn': () => clearSavedGameFromStart()
    };
    
    // Add event listeners
    Object.entries(startScreenHandlers).forEach(([id, handler]) => {
        const element = document.getElementById(id);
        if (element) {
            if (id.endsWith('-btn')) {
                element.addEventListener('click', handler);
            } else {
                element.addEventListener('change', handler);
            }
        }
    });
}

function updateStartSetting(setting, value) {
    const settings = JSON.parse(localStorage.getItem('pocketPokerSettings') || '{}');
    settings[setting] = value;
    localStorage.setItem('pocketPokerSettings', JSON.stringify(settings));
    
    // Update CONFIG immediately
    if (setting === 'autoHideMs') CONFIG.autoHideMs = value;
    if (setting === 'turnGate') CONFIG.turnGate = value;
}

function updateStartBlindLevel(level) {
    const [sb, bb] = level.split('-').map(Number);
    const settings = JSON.parse(localStorage.getItem('pocketPokerSettings') || '{}');
    settings.blinds = { sb, bb };
    localStorage.setItem('pocketPokerSettings', JSON.stringify(settings));
}

function resetStartDefaults() {
    localStorage.removeItem('pocketPokerSettings');
    CONFIG.autoHideMs = 1200;
    CONFIG.turnGate = "freePeek";
    loadDefaultSettingsIntoForm();
}

function clearSavedGameFromStart() {
    localStorage.removeItem('pocketPokerSave');
    updateContinueButtonVisibility();
}

function startNewGame() {
    // Clear any saved game
    localStorage.removeItem('pocketPokerSave');
    
    // Hide start screen and show game
    document.getElementById('start-screen').classList.add('hidden');
    document.getElementById('game-container').classList.remove('hidden');
    
    // Initialize new game instance
    gameInstance = new PokerGame();
}

function continueGame() {
    // Hide start screen and show game
    document.getElementById('start-screen').classList.add('hidden');
    document.getElementById('game-container').classList.remove('hidden');
    
    // Initialize game instance and load saved state
    gameInstance = new PokerGame();
    
    // Try to load saved state, if it fails start a new game
    if (!gameInstance.loadGameState()) {
        console.log('Failed to load saved game, starting new game');
        // The game is already initialized with a new hand from the constructor
    }
}

function openStartSettings() {
    // Open proper settings overlay
    document.getElementById('settings-overlay').classList.remove('hidden');
    
    // Hide match control section (no active game)
    const matchControlSection = document.querySelector('#settings-overlay .settings-section:first-child');
    if (matchControlSection) {
        matchControlSection.style.display = 'none';
    }
    
    // Load default settings into form (no game instance yet)
    loadDefaultSettingsIntoForm();
}

function loadDefaultSettingsIntoForm() {
    // Load saved user settings or defaults
    const settings = JSON.parse(localStorage.getItem('pocketPokerSettings') || '{}');
    
    document.getElementById('auto-hide-time').value = settings.autoHideMs || CONFIG.autoHideMs;
    document.getElementById('turn-gate').value = settings.turnGate || CONFIG.turnGate;
    document.getElementById('starting-stack').value = settings.startingStack || 1000;
    
    // Set blinds
    const blinds = settings.blinds || { sb: 5, bb: 10 };
    document.getElementById('blind-level').value = `${blinds.sb}-${blinds.bb}`;
}

function updateContinueButtonVisibility() {
    const savedGame = localStorage.getItem('pocketPokerSave');
    const continueBtn = document.getElementById('continue-game-btn');
    
    if (savedGame && continueBtn) {
        continueBtn.classList.remove('hidden');
    } else if (continueBtn) {
        continueBtn.classList.add('hidden');
    }
}

function returnToStartScreen() {
    // Hide game and show start screen
    document.getElementById('game-container').classList.add('hidden');
    document.getElementById('start-screen').classList.remove('hidden');
    
    // Clean up game instance properly
    if (gameInstance) {
        gameInstance.cleanup();
        gameInstance = null;
    }
    
    // Update continue button visibility
    updateContinueButtonVisibility();
}