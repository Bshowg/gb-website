// /game/evaluator.js
const RANKS = '23456789TJQKA';

export function evaluateHand(cards) {
    if (cards.length < 5) {
        return { rank: 10000, name: 'Invalid' };
    }
    
    // Generate all 5-card combinations from 7 cards
    const combos = [];
    for (let i = 0; i < cards.length - 4; i++) {
        for (let j = i + 1; j < cards.length - 3; j++) {
            for (let k = j + 1; k < cards.length - 2; k++) {
                for (let l = k + 1; l < cards.length - 1; l++) {
                    for (let m = l + 1; m < cards.length; m++) {
                        combos.push([cards[i], cards[j], cards[k], cards[l], cards[m]]);
                    }
                }
            }
        }
    }
    
    let bestHand = null;
    for (const combo of combos) {
        const hand = evaluateFiveCards(combo);
        if (!bestHand || hand.rank < bestHand.rank) {
            bestHand = hand;
        }
    }
    
    return bestHand;
}

function evaluateFiveCards(cards) {
    const ranks = cards.map(c => RANKS.indexOf(c[0])).sort((a, b) => b - a);
    const suits = cards.map(c => c[1]);
    
    const isFlush = suits.every(s => s === suits[0]);
    const isStraight = checkStraight(ranks);
    
    const rankCounts = {};
    for (const r of ranks) {
        rankCounts[r] = (rankCounts[r] || 0) + 1;
    }
    
    const counts = Object.values(rankCounts).sort((a, b) => b - a);
    const uniqueRanks = Object.keys(rankCounts).map(Number).sort((a, b) => b - a);
    
    // Straight flush
    if (isFlush && isStraight) {
        const highCard = isStraight === 'wheel' ? 3 : ranks[0];
        return {
            rank: 1000 + (14 - highCard),
            name: isStraight === 'wheel' ? 'Straight Flush (Wheel)' : 'Straight Flush'
        };
    }
    
    // Four of a kind
    if (counts[0] === 4) {
        const quad = uniqueRanks.find(r => rankCounts[r] === 4);
        const kicker = uniqueRanks.find(r => rankCounts[r] === 1);
        return {
            rank: 2000 + (14 - quad) * 15 + (14 - kicker),
            name: 'Four of a Kind'
        };
    }
    
    // Full house
    if (counts[0] === 3 && counts[1] === 2) {
        const trip = uniqueRanks.find(r => rankCounts[r] === 3);
        const pair = uniqueRanks.find(r => rankCounts[r] === 2);
        return {
            rank: 3000 + (14 - trip) * 15 + (14 - pair),
            name: 'Full House'
        };
    }
    
    // Flush
    if (isFlush) {
        let rankValue = 0;
        for (let i = 0; i < ranks.length; i++) {
            rankValue += (14 - ranks[i]) * Math.pow(15, 4 - i);
        }
        return {
            rank: 4000 + rankValue,
            name: 'Flush'
        };
    }
    
    // Straight
    if (isStraight) {
        const highCard = isStraight === 'wheel' ? 3 : ranks[0];
        return {
            rank: 5000 + (14 - highCard),
            name: isStraight === 'wheel' ? 'Straight (Wheel)' : 'Straight'
        };
    }
    
    // Three of a kind
    if (counts[0] === 3) {
        const trip = uniqueRanks.find(r => rankCounts[r] === 3);
        const kickers = uniqueRanks.filter(r => rankCounts[r] === 1).sort((a, b) => b - a);
        return {
            rank: 6000 + (14 - trip) * 225 + (14 - kickers[0]) * 15 + (14 - kickers[1]),
            name: 'Three of a Kind'
        };
    }
    
    // Two pair
    if (counts[0] === 2 && counts[1] === 2) {
        const pairs = uniqueRanks.filter(r => rankCounts[r] === 2).sort((a, b) => b - a);
        const kicker = uniqueRanks.find(r => rankCounts[r] === 1);
        return {
            rank: 7000 + (14 - pairs[0]) * 225 + (14 - pairs[1]) * 15 + (14 - kicker),
            name: 'Two Pair'
        };
    }
    
    // One pair
    if (counts[0] === 2) {
        const pair = uniqueRanks.find(r => rankCounts[r] === 2);
        const kickers = uniqueRanks.filter(r => rankCounts[r] === 1).sort((a, b) => b - a);
        return {
            rank: 8000 + (14 - pair) * 3375 + (14 - kickers[0]) * 225 + (14 - kickers[1]) * 15 + (14 - kickers[2]),
            name: 'Pair'
        };
    }
    
    // High card
    let rankValue = 0;
    for (let i = 0; i < ranks.length; i++) {
        rankValue += (14 - ranks[i]) * Math.pow(15, 4 - i);
    }
    return {
        rank: 9000 + rankValue,
        name: 'High Card'
    };
}

function checkStraight(ranks) {
    // Check for normal straight
    for (let i = 0; i < ranks.length - 1; i++) {
        if (ranks[i] - ranks[i + 1] !== 1) {
            // Check for wheel (A-2-3-4-5)
            if (ranks[0] === 12 && ranks[1] === 3 && ranks[2] === 2 && ranks[3] === 1 && ranks[4] === 0) {
                return 'wheel';
            }
            return false;
        }
    }
    return true;
}