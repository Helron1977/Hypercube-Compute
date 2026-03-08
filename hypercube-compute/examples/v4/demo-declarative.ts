import { Hypercube } from '../../src/Hypercube';
import { HypercubeCpuGrid } from '../../src/core/HypercubeCpuGrid';

/**
 * Hypercube V4 - Mature Declarative Showcase
 * Demonstrates: HUD, Interactive Boundaries, Lifecycle Hooks, and Performance.
 */
async function runShowcase() {
    // 1. Create a Premium UI Layout
    const container = document.createElement('div');
    container.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
        background: radial-gradient(circle at center, #1a1a2e 0%, #0f0f1a 100%);
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        color: white; font-family: 'Outfit', 'Inter', sans-serif;
    `;
    document.body.appendChild(container);

    const title = document.createElement('h1');
    title.innerText = 'Hypercube V4 Declarative Core';
    title.style.cssText = 'margin-bottom: 20px; font-weight: 300; letter-spacing: 2px; color: #00f2fe; text-shadow: 0 0 10px rgba(0,242,254,0.5);';
    container.appendChild(title);

    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 640;
    canvas.style.cssText = 'border-radius: 12px; box-shadow: 0 20px 50px rgba(0,0,0,0.5); background: #000;';
    container.appendChild(canvas);

    // 2. HUD Overlay
    const hud = document.createElement('div');
    hud.style.cssText = `
        position: absolute; top: 20px; right: 20px; 
        background: rgba(0,0,0,0.7); backdrop-filter: blur(10px);
        padding: 20px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.1);
        font-size: 14px; min-width: 200px;
    `;
    container.appendChild(hud);

    // 2. Detect Mode from URL
    const urlParams = new URLSearchParams(window.location.search);
    let currentMode = (urlParams.get('mode') === 'gpu' ? 'gpu' : 'cpu') as 'cpu' | 'gpu';
    let currentBoundary: 'periodic' | 'clamped' = 'periodic';

    const updateHud = (stats: any) => {
        hud.innerHTML = `
            <div style="color: #00f2fe; margin-bottom: 15px; font-weight: bold; letter-spacing: 1px;">HYPERCUBE COMMAND HUD</div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 8px; opacity: 0.8;"><span>Abstraction:</span> <span>Declarative V4</span></div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 8px; opacity: 0.8;"><span>Dimensions:</span> <span>${stats.res}</span></div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 8px; opacity: 0.8;"><span>Compute Mode:</span> <span style="color: #ffcc00; font-weight: bold;">${stats.mode}</span></div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 8px;"><span>Performance:</span> <span style="color: #00ff88; font-weight: bold; font-family: monospace;">${stats.fps} FPS</span></div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 8px;"><span>Step Time:</span> <span style="color: #00ff88; font-family: monospace;">${stats.stepTime} ms</span></div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 12px; opacity: 0.8;"><span>Boundaries:</span> <span id="boundary-status" style="color: #00f2fe;">${stats.boundary.toUpperCase()}</span></div>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 15px;">
                <button id="toggle-boundary" style="padding: 10px; border-radius: 6px; border: 1px solid #00f2fe; background: transparent; color: #00f2fe; font-size: 11px; font-weight: bold; cursor: pointer; transition: 0.2s;">TOGGLE BOUNDS</button>
                <button id="toggle-mode" style="padding: 10px; border-radius: 6px; border: none; background: #00f2fe; color: #000; font-size: 11px; font-weight: bold; cursor: pointer;">${stats.mode === 'GPU' ? 'SWITCH TO CPU' : 'SWITCH TO GPU'}</button>
            </div>
        `;
    };

    // 3. Initialize High-Level Facade
    const sim = await Hypercube.create({
        engine: "HeatDiffusion3D",
        dimensions: [256, 256, 1],
        mode: currentMode,
        renderer: "canvas",
        params: { diffusionRate: 0.15 },
        onBeforeCompute: (grid: HypercubeCpuGrid) => {
            if ((grid as any)._initialized) return;
            const firstCube = grid.cubes[0][0];
            if (firstCube) {
                const nx = 256, ny = 256;
                const face = firstCube.faces[0];
                for (let y = 0; y < ny; y++) {
                    for (let x = 0; x < nx; x++) {
                        const idx = y * nx + x;
                        const dx = x - nx / 2, dy = y - ny / 2;
                        const dist = Math.sqrt(dx * dx + dy * dy);
                        if (dist < 20) face[idx] = 10.0;
                        if (Math.abs(dx) < 2 && Math.abs(dy) < 80) face[idx] = 5.0;
                        if (Math.abs(dy) < 2 && Math.abs(dx) < 80) face[idx] = 3.0;
                    }
                }
            }
            (grid as any)._initialized = true;
        }
    });

    // 4. Start with Stats
    let frameCount = 0;
    let lastTime = performance.now();
    let fps = 0;
    let stepSum = 0;

    Hypercube.start(sim, canvas, {
        onBeforeCompute: () => { (sim as any)._stepStart = performance.now(); },
        onAfterCompute: async () => {
            const end = performance.now();
            stepSum += (end - (sim as any)._stepStart);

            // --- V4 VISIBILITY RULE ---
            // If in GPU mode, we must explicitly sync the result face (0) back to CPU for the CanvasAdapter.
            if (currentMode === 'gpu') {
                await sim.cubes[0][0]?.syncToHost([0], true); // Force block for demo visibility
            }
        },
        onAfterRender: () => {
            frameCount++;
            const now = performance.now();
            if (now - lastTime > 1000) {
                fps = Math.round((frameCount * 1000) / (now - lastTime));
                const avgStepTime = (stepSum / frameCount).toFixed(2);
                frameCount = 0;
                stepSum = 0;
                lastTime = now;

                updateHud({
                    res: "256x256 V4",
                    mode: currentMode.toUpperCase(),
                    fps: fps,
                    stepTime: avgStepTime,
                    boundary: currentBoundary
                });

                // Bind Events
                const btnBound = document.getElementById('toggle-boundary');
                if (btnBound) btnBound.onclick = () => {
                    currentBoundary = currentBoundary === 'periodic' ? 'clamped' : 'periodic';
                    const firstCube = sim.cubes[0][0];
                    if (firstCube && firstCube.engine && (firstCube.engine as any).descriptor) {
                        (firstCube.engine as any).descriptor.boundaries = { all: { role: currentBoundary } };
                        const status = document.getElementById('boundary-status');
                        if (status) status.innerText = currentBoundary.toUpperCase();
                    }
                };

                const btnMode = document.getElementById('toggle-mode');
                if (btnMode) {
                    btnMode.onclick = () => {
                        const newMode = currentMode === 'cpu' ? 'gpu' : 'cpu';
                        window.location.search = `?mode=${newMode}`;
                    };
                }
            }
        }
    });

    // Initial HUD
    updateHud({ res: "256x256", mode: currentMode.toUpperCase(), fps: 0, stepTime: "...", boundary: currentBoundary });

    console.log("[Showcase] Declarative V4 running with interactive boundaries.");
}

runShowcase().catch(console.error);
