import { HypercubeNeoFactory } from '../core/HypercubeNeoFactory';
import { WebGpuRendererNeo } from '../io/WebGpuRendererNeo';
import { BenchmarkHUD } from '../../examples/shared/BenchmarkHUD';

async function main() {
    const resManifest = await fetch('./showcase-heat-gpu.json?v=' + Date.now());
    const manifest = await resManifest.json();

    const factory = new HypercubeNeoFactory();
    const engine = await factory.build(manifest.config, manifest.engine);

    // IA Observability (Web MCP)
    const { DebugBridge } = await import('../helpers/DebugBridge');
    DebugBridge.setup(engine, manifest.config);

    // Resolve stable logical face indices (do NOT use getFaceIndices().read here,
    // WebGpuRendererNeo.render() calls parityManager internally via getPhysicalSlot)
    const tempFaceIdx = engine.getFaceLogicalIndex('temperature');
    const obsFaceIdx  = engine.getFaceLogicalIndex('obstacles');

    // Setup Canvas
    const container = document.getElementById('canvas-container')!;
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    container.appendChild(canvas);

    const hud = new BenchmarkHUD('Neo Heat Diffusion (GPU)', '512x256');
    const renderer = new WebGpuRendererNeo(canvas);

    let frame = 0;

    const render = async () => {
        frame++;

        // "WOW" MOTION: Two orbiting heat sources + mobile cooling disk
        const t1 = frame * 0.03;
        const t2 = frame * 0.02 + Math.PI;
        const obsX = 256 + Math.sin(frame * 0.01) * 120;

        // Objects are sent as GPU uniforms via GpuDispatcher.
        // Cache the objects array to avoid expensive allocation if not changed
        const currentObjects = [
            {
                id: 'heat_eater',
                type: 'circle',
                position: { x: obsX - 25, y: 128 - 25 },
                dimensions: { w: 50, h: 50 },
                properties: { obstacles: 1.0, temperature: 0.0 }
            },
            {
                id: 'source_1',
                type: 'circle',
                position: { x: 256 + Math.cos(t1) * 140 - 12, y: 128 + Math.sin(t1 * 1.5) * 80 - 12 },
                dimensions: { w: 24, h: 24 },
                properties: { obstacles: 0.0, temperature: 4.0 }
            },
            {
                id: 'source_2',
                type: 'circle',
                position: { x: 256 + Math.cos(t2) * 100 - 8, y: 128 + Math.sin(t2 * 2.1) * 110 - 8 },
                dimensions: { w: 16, h: 16 },
                properties: { obstacles: 0.0, temperature: 3.0 }
            }
        ];

        (engine.vGrid as any).config.objects = currentObjects;

        // Compute step (single iteration per render frame)
        await engine.step(1);

        // Render from GPU — use LOGICAL face indices, not physical slots
        renderer.render(engine as any, {
            faceIndex: tempFaceIdx,
            colormap: 'heatmap',
            minVal: 0,
            maxVal: 3.5,
            obstaclesFace: obsFaceIdx
        });

        hud.tickFrame();
        requestAnimationFrame(render);
    };

    render();
    console.log("Neo Heat GPU Showcase Running 🚀");
}

main().catch(err => console.error(err));
