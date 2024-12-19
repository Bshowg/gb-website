import * as THREE from 'three';

let scene, camera, renderer;
let grid, nextGrid;
const size = 50;

function init() {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('gameOfLifeCanvas') });

    const canvasContainer = document.querySelector('.canvas-container');
    const width = canvasContainer.clientWidth;
    const height = width * 9 / 16;
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    camera.position.z = 100;

    grid = createGrid(size);
    nextGrid = createGrid(size);

    initializeGrid();

    const geometry = new THREE.PlaneGeometry(1, 1);
    for (let i = 0; i < size; i++) {
        for (let j = 0; j < size; j++) {
            const cell = grid[i][j];
            cell.position.set(i - size / 2, j - size / 2, 0);
            scene.add(cell);
        }
    }

    window.addEventListener('resize', onWindowResize, false);

    setInterval(() => {
        updateGrid();
        renderGrid();
    }, 100); // Update every 100ms

    animate();
}

function createGrid(size) {
    const grid = new Array(size);
    for (let i = 0; i < size; i++) {
        grid[i] = new Array(size).fill(null);
    }
    return grid;
}

function initializeGrid() {
    const materialAlive = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const materialDead = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const geometry = new THREE.PlaneGeometry(1, 1);

    for (let i = 0; i < size; i++) {
        for (let j = 0; j < size; j++) {
            const alive = Math.random() > 0.5;
            const material = alive ? materialAlive : materialDead;
            const cell = new THREE.Mesh(geometry, material);
            grid[i][j] = cell;
        }
    }
}

function countAliveNeighbors(x, y) {
    let count = 0;
    for (let i = -1; i <= 1; i++) {
        for (let j = -1; j <= 1; j++) {
            if (i === 0 && j === 0) continue;
            const ni = (x + i + size) % size;
            const nj = (y + j + size) % size;
            if (grid[ni][nj].material.color.equals(new THREE.Color(0xffffff))) {
                count++;
            }
        }
    }
    return count;
}

function updateGrid() {
    for (let i = 0; i < size; i++) {
        for (let j = 0; j < size; j++) {
            const aliveNeighbors = countAliveNeighbors(i, j);
            const cell = grid[i][j];
            const isAlive = cell.material.color.equals(new THREE.Color(0xffffff));

            if (isAlive && (aliveNeighbors < 2 || aliveNeighbors > 3)) {
                nextGrid[i][j] = false;
            } else if (!isAlive && aliveNeighbors === 3) {
                nextGrid[i][j] = true;
            } else {
                nextGrid[i][j] = isAlive;
            }
        }
    }

    for (let i = 0; i < size; i++) {
        for (let j = 0; j < size; j++) {
            const cell = grid[i][j];
            const isAlive = nextGrid[i][j];
            cell.material.color.set(isAlive ? 0xffffff : 0x000000);
        }
    }
}

function renderGrid() {
    renderer.render(scene, camera);
}

function onWindowResize() {
    const canvasContainer = document.querySelector('.canvas-container');
    const width = canvasContainer.clientWidth;
    const height = width * 9 / 16;
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
}

window.onload = init;
