import { HypercubeCpuGrid } from '../src/core/HypercubeCpuGrid';
import { HypercubeMasterBuffer } from '../src/core/HypercubeMasterBuffer';
import { AerodynamicsEngine } from '../src/engines/AerodynamicsEngine';
import { BoundaryType } from '../src/core/cpu/BoundaryConditions';
import { HypercubeMath } from '../src/math/HypercubeMath';
import { Hypercube } from '../src/Hypercube';
import { BenchmarkHUD } from './shared/BenchmarkHUD';
import { HypercubeGPUContext } from '../src/core/gpu/HypercubeGPUContext';

const RESOLUTION = 256;
const ROWS = 2;
const COLS = 2;

async function bootstrap() {
    const urlParams = new URLSearchParams(window.location.search);
    const mode = urlParams.get('mode') === 'cpu' ? 'cpu' : 'gpu';

    // Add description overlay
    const desc = document.createElement('div');
    desc.className = 'showcase-description';
    desc.innerHTML = `
        <h2>01: Aérodynamique 2D</h2>
        <p>Simulation fluide utilisant la méthode Lattice Boltzmann (LBM D2Q9) à O(1). 
        Le calcul est distribué via un pool de Web Workers multithreadé (SharedArrayBuffer).</p>
        <p style="margin-top:10px; font-size: 0.8rem; border-top: 1px solid #333; padding-top:10px;">
        Vortex de Karman visibles derrière l'obstacle fixe.</p>
    `;
    document.body.appendChild(desc);

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = './showcase.css';
    document.head.appendChild(link);

    const totalCells = RESOLUTION * RESOLUTION;
    const engineTemp = new AerodynamicsEngine();
    const numFaces = engineTemp.getRequiredFaces();

    if (mode === 'gpu') {
        const ok = await HypercubeGPUContext.init();
        if (!ok) {
            alert("WebGPU not supported or initialization failed.");
            return;
        }
    }

    const masterBuffer = new HypercubeMasterBuffer(totalCells * numFaces * 4 * ROWS * COLS + 1024);

    const grid = await HypercubeCpuGrid.create(
        COLS, ROWS,
        RESOLUTION,
        masterBuffer,
        () => new AerodynamicsEngine(),
        numFaces,
        false, // Not periodic
        true,   // Multithreading on
        new URL('./cpu.worker.ts', import.meta.url).href,
        mode
    );

    // Apply strict Global Boundaries
    grid.boundaryConfig = {
        left: BoundaryType.INFLOW,
        right: BoundaryType.OUTFLOW,
        top: BoundaryType.WALL,
        bottom: BoundaryType.WALL,
        inflowUx: 0.15,
        inflowUy: 0.0,
        inflowDensity: 1.0
    };

    // 1. Initialize with smooth flow
    const u0 = 0.15;
    const engineTemp2 = new AerodynamicsEngine();
    const eq = engineTemp2.getEquilibrium(1.0, u0, 0.0);
    for (let gy = 0; gy < ROWS; gy++) {
        for (let gx = 0; gx < COLS; gx++) {
            const chunk = grid.cubes[gy][gx]!;
            // Fill ONLY the population faces (0-17) with equilibrium
            for (let k = 0; k < 18; k++) chunk.faces[k].fill(eq[k % 9]);
            // Clear other faces (obstacles, ux, uy, curl, smoke)
            for (let k = 18; k < 24; k++) chunk.faces[k].fill(0);
        }
    }

    // 2. Draw Biplane Wing Profiles (Obstacles)
    const wingLength = 80.0;
    const thickness = 0.16;
    const angle = 12 * Math.PI / 180; // Positive angle of attack for NACA profiles

    for (let gy = 0; gy < ROWS; gy++) {
        for (let gx = 0; gx < COLS; gx++) {
            const chunk = grid.cubes[gy][gx]!;
            const globalOffX = gx * (RESOLUTION - 2);
            const globalOffY = gy * (RESOLUTION - 2);

            for (let ly = 1; ly < RESOLUTION - 1; ly++) {
                const py = globalOffY + (ly - 1);
                for (let lx = 1; lx < RESOLUTION - 1; lx++) {
                    const px = globalOffX + (lx - 1);
                    const idx = ly * RESOLUTION + lx;

                    // Combined Wing Centers for biplane effect
                    const paintWing = (cx: number, cy: number) => {
                        const dx = px - cx;
                        const dy = py - cy;
                        const rx = (dx * Math.cos(angle) + dy * Math.sin(angle)) / wingLength;
                        const ry = (-dx * Math.sin(angle) + dy * Math.cos(angle)) / wingLength;
                        if (rx > 0 && rx < 1.0) {
                            const y_t = 5.0 * thickness * (0.2969 * Math.sqrt(rx) - 0.1260 * rx - 0.3516 * rx * rx + 0.2843 * rx * rx * rx - 0.1015 * rx * rx * rx * rx);
                            return Math.abs(ry) < y_t;
                        }
                        return false;
                    };

                    // Wing 1 (Top) and Wing 2 (Bottom)
                    if (paintWing(RESOLUTION * 0.7, RESOLUTION * 0.7) ||
                        paintWing(RESOLUTION * 0.75, RESOLUTION * 1.3)) {
                        chunk.faces[18][idx] = 1.0;
                    }
                }
            }
        }
    }

    grid.pushToGPU();

    // Prepare Rendereur
    const canvas = document.createElement('canvas');
    canvas.width = (RESOLUTION - 2) * COLS;
    canvas.height = (RESOLUTION - 2) * ROWS;
    canvas.style.display = 'block';
    canvas.style.width = '100vw';
    canvas.style.height = '100vh';
    canvas.style.objectFit = 'contain';
    canvas.style.background = '#020408'; // Deep Arctic background
    document.body.appendChild(canvas);

    const hud = new BenchmarkHUD('Aerodynamics D2Q9 [Shiny Arctic]', `${RESOLUTION * COLS} x ${RESOLUTION * ROWS}`);

    // Main Compute Loop
    async function tick() {
        const start = performance.now();
        await grid.compute();

        const currentParity = (grid.cubes[0][0]!.engine as any).parity ?? 0;
        const smokeFace = 22 + currentParity; // Use current parity for rendering

        // Render Visual Composite (Face 22/23: Smoke + Face 21: Vorticity)
        Hypercube.autoRender(grid, canvas, {
            faceIndex: smokeFace,
            colormap: 'arctic',
            minVal: 0.0,
            maxVal: 1.0,
            obstaclesFace: 18,
            vorticityFace: 21 // Inject vorticity for crisp convolutions
        });

        const ms = performance.now() - start;
        hud.updateCompute(ms);
        hud.tickFrame();
        requestAnimationFrame(tick);
    }

    tick();
}

bootstrap();
