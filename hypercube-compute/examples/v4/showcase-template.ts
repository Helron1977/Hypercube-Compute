import { Hypercube } from '../../src/Hypercube';

export interface ShowcaseOptions {
    title: string;
    engine: string;
    dimensions: [number, number, number];
    params?: Record<string, number>;
    onInit?: (grid: any) => void;
    customUI?: (container: HTMLElement) => void;
}

export async function createShowcase(options: ShowcaseOptions) {
    const { title: titleText, engine, dimensions, params, onInit } = options;

    // 1. Premium UI Layout
    const container = document.createElement('div');
    container.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
        background: radial-gradient(circle at center, #1a1a2e 0%, #0f0f1a 100%);
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        color: white; font-family: 'Outfit', 'Inter', sans-serif;
    `;
    document.body.appendChild(container);

    const title = document.createElement('h1');
    title.innerText = titleText;
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
        background: rgba(0,0,0,0.8); backdrop-filter: blur(15px);
        padding: 25px; border-radius: 16px; border: 1px solid rgba(255,255,255,0.1);
        font-size: 14px; min-width: 240px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);
        z-index: 100;
    `;
    container.appendChild(hud);

    // 2.5 Navigation
    const nav = document.createElement('div');
    nav.style.cssText = `
        position: absolute; bottom: 40px; left: 50%; transform: translateX(-50%); 
        display: flex; gap: 20px; z-index: 100;
    `;
    container.appendChild(nav);

    const backBtn = document.createElement('a');
    backBtn.href = '/index.html';
    backBtn.innerText = '← BACK TO HUB';
    backBtn.style.cssText = `
        padding: 14px 28px; border-radius: 30px; border: 1px solid rgba(0, 242, 254, 0.3);
        background: rgba(0, 242, 254, 0.05); color: #00f2fe; text-decoration: none;
        font-size: 11px; font-weight: bold; letter-spacing: 2px; transition: 0.3s;
        backdrop-filter: blur(5px);
    `;
    backBtn.onmouseenter = () => {
        backBtn.style.background = 'rgba(0, 242, 254, 0.2)';
        backBtn.style.borderColor = '#00f2fe';
        backBtn.style.boxShadow = '0 0 20px rgba(0, 242, 254, 0.3)';
    };
    backBtn.onmouseleave = () => {
        backBtn.style.background = 'rgba(0, 242, 254, 0.05)';
        backBtn.style.borderColor = 'rgba(0, 242, 254, 0.3)';
        backBtn.style.boxShadow = 'none';
    };
    nav.appendChild(backBtn);

    let currentBoundary: 'periodic' | 'clamped' = 'periodic';

    const updateHud = (stats: any) => {
        hud.innerHTML = `
            <div style="color: #00f2fe; margin-bottom: 20px; font-weight: bold; letter-spacing: 1px; font-size: 13px;">HYPERCUBE COMMAND CENTER</div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 10px; opacity: 0.6; font-size: 12px;"><span>ENGINE</span> <span>${engine}</span></div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 10px; opacity: 0.6; font-size: 12px;"><span>GRID</span> <span>${dimensions.join('x')}</span></div>
            <hr style="border: none; border-top: 1px solid rgba(255,255,255,0.1); margin: 15px 0;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 10px;"><span>PERFORMANCE</span> <span style="color: #00ff88; font-weight: bold; font-family: monospace;">${stats.fps} FPS</span></div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 10px;"><span>FRAME TIME</span> <span style="color: #00ff88; font-family: monospace;">${stats.stepTime} ms</span></div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 20px; opacity: 0.6; font-size: 12px;"><span>TOPOLOGY</span> <span id="boundary-status" style="color: #00f2fe;">${currentBoundary.toUpperCase()}</span></div>
            
            <button id="toggle-boundary" style="width: 100%; padding: 12px; border-radius: 8px; border: 1px solid #00f2fe; background: rgba(0,242,254,0.1); color: #00f2fe; font-size: 11px; font-weight: bold; cursor: pointer; transition: 0.2s; letter-spacing: 1px;">SWITCH BOUNDARIES</button>
        `;

        // Setup listener after HTML update
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
    };

    // 3. Initialize High-Level Facade
    const sim = await Hypercube.create({
        engine,
        dimensions,
        mode: 'cpu',
        renderer: "canvas",
        params,
        workers: true,
        workerScript: '/cpu.worker.ts'
    });

    // Run custom initialization ONCE
    if (onInit) {
        onInit(sim);
        // Double the initialization for Ping-Pong buffers to avoid flicker
        const stride = dimensions[0] * dimensions[1] * dimensions[2];
        for (const cube of sim.cubes.flat()) {
            if (cube) {
                for (const face of cube.faces) {
                    if (face.length === stride * 2) {
                        face.subarray(stride, stride * 2).set(face.subarray(0, stride));
                    }
                }
            }
        }
    }

    // 4. Start with Stats
    let frameCount = 0;
    let lastTime = performance.now();
    let fps = 0;
    let totalStepTime = 0;
    let _stepStart = 0;

    Hypercube.start(sim, canvas, {
        onBeforeCompute: () => { _stepStart = performance.now(); },
        onAfterCompute: () => {
            const end = performance.now();
            totalStepTime += (end - _stepStart);
            frameCount++;

            const now = performance.now();
            if (now - lastTime > 1000) {
                fps = Math.round((frameCount * 1000) / (now - lastTime));
                const avgStepTime = (totalStepTime / frameCount).toFixed(2);

                updateHud({
                    fps: fps,
                    stepTime: avgStepTime
                });

                frameCount = 0;
                totalStepTime = 0;
                lastTime = now;
            }
        }
    });

    // Initial HUD
    updateHud({ fps: 0, stepTime: "..." });

    if (options.customUI) options.customUI(container);

    console.log(`[Showcase] ${titleText} running.`);
    return sim;
}
