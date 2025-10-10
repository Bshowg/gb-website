// /game/renderer.js - FIXED for visibility
import * as THREE from '../three.module.js';

export class GameRenderer {
    constructor(canvas, config) {
        this.canvas = canvas;
        this.config = config;
        
        console.log('Initializing renderer...');
        
        // Setup renderer
        this.renderer = new THREE.WebGLRenderer({ 
            canvas,
            antialias: true,
            alpha: false
        });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        
        // Setup scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x1a5c3a);
        
        // Setup camera with responsive positioning
        const aspect = window.innerWidth / window.innerHeight;
        // Adjust FOV and camera distance based on aspect ratio
        const fov = aspect < 1 ? 60 : 50; // Wider FOV for narrow screens
        const cameraDistance = aspect < 0.6 ? 18 : 15; // Further back for very narrow screens
        
        this.camera = new THREE.PerspectiveCamera(fov, aspect, 0.1, 1000);
        this.camera.position.set(0, 0, cameraDistance);
        this.camera.lookAt(0, 0, 0);
        
        // Card meshes storage
        this.cardMeshes = {
            player0: [],
            player1: [],
            board: []
        };
        
        // Create table
        this.createTable();
        
        // Create card textures
        this.textures = this.createTextures();
        
        console.log('Textures created:', Object.keys(this.textures.cards).length, 'cards');
        
        // Reusable objects
        this.tempVector = new THREE.Vector3();
        this.tempEuler = new THREE.Euler();
        
        // Handle resize
        this.handleResize();
        window.addEventListener('resize', () => this.handleResize());
        window.addEventListener('orientationchange', () => {
            setTimeout(() => this.handleResize(), 100);
        });
        
        console.log('Renderer initialized');
    }
    
    handleResize() {
        const width = window.innerWidth;
        const height = window.innerHeight;
        const aspect = width / height;
        
        this.renderer.setSize(width, height);
        this.camera.aspect = aspect;
        
        // Adjust camera settings for different screen sizes
        const fov = aspect < 1 ? 60 : 50; // Wider FOV for narrow screens
        const cameraDistance = aspect < 0.6 ? 18 : 15; // Further back for very narrow screens
        
        this.camera.fov = fov;
        this.camera.position.z = cameraDistance;
        this.camera.updateProjectionMatrix();
        
        // Update card positions for current viewport
        this.updateCardPositions();
    }
    
    getViewportDimensions() {
        const aspect = this.camera.aspect;
        const fov = this.camera.fov;
        const distance = this.camera.position.z;
        
        // Calculate visible area at z=0 plane
        const vFOV = fov * Math.PI / 180;
        const height = 2 * Math.tan(vFOV / 2) * distance;
        const width = height * aspect;
        
        return { width, height };
    }
    
    updateCardPositions() {
        // Only update if cards exist
        if (this.cardMeshes.player0.length === 0 && this.cardMeshes.player1.length === 0) return;
        
        const viewport = this.getViewportDimensions();
        const playerCardScale = 1.5;
        const scaledCardWidth = 2 * playerCardScale;
        const playerCardOverlap = scaledCardWidth * 0.8; // Adjust overlap for larger cards
        const cardHeight = 1.96 * playerCardScale; // Scaled card height
        const sideMargin = 2; // Add side margin
        
        // Calculate positions with 20% of card outside viewport
        const cardOffsetOut = cardHeight * -0.6; // 20% of card height outside
        
        // Update player 0 cards (bottom-right, 20% below viewport)
        this.cardMeshes.player0.forEach((mesh, i) => {
            const startX = viewport.width / 2 - playerCardOverlap - sideMargin; // Right edge with larger margin
            const baseY = -viewport.height / 2 - cardOffsetOut; // 20% below viewport
            mesh.position.set(startX + i * playerCardOverlap, baseY, i * 0.01);
        });
        
        // Update player 1 cards (top-left, 20% above viewport)
        this.cardMeshes.player1.forEach((mesh, i) => {
            const startX = -viewport.width / 2 + sideMargin; // Left edge with larger margin
            const baseY = viewport.height / 2 + cardOffsetOut; // 20% above viewport
            mesh.position.set(startX + i * playerCardOverlap, baseY, i * 0.01);
        });
    }
    
