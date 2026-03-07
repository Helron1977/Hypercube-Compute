import { HypercubeFactory } from '../v8-sandbox/core/HypercubeFactory';
import { OceanV8Cpu } from '../v8-sandbox/engines/OceanV8Cpu';
import { OceanV8Gpu } from '../v8-sandbox/engines/OceanV8Gpu';
import { HypercubeGPUContext } from '../src/core/gpu/HypercubeGPUContext';
import { HypercubeIsoRenderer } from '../src/utils/HypercubeIsoRenderer';
import { Circle } from '../v8-sandbox/core/Shapes';
import { BenchmarkHUD } from './shared/BenchmarkHUD';

async function main() {
    await HypercubeGPUContext.init();

    const RESOLUTION = 128; // Safer for Legacy Renderer
    const COLS = 2;
    const ROWS = 2;

    // 1. Instantiation Déclarative (Zéro-Mod Legacy)
    const proxy = await HypercubeFactory.instantiate(
        OceanV8Cpu,
        {
            dimensions: { nx: RESOLUTION, ny: RESOLUTION, chunks: [COLS, ROWS] },
            mode: 'gpu',
            params: {
                'tau_0': 0.8,
                'bioDiffusion': 0.05,
                'bioGrowth': 0.001
            }
        },
        OceanV8Gpu
    );

    const grid = (proxy as any).grid;
    const worldW = (RESOLUTION - 2) * COLS;
    const worldH = (RESOLUTION - 2) * ROWS;

    // 2. Full Background Initialization (Vital for LBM density 1.0)
    for (const cube of grid.cubes.flat()) {
        const engine = (cube as any).engine;
        if (engine && typeof engine.init === 'function') {
            engine.init(cube.faces, cube.nx, cube.ny, cube.nz);
        }
    }

    // Initial Splash
    grid.applyEquilibrium(worldW / 2, worldH / 2, 0, 20, 1.5, 0.2, 0.2);
    grid.pushToGPU(); // Vital after CPU initialization

    // 2. Setup Renderer (Legacy Renderer used as requested)
    const canvas = document.createElement('canvas');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    canvas.style.position = 'fixed';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.zIndex = '1';
    document.body.appendChild(canvas);

    const renderer = new HypercubeIsoRenderer(canvas, undefined, 4.0);
    const hud = new BenchmarkHUD('V8 Ocean GPU (Zero-Mod)', `${RESOLUTION * COLS} x ${RESOLUTION * ROWS}`);

    // 3. Interaction Loops
    window.addEventListener('mousedown', (e) => {
        const x = (e.clientX / window.innerWidth) * 512;
        const y = (e.clientY / window.innerHeight) * 512;
        proxy.addShape(new Circle({ x, y, z: 0 }, 20, {
            'Biology': { role: 'inlet', value: 1.0 }
        }));
        grid.pushToGPU(); // Vital: Update VRAM after CPU interaction
    });

    async function frame() {
        const start = performance.now();
        await proxy.compute(); // VITAL: Await the GPU dispatch and boundary sync!

        // 4. Parallel Readback
        const flatCubes = grid.cubes.flat();
        await Promise.all(flatCubes.map((c: any) => c.syncToHost()));

        renderer.clearAndSetup(5, 15, 35); // Deep sea
        renderer.renderMultiChunkVolume(
            grid.cubes.map((row: any) => row.map((c: any) => c.faces)),
            grid.nx, grid.ny, grid.cols, grid.rows,
            { densityFaceIndex: 22, obstacleFaceIndex: 18 }
        );

        hud.updateCompute(performance.now() - start);
        hud.tickFrame();
        requestAnimationFrame(frame);
    }

    frame();
    console.info("V8 Ocean GPU Showcase (Zero-Mod Edition) Started. 🌊🚀");
}

main();
