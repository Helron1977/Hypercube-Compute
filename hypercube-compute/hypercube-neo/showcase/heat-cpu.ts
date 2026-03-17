import { HypercubeNeoFactory } from '../core/HypercubeNeoFactory';
import { CanvasAdapterNeo } from '../io/CanvasAdapterNeo';
import { BenchmarkHUD } from '../../examples/shared/BenchmarkHUD';

async function main() {
    const resManifest = await fetch('./showcase-heat-cpu.json?v=' + Date.now());
    const manifest = await resManifest.json();

    const factory = new HypercubeNeoFactory();
    const engine = await factory.build(manifest.config, manifest.engine);

    // Resolve stable logical face indices
    const tempFaceIdx = engine.getFaceLogicalIndex('temperature');
    const obsFaceIdx  = engine.getFaceLogicalIndex('obstacles');

    // Setup Canvas
    const container = document.getElementById('canvas-container')!;
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    container.appendChild(canvas);

    const hud = new BenchmarkHUD('Neo Heat Diffusion (CPU)', '512x256');

    let frame = 0;

    const render = async () => {
        frame++;

        // MOTION: Two orbiting heat sources + mobile cooling disk
        const t1 = frame * 0.03;
        const t2 = frame * 0.02 + Math.PI;
        const obsX = 256 + Math.sin(frame * 0.01) * 120;

        // CPU path: objects are rasterized by ObjectRasterizer into the physical buffer.
        // Property names MUST match face names in the descriptor ('temperature', 'obstacles').
        (engine.vGrid as any).config.objects = [
            {
                id: 'heat_eater',
                type: 'circle',
                position: { x: obsX - 25, y: 128 - 25 },
                dimensions: { w: 50, h: 50 },
                properties: {
                    obstacles: 1.0,
                    temperature: 0.0
                }
            },
            {
                id: 'source_1',
                type: 'circle',
                position: { x: 256 + Math.cos(t1) * 140 - 12, y: 128 + Math.sin(t1 * 1.5) * 80 - 12 },
                dimensions: { w: 24, h: 24 },
                properties: {
                    temperature: 4.0
                }
            },
            {
                id: 'source_2',
                type: 'circle',
                position: { x: 256 + Math.cos(t2) * 100 - 8, y: 128 + Math.sin(t2 * 2.1) * 110 - 8 },
                dimensions: { w: 16, h: 16 },
                properties: {
                    temperature: 3.0
                }
            }
        ];

        // Compute step (single iteration per render frame)
        await engine.step(1);

        // Render — pass LOGICAL face indices, CanvasAdapterNeo resolves physical slots
        CanvasAdapterNeo.render(engine as any, canvas, {
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
    console.log("Neo Heat CPU Showcase Running ☕🌍");
}

main().catch(err => console.error(err));
