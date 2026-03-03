import './style.css';
import {
    Hypercube,
    VolumeDiffusionEngine,
    HypercubeViz,
    HypercubeIsoRenderer
} from 'hypercube-compute';

// Config
const SIZE = 64;
const SCALE = 4;
let viewMode: 'slice' | 'iso' = 'iso';

// DOM
const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const fpsEl = document.getElementById('fps')!;
const computeTimeEl = document.getElementById('computeTime')!;
const btnSlice = document.getElementById('btnSlice')!;
const btnIso = document.getElementById('btnIso')!;
const btnReset = document.getElementById('btnReset')!;
const rangeDiff = document.getElementById('rangeDiff') as HTMLInputElement;

// Setup Hypercube
const hc = new Hypercube(10); // 10MB
const engine = new VolumeDiffusionEngine(0.1, 1.0, 'periodic');
const chunk = hc.createCube("diffusion-demo", { nx: SIZE, ny: SIZE, nz: SIZE }, engine, 2);

function resetBlob() {
    chunk.faces[0].fill(0);
    chunk.faces[1].fill(0);
    // Inject a hot sphere in the center
    HypercubeViz.injectSphere(chunk, 0, SIZE / 2, SIZE / 2, SIZE / 2, 12, 1.0);
}

// Initial state
resetBlob();
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

// Events
btnSlice.onclick = () => viewMode = 'slice';
btnIso.onclick = () => viewMode = 'iso';
btnReset.onclick = () => resetBlob();
rangeDiff.oninput = () => {
    engine.diffusionRate = parseFloat(rangeDiff.value);
};

// Loop
let frameCount = 0;
let lastTime = performance.now();

function loop() {
    frameCount++;
    const now = performance.now();
    const dt = now - lastTime;

    if (dt >= 1000) {
        fpsEl.innerText = `FPS: ${Math.round((frameCount * 1000) / dt)}`;
        frameCount = 0;
        lastTime = now;
    }

    // Compute
    const tStart = performance.now();
    chunk.compute();
    const tEnd = performance.now();
    computeTimeEl.innerText = `Compute: ${(tEnd - tStart).toFixed(2)}ms`;

    // Inject continuous heat to battle dissipation/diffusion
    HypercubeViz.injectSphere(chunk, 0, SIZE / 2, SIZE / 2, SIZE / 2, 6, 0.1);

    // Render
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (viewMode === 'slice') {
        ctx.save();
        ctx.translate(canvas.width / 2 - (SIZE * SCALE) / 2, canvas.height / 2 - (SIZE * SCALE) / 2);
        HypercubeIsoRenderer.renderSliceZ(ctx, chunk, 0, SIZE / 2, SCALE);
        ctx.restore();
    } else {
        HypercubeIsoRenderer.renderIso(ctx, chunk, 0, {
            scale: 4,
            offsetX: canvas.width / 2,
            offsetY: canvas.height / 2 + 100,
            threshold: 0.01,
            opacity: 0.7,
            coreDensity: 4
        });
    }

    requestAnimationFrame(loop);
}

loop();
window.onresize = () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
};