    createTable() {
        const geometry = new THREE.PlaneGeometry(30, 20);
        const material = new THREE.MeshBasicMaterial({ 
            color: 0x0d4028,
            side: THREE.DoubleSide 
        });
        const table = new THREE.Mesh(geometry, material);
        table.position.z = -0.5;
        this.scene.add(table);
        console.log('Table created');
    }
    
    createTextures() {
        const textures = {
            back: this.createBackTexture(),
            cards: {}
        };
        
        const ranks = '23456789TJQKA';
        const suits = 'cdhs';
        
        for (const rank of ranks) {
            for (const suit of suits) {
                textures.cards[rank + suit] = this.createCardTexture(rank, suit);
            }
        }
        
        return textures;
    }
    
    createBackTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 358;
        const ctx = canvas.getContext('2d');
        
        ctx.fillStyle = '#2563eb';
        ctx.fillRect(0, 0, 256, 358);
        
        ctx.strokeStyle = '#1e40af';
        ctx.lineWidth = 8;
        ctx.strokeRect(4, 4, 248, 350);
        
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 2;
        for (let i = 0; i < 8; i++) {
            ctx.beginPath();
            ctx.arc(128, 179, 20 + i * 15, 0, Math.PI * 2);
            ctx.stroke();
        }
        
        const texture = new THREE.CanvasTexture(canvas);
        return texture;
    }
    
    createCardTexture(rank, suit) {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 358;
        const ctx = canvas.getContext('2d');
        
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, 256, 358);
        
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 4;
        ctx.strokeRect(2, 2, 252, 354);
        
        const isRed = suit === 'h' || suit === 'd';
        ctx.fillStyle = isRed ? '#dc2626' : '#000000';
        
        ctx.font = 'bold 64px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(rank, 128, 80);
        
        const suitSymbols = { c: '♣', d: '♦', h: '♥', s: '♠' };
        ctx.font = 'bold 96px Arial';
        ctx.fillText(suitSymbols[suit], 128, 179);
        
        ctx.save();
        ctx.translate(128, 358);
        ctx.rotate(Math.PI);
        ctx.font = 'bold 48px Arial';
        ctx.fillText(rank, 0, -278);
        ctx.restore();
        
        const texture = new THREE.CanvasTexture(canvas);
        return texture;
    }
    
    createCardMesh(cardName, isRevealed = false, scale = 1) {
        const geometry = new THREE.PlaneGeometry(2 * scale, 2.8 * scale);
        
        // Start with back texture unless revealed
        const initialTexture = isRevealed ? this.textures.cards[cardName] : this.textures.back;
        
        const material = new THREE.MeshBasicMaterial({
            map: initialTexture,
            side: THREE.DoubleSide
        });
        
        const mesh = new THREE.Mesh(geometry, material);
        mesh.userData.cardName = cardName;
        mesh.userData.isRevealed = isRevealed;
        mesh.userData.showingFront = isRevealed;
        mesh.userData.baseRotation = new THREE.Euler(0, isRevealed ? 0 : 0, 0);
        mesh.userData.peekRotation = new THREE.Euler(0, 0, 0);
        mesh.userData.backTexture = this.textures.back;
        mesh.userData.frontTexture = this.textures.cards[cardName];
        
        console.log(`Created card: ${cardName}, revealed: ${isRevealed}`);
        
        return mesh;
    }
    
    updateScene(gameState) {
        console.log('Updating scene...', gameState.street);
        
        // Clear existing cards
        this.cardMeshes.player0.forEach(m => {
            this.scene.remove(m);
            m.geometry.dispose();
            m.material.dispose();
        });
        this.cardMeshes.player1.forEach(m => {
            this.scene.remove(m);
            m.geometry.dispose();
            m.material.dispose();
        });
        this.cardMeshes.board.forEach(m => {
            this.scene.remove(m);
            m.geometry.dispose();
            m.material.dispose();
        });
        
        this.cardMeshes.player0 = [];
        this.cardMeshes.player1 = [];
        this.cardMeshes.board = [];
        
        const isShowdown = gameState.street === 'showdown' || gameState.players.some(p => p.folded);
        const viewport = this.getViewportDimensions();
        const cardOverlap = 1.4 * 0.8; // 20% overlap between cards
        const cardHeight = 1.96; // Card height
        const cardOffsetOut = cardHeight * -0.6; // 20% of card height outside
        const playerCardScale = 1.5;
        const scaledCardWidth = 2 * playerCardScale;
        const playerCardOverlap = scaledCardWidth * 0.8; // Adjust overlap for larger cards
        const sideMargin = 2; // Add side margin
        // Player 0 cards (bottom) - face down unless showdown
        if (gameState.players[0].hole.length > 0) {
            
            
            const startX = viewport.width / 2 - playerCardOverlap - sideMargin; // Right edge with larger margin
            const baseY = -viewport.height / 2 - cardOffsetOut; // 20% below viewport
            
            gameState.players[0].hole.forEach((card, i) => {
                const mesh = this.createCardMesh(card, isShowdown, playerCardScale);
                mesh.position.set(startX + i * playerCardOverlap, baseY, i * 0.01);
                mesh.userData.owner = 0;
                mesh.userData.cardIndex = i;
                this.scene.add(mesh);
                this.cardMeshes.player0.push(mesh);
                console.log(`Added P0 card ${i} at`, mesh.position);
            });
        }
        
        // Player 1 cards (top, rotated 180°) - face down unless showdown
        if (gameState.players[1].hole.length > 0) {

            
            const startX = -viewport.width / 2 + sideMargin; // Left edge with larger margin
            const baseY = viewport.height / 2 + cardOffsetOut; // 20% above viewport
            
            gameState.players[1].hole.forEach((card, i) => {
                const mesh = this.createCardMesh(card, isShowdown, playerCardScale);
                mesh.position.set(startX + i * playerCardOverlap, baseY, i * 0.01);
                mesh.rotation.z = Math.PI;
                mesh.userData.baseRotation.z = Math.PI;
                mesh.userData.owner = 1;
                mesh.userData.cardIndex = i;
                this.scene.add(mesh);
                this.cardMeshes.player1.push(mesh);
                console.log(`Added P1 card ${i} at`, mesh.position);
            });
        }
        
        // Board cards - always face up when dealt
        if (gameState.board.length > 0) {
            console.log('Adding board cards:', gameState.board);
            // Use overlapping layout that fits all cards on screen
            const boardCardScale = 1.5;
            const scaledCardWidth = 2 * boardCardScale;
            const maxCardSpacing = Math.min(scaledCardWidth * 1.6, viewport.width * 0.2); // Max spacing based on viewport
            const cardSpacing = Math.min(maxCardSpacing, viewport.width * 0.9 / gameState.board.length); // Fit in 70% of screen width
            const totalWidth = (gameState.board.length - 1) * cardSpacing;
            const boardStartX = -totalWidth / 2; // Center the cards
            
            gameState.board.forEach((card, i) => {
                const mesh = this.createCardMesh(card, true, boardCardScale);
                mesh.position.set(boardStartX + i * cardSpacing, 0, 0.1 + i * 0.01);
                this.scene.add(mesh);
                this.cardMeshes.board.push(mesh);
                console.log(`Added board card ${i} at`, mesh.position);
            });
        }
        
        console.log(`Scene updated: P0=${this.cardMeshes.player0.length}, P1=${this.cardMeshes.player1.length}, Board=${this.cardMeshes.board.length}`);
    }
    
    getCardMeshAt(screenX, screenY, owner) {
        const rect = this.canvas.getBoundingClientRect();
        const x = ((screenX - rect.left) / rect.width) * 2 - 1;
        const y = -((screenY - rect.top) / rect.height) * 2 + 1;
        
        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2(x, y);
        raycaster.setFromCamera(mouse, this.camera);
        
        const cards = owner === 0 ? this.cardMeshes.player0 : this.cardMeshes.player1;
        
        if (cards.length === 0) return null;
        
        const intersects = raycaster.intersectObjects(cards);
        
        if (intersects.length > 0) {
            return intersects[0].object;
        }
        
        return null;
    }
    
    applyPeekRotation(cardMesh, rotX, rotY) {
        cardMesh.userData.peekRotation.x = rotX * Math.PI / 180;
        cardMesh.userData.peekRotation.y = rotY * Math.PI / 180;
        
        const base = cardMesh.userData.baseRotation;
        const peek = cardMesh.userData.peekRotation;
        
        const absRotX = Math.abs(rotX);
        const threshold = this.config.REVEAL_THRESHOLD_DEG;
        const hysteresis = this.config.HYSTERESIS_DEG;
        
        const wasRevealed = cardMesh.userData.isRevealed;
        
        if (!wasRevealed && absRotX >= threshold) {
            cardMesh.userData.isRevealed = true;
        } else if (wasRevealed && absRotX < threshold - hysteresis) {
            cardMesh.userData.isRevealed = false;
        }
        
        // Update texture based on reveal state
        if (cardMesh.userData.isRevealed && !cardMesh.userData.showingFront) {
            cardMesh.material.map = cardMesh.userData.frontTexture;
            cardMesh.material.needsUpdate = true;
            cardMesh.userData.showingFront = true;
        } else if (!cardMesh.userData.isRevealed && cardMesh.userData.showingFront) {
            cardMesh.material.map = cardMesh.userData.backTexture;
            cardMesh.material.needsUpdate = true;
            cardMesh.userData.showingFront = false;
        }
        
        // Apply rotation
        cardMesh.rotation.set(
            base.x + peek.x,
            base.y + peek.y,
            base.z + peek.z
        );
    }
    
    resetPeekRotation(cardMesh) {
        cardMesh.userData.peekRotation.set(0, 0, 0);
        cardMesh.userData.isRevealed = false;
        
        if (cardMesh.userData.showingFront) {
            cardMesh.material.map = cardMesh.userData.backTexture;
            cardMesh.material.needsUpdate = true;
            cardMesh.userData.showingFront = false;
        }
        
        const base = cardMesh.userData.baseRotation;
        cardMesh.rotation.copy(base);
    }
    
    getPlayerCards(owner) {
        return owner === 0 ? this.cardMeshes.player0 : this.cardMeshes.player1;
    }
    
    updatePlayerCardsRotation(owner, rotationDegrees) {
        const cards = this.getPlayerCards(owner);
        const rotationRadians = rotationDegrees * Math.PI / 180;
        
        
        cards.forEach(cardMesh => {
            // Copy base rotation and add slide rotation around Y axis
            const base = cardMesh.userData.baseRotation;
            cardMesh.rotation.set(base.x, base.y + rotationRadians, base.z);
            
            // Update texture based on rotation threshold
            const isRevealed = rotationDegrees > 90; // Revealed when past 90 degrees
            if (isRevealed && !cardMesh.userData.showingFront) {
                cardMesh.material.map = cardMesh.userData.frontTexture;
                cardMesh.material.needsUpdate = true;
                cardMesh.userData.showingFront = true;
            } else if (!isRevealed && cardMesh.userData.showingFront) {
                cardMesh.material.map = cardMesh.userData.backTexture;
                cardMesh.material.needsUpdate = true;
                cardMesh.userData.showingFront = false;
            }
        });
    }
    
    render() {
        this.renderer.render(this.scene, this.camera);
    }
}