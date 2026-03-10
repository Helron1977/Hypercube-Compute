import { HypercubeNeoFactory } from '../../core/HypercubeNeoFactory';
import { NacaHelper } from '../../helpers/ShapeHelpers';
import { HypercubeNeo } from '../../HypercubeNeo';

/**
 * Neo Aero (GPU) Orchestrator
 * Migrated from examples/12-neo-gpu.ts
 */
async function main() {
    const factory = new HypercubeNeoFactory();

    // 1. Generate NACA Wings (Biplane signature)
    const wingPoints = NacaHelper.generateNaca4(0.00, 0.0, 0.16, 80, 120, -12 * Math.PI / 180);

    // 2. Load Manifest from local showcase root
    const manifest = await factory.fromManifest('../showcase-aero-gpu.json');
    const { config, engine: descriptor } = manifest;

    // Ensure GPU mode
    config.mode = 'gpu';

    // Inject dynamic NACA points
    const wingTop = config.objects?.find((o: any) => o.id === 'wing_top');
    if (wingTop) wingTop.points = wingPoints;
    const wingBottom = config.objects?.find((o: any) => o.id === 'wing_bottom');
    if (wingBottom) wingBottom.points = wingPoints;

    // 3. Build Engine (WebGPU)
    const engine = await factory.build(config, descriptor);

    const NX = config.dimensions.nx;
    const NY = config.dimensions.ny;

    // 4. Setup Containers
    const container = document.getElementById('canvas-container')!;
    const canvas = document.createElement('canvas');
    canvas.width = NX;
    canvas.height = NY;
    container.appendChild(canvas);

    const fpsElem = document.getElementById('fps-counter');

    let isInitialized = false;
    let frameCount = 0;
    let lastTime = performance.now();

    async function loop() {
        try {
            // physics step
            await engine.step(1);

            // One-time initialization logic
            if (!isInitialized) {
                if (config.objects && config.objects[0].id === 'grid_init') {
                    config.objects.shift();
                    isInitialized = true;
                }
            }

            // Sync indices for rendering
            const smokeIdx = engine.parityManager.getFaceIndices('smoke').read;
            const obsIdx = engine.parityManager.getFaceIndices('obstacles').read;
            const vortIdx = engine.parityManager.getFaceIndices('vorticity').read;

            // Render via Neo adapter
            // Note: autoRender now automatically uses WebGpuRendererNeo for GPU mode
            HypercubeNeo.autoRender(engine, canvas, {
                faceIndex: smokeIdx,
                colormap: 'arctic',
                minVal: 0.0,
                maxVal: 1.0,
                obstaclesFace: obsIdx,
                vorticityFace: vortIdx
            });

            // Update FPS
            frameCount++;
            const now = performance.now();
            if (now - lastTime >= 1000) {
                if (fpsElem) fpsElem.innerText = `${frameCount} FPS`;
                frameCount = 0;
                lastTime = now;
            }

            requestAnimationFrame(loop);
        } catch (e) {
            console.error("Simulation loop error:", e);
        }
    }

    loop();
}

main().catch(console.error);
