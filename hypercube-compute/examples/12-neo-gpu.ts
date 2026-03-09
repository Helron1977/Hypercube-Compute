import { HypercubeNeoFactory } from '../hypercube-neo/core/HypercubeNeoFactory';
import { WebGpuRenderer } from '../src/io/WebGpuRenderer';
import { NacaHelper } from '../hypercube-neo/helpers/ShapeHelpers';

/**
 * Showcase: Neo LBM Aerodynamics GPU (Architecture v4)
 */
async function main() {
    const canvas = document.getElementById('display') as HTMLCanvasElement;
    if (!canvas) return;

    const factory = new HypercubeNeoFactory();
    const wingPoints = NacaHelper.generateNaca4(0.00, 0.0, 0.16, 80, 120, -12 * Math.PI / 180);

    const manifest = await factory.fromManifest('showcase-aero-gpu.json');
    const { config, engine: descriptor } = manifest;

    const wingTop = config.objects?.find((o: any) => o.id === 'wing_top');
    if (wingTop) wingTop.points = wingPoints;
    const wingBottom = config.objects?.find((o: any) => o.id === 'wing_bottom');
    if (wingBottom) wingBottom.points = wingPoints;

    const engine = await factory.build(config, descriptor);
    const renderer = new WebGpuRenderer(canvas);

    const NX = config.dimensions.nx;
    const NY = config.dimensions.ny;

    // HUD Elements
    const fpsElem = document.getElementById('fps');
    const resElem = document.getElementById('resolution');
    const chunksElem = document.getElementById('chunks');

    if (resElem) resElem.innerText = `Res: ${NX}x${NY}`;
    if (chunksElem) chunksElem.innerText = `Chunks: ${config.chunks.x * (config.chunks.y || 1)}`;

    // Set canvas to simulation resolution (V4 standard)
    canvas.width = NX;
    canvas.height = NY;

    let isInitialized = false;
    let frameCount = 0;
    let lastTime = performance.now();

    async function loop() {
        try {
            await engine.step(1);

            if (!isInitialized) {
                if (config.objects && config.objects[0].id === 'grid_init') {
                    config.objects.shift();
                    isInitialized = true;
                }
            }

            const smokeIdx = engine.parityManager.getFaceIndices('smoke').read;
            const obsIdx = engine.parityManager.getFaceIndices('obstacles').read;
            const vortIdx = engine.parityManager.getFaceIndices('vorticity').read;

            renderer.renderNeo(engine, {
                faceIndex: smokeIdx,
                colormap: 'arctic',
                minVal: 0.0,
                maxVal: 1.0,
                obstaclesFace: obsIdx,
                vorticityFace: vortIdx
            });

            // Update HUD
            frameCount++;
            const now = performance.now();
            if (now - lastTime >= 1000) {
                if (fpsElem) fpsElem.innerText = `FPS: ${frameCount}`;
                frameCount = 0;
                lastTime = now;
            }

            requestAnimationFrame(loop);
        } catch (e) {
            console.error("Showcase GPU loop error:", e);
        }
    }

    loop();
}

main().catch(console.error);
