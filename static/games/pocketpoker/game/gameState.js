// /game/gameState.js
import { evaluateHand } from './evaluator.js';

const RANKS = '23456789TJQKA';
const SUITS = 'cdhs';

export class GameState {
    constructor(seed = null) {
        this.seed = seed;
        this.players = [
            { stack: 1000, hole: [], currentBet: 0, folded: false, isDealer: false },
            { stack: 1000, hole: [], currentBet: 0, folded: false, isDealer: true }
        ];
        this.blinds = { sb: 5, bb: 10 };
        this.pot = 0;
        this.street = 'preflop';
        this.board = [];
        this.currentBet = 0;
        this.minRaise = this.blinds.bb;
        this.toAct = 0;
        this.dealerIndex = 1;
        this.deck = [];
        this.lastAggressorIndex = -1;
        this.actionsThisStreet = new Set(); // Track who has acted this street
    }
    
    shuffleDeck() {
        this.deck = [];
        for (const rank of RANKS) {
            for (const suit of SUITS) {
                this.deck.push(rank + suit);
            }
        }
        
        // Fisher-Yates with crypto random
        if (this.seed) {
            // Simple seeded random for testing
            let seedNum = 0;
            for (let i = 0; i < this.seed.length; i++) {
                seedNum = (seedNum * 31 + this.seed.charCodeAt(i)) % 2147483647;
            }
            
            for (let i = this.deck.length - 1; i > 0; i--) {
                seedNum = (seedNum * 1664525 + 1013904223) % 2147483647;
                const j = seedNum % (i + 1);
                [this.deck[i], this.deck[j]] = [this.deck[j], this.deck[i]];
            }
        } else {
            const array = new Uint32Array(this.deck.length);
            crypto.getRandomValues(array);
            
            for (let i = this.deck.length - 1; i > 0; i--) {
                const j = array[i] % (i + 1);
                [this.deck[i], this.deck[j]] = [this.deck[j], this.deck[i]];
            }
        }
    }
    
    dealCard() {
        return this.deck.pop();
    }
    
    startNewHand() {
        // Reset player states
        this.players.forEach(p => {
            p.hole = [];
            p.currentBet = 0;
            p.folded = false;
        });
        
        // Rotate dealer
        this.dealerIndex = (this.dealerIndex + 1) % 2;
        this.players.forEach((p, i) => {
            p.isDealer = i === this.dealerIndex;
        });
        
        // Reset board and pot
        this.board = [];
        this.pot = 0;
        this.currentBet = 0;
        this.street = 'preflop';
        this.lastAggressorIndex = -1;
        this.actionsThisStreet = new Set();
        
        // Shuffle and deal
        this.shuffleDeck();
        
        // Heads-up: dealer posts SB
        const sbIndex = this.dealerIndex;
        const bbIndex = (this.dealerIndex + 1) % 2;
        
        this.players[sbIndex].stack -= this.blinds.sb;
        this.players[sbIndex].currentBet = this.blinds.sb;
        this.players[bbIndex].stack -= this.blinds.bb;
        this.players[bbIndex].currentBet = this.blinds.bb;
        
        this.pot = this.blinds.sb + this.blinds.bb;
        this.currentBet = this.blinds.bb;
        this.minRaise = this.blinds.bb * 2;
        
        // Deal hole cards
        for (let i = 0; i < 2; i++) {
            this.players[0].hole.push(this.dealCard());
            this.players[1].hole.push(this.dealCard());
        }
        
        // Heads-up: dealer acts first preflop

        this.toAct = this.dealerIndex;
    }
    
    processAction(action, amount) {
        const player = this.players[this.toAct];
        
        // Track that this player has acted this street
        this.actionsThisStreet.add(this.toAct);
        
        if (action === 'fold') {
            player.folded = true;
        } else if (action === 'call') {
            const callAmount = Math.min(amount, player.stack);
            player.stack -= callAmount;
            player.currentBet += callAmount;
            this.pot += callAmount;
        } else if (action === 'raise') {
            const raiseAmount = Math.min(amount, player.stack);
            player.stack -= raiseAmount;
            player.currentBet += raiseAmount;
            this.pot += raiseAmount;
            this.currentBet = player.currentBet;
            this.minRaise = Math.max(this.minRaise, raiseAmount);
            this.lastAggressorIndex = this.toAct;
            // Reset actions tracking since there's been a raise
            this.actionsThisStreet.clear();
            this.actionsThisStreet.add(this.toAct);
        }
        
        this.toAct = (this.toAct + 1) % 2;
        console.log('Next to act:', this.toAct);
    }
    
    isStreetComplete() {
        if (this.players.some(p => p.folded)) return true;
        
        const activePlayers = this.players.filter(p => !p.folded);
        if (activePlayers.length === 0) return true;
        
        // All active players have acted and matched the current bet
        const allMatched = activePlayers.every(p => p.currentBet === this.currentBet || p.stack === 0);
        
        // Both active players must have acted this street
        const bothActed = this.actionsThisStreet.size >= 2;
        
        return allMatched && bothActed;
    }
    
    isHandComplete() {
        if (this.players.some(p => p.folded)) return true;
        return this.street === 'showdown';
    }
    
    advanceStreet() {
        // Reset current bets
        this.players.forEach(p => p.currentBet = 0);
        this.currentBet = 0;
        
        const streets = { preflop: 'flop', flop: 'turn', turn: 'river', river: 'showdown' };
        this.street = streets[this.street];
        
        if (this.street === 'flop') {
            this.board.push(this.dealCard(), this.dealCard(), this.dealCard());
        } else if (this.street === 'turn' || this.street === 'river') {
            this.board.push(this.dealCard());
        }
        
        // Post-flop: non-dealer acts first
        this.toAct = (this.dealerIndex + 1) % 2; // Non-dealer acts first post-flop
        this.lastAggressorIndex = -1; // Reset aggressor tracking
        this.actionsThisStreet = new Set(); // Reset action tracking for new street
        this.minRaise = this.blinds.bb;
    }
    
    determineWinner() {
        if (this.players[0].folded) {
            return { playerIndex: 1, handName: 'Opponent folded', tie: false };
        }
        if (this.players[1].folded) {
            return { playerIndex: 0, handName: 'Opponent folded', tie: false };
        }
        
        const hand0 = evaluateHand([...this.players[0].hole, ...this.board]);
        const hand1 = evaluateHand([...this.players[1].hole, ...this.board]);
        
        if (hand0.rank < hand1.rank) {
            return { playerIndex: 0, handName: hand0.name, tie: false };
        } else if (hand1.rank < hand0.rank) {
            return { playerIndex: 1, handName: hand1.name, tie: false };
        } else {
            return { playerIndex: -1, handName: hand0.name, tie: true };
        }
    }
}