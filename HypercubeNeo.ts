import { NeoEngineProxy } from './core/NeoEngineProxy';
import { CanvasAdapterNeo, RenderOptions } from './io/CanvasAdapterNeo';
import { WebGpuRendererNeo } from './io/WebGpuRendererNeo';

/**
 * HypercubeNeo: The parallel fork of the main facade for Neo engines.
 * Provides a clean entry point for orchestration and visualization 
 * without modifying the legacy 'src' folder.
 */
export class HypercubeNeo {
    private static gpuRenderers: Map<HTMLCanvasElement, WebGpuRendererNeo> = new Map();

    /**
     * Higher-level visualization helper.
     * Automatically handles multi-chunk data assembly and colormapping.
     * Switches between CPU and GPU native rendering based on the engine mode.
     */
    static autoRender(
        neo: NeoEngineProxy,
        canvas: HTMLCanvasElement,
        options: RenderOptions
    ): void {
        const isGpu = (neo.vGrid as any).config.mode === 'gpu';

        if (isGpu) {
            let renderer = this.gpuRenderers.get(canvas);
            if (!renderer) {
                renderer = new WebGpuRendererNeo(canvas);
                this.gpuRenderers.set(canvas, renderer);
            }
            renderer.render(neo, options as any);
        } else {
            CanvasAdapterNeo.render(neo, canvas, options);
        }
    }

    /**
     * Future: Add stats collection or other Neo-specific high-level features here.
     */
}
