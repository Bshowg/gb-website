import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.js';

let scene, camera, renderer;
let grid, nextGrid;
const size = 50;

function init() {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('gameOfLifeCanvas') });
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.position.z = 100;

    grid = createGrid(size);
    nextGrid = createGrid(size);

    const geometry = new THREE.PlaneGeometry(1, 1);
    const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
    for (let i = 0; i < size; i++) {
        for (let j = 0; j < size; j++) {
            const cell = new THREE.Mesh(geometry, material);
            cell.position.set(i - size / 2, j - size / 2, 0);
            scene.add(cell);
            grid[i][j] = cell;
        }
    }

    animate();
}

function createGrid(size) {
    const grid = new Array(size);
    for (let i = 0; i < size; i++) {
        grid[i] = new Array(size).fill(null);
    }
    return grid;
}

function animate() {
    requestAnimationFrame(animate);
    updateGrid();
    renderer.render(scene, camera);
}

function updateGrid() {
    for (let i = 0; i < size; i++) {
        for (let j = 0; j < size; j++) {
            const alive = Math.random() > 0.5;
            grid[i][j].material.color.set(alive ? 0xffffff : 0x000000);
        }
    }
}

window.onload = init;
