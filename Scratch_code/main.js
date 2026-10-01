const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');

const deadEndsEl = document.getElementById('deadEnds');
const targetEl = document.getElementById('target');

const TILE = 12;           // pixel size per cell
const GRID_W = 41;        // must be odd for nicer mazes
const GRID_H = 31;        // must be odd

const TARGET_DEAD_ENDS = 60; // <-- set your n here
targetEl.textContent = String(TARGET_DEAD_ENDS);

// ---------- Maze generation ----------
function makeGrid(w, h) {
    // grid cells are walls by default
    return Array.from({ length: h }, () => Array(w).fill(1));
}

function inBounds(x, y, w, h) {
    return x >= 0 && y >= 0 && x < w && y < h;
}

function carvePerfectMaze(grid) {
    // Recursive backtracker on odd coordinates
    const h = grid.length, w = grid[0].length;

    const dirs = [
        { dx: 2, dy: 0 },
        { dx: -2, dy: 0 },
        { dx: 0, dy: 2 },
        { dx: 0, dy: -2 },
    ];

    // Reset grid to walls
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) grid[y][x] = 1;

    const startX = 1;
    const startY = 1;

    function shuffle(a) {
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }

    function carveCell(x, y) {
        grid[y][x] = 0;
        for (const d of shuffle(dirs.slice())) {
            const nx = x + d.dx;
            const ny = y + d.dy;
            if (!inBounds(nx, ny, w, h)) continue;
            if (grid[ny][nx] === 1) {
                // carve corridor between
                grid[y + d.dy / 2][x + d.dx / 2] = 0;
                carveCell(nx, ny);
            }
        }
    }

    carveCell(startX, startY);
    return grid;
}

function countDeadEnds(grid) {
    const h = grid.length, w = grid[0].length;
    let dead = 0;

    for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
            if (grid[y][x] !== 0) continue; // only open cells
            // count open neighbors
            let open = 0;
            if (grid[y][x - 1] === 0) open++;
            if (grid[y][x + 1] === 0) open++;
            if (grid[y - 1][x] === 0) open++;
            if (grid[y + 1][x] === 0) open++;
            // dead end = exactly 1 neighbor
            if (open === 1) dead++;
        }
    }
    return dead;
}

function generateMazeWithDeadEnds(w, h, target, maxTries = 5000) {
    const grid = makeGrid(w, h);

    for (let i = 0; i < maxTries; i++) {
        carvePerfectMaze(grid);
        const dead = countDeadEnds(grid);
        if (dead === target) {
            return { grid, deadEnds: dead, tries: i + 1 };
        }
    }

    // fallback: closest (avoid hard fail)
    let best = { grid: null, deadEnds: -1, diff: Infinity, tries: maxTries };
    const grid2 = makeGrid(w, h);

    for (let i = 0; i < maxTries; i++) {
        carvePerfectMaze(grid2);
        const dead = countDeadEnds(grid2);
        const diff = Math.abs(dead - target);
        if (diff < best.diff) {
            best = { grid: grid2.map(r => r.slice()), deadEnds: dead, diff, tries: i + 1 };
            if (diff === 0) break;
        }
    }
    return best;
}

// ---------- Rendering ----------
const { grid, deadEnds, tries } = generateMazeWithDeadEnds(GRID_W, GRID_H, TARGET_DEAD_ENDS);

deadEndsEl.textContent = `${deadEnds} (tries ${tries})`;

canvas.width = GRID_W * TILE;
canvas.height = GRID_H * TILE;

function drawCell(x, y, v) {
    if (v === 1) {
        ctx.fillStyle = '#1b2a4a';
        ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
    } else {
        // pellet dots
        ctx.fillStyle = '#f7d774';
        // draw pellet on corridor cells
        ctx.beginPath();
        ctx.arc(x * TILE + TILE / 2, y * TILE + TILE / 2, 2.0, 0, Math.PI * 2);
        ctx.fill();
    }
}

function drawMaze() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let y = 0; y < GRID_H; y++) {
        for (let x = 0; x < GRID_W; x++) {
            drawCell(x, y, grid[y][x]);
        }
    }
}

// ---------- Simple Pacman movement ----------
let px = 1, py = 1;
let dir = { x: 0, y: 0 };

function isWall(x, y) {
    return grid[y]?.[x] === 1;
}

function tryStep(nx, ny) {
    if (!isWall(nx, ny)) {
        px = nx; py = ny;
        // remove pellet visually by turning to path cell with no pellet:
        // easiest: just set to 0 and track pellets separately if needed.
        // For now, erase by marking -1
        if (grid[py][px] === 0) grid[py][px] = -1;
    }
}

document.addEventListener('keydown', (e) => {
    const k = e.key;
    if (k === 'ArrowUp') dir = { x: 0, y: -1 };
    if (k === 'ArrowDown') dir = { x: 0, y: 1 };
    if (k === 'ArrowLeft') dir = { x: -1, y: 0 };
    if (k === 'ArrowRight') dir = { x: 1, y: 0 };
});

function drawPacman() {
    ctx.fillStyle = '#ffcc00';
    const cx = px * TILE + TILE / 2;
    const cy = py * TILE + TILE / 2;

    // draw body
    ctx.beginPath();
    ctx.arc(cx, cy, TILE * 0.42, Math.PI / 7, Math.PI * 2 - Math.PI / 7, false);
    ctx.lineTo(cx, cy);
    ctx.fill();

    // direction mouth flicker could be added later
}

function gameLoop() {
    // attempt move on grid tick
    const nx = px + dir.x;
    const ny = py + dir.y;
    if (!isWall(nx, ny)) {
        tryStep(nx, ny);
    }

    // re-render
    drawMaze();
    drawPacman();

    requestAnimationFrame(() => {
        // move slower than 60fps:
        setTimeout(gameLoop, 70);
    });
}

drawMaze();
tryStep(1, 1);
gameLoop();