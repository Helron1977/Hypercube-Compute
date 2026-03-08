import { NeoEngineProxy } from './core/NeoEngineProxy';
import { CanvasAdapterNeo, RenderOptions } from './io/CanvasAdapterNeo';

/**
 * HypercubeNeo: The parallel fork of the main facade for Neo engines.
 * Provides a clean entry point for orchestration and visualization 
 * without modifying the legacy 'src' folder.
 */
export class HypercubeNeo {

    /**
     * Higher-level visualization helper.
     * Automatically handles multi-chunk data assembly and colormapping.
     */
    static autoRender(
        neo: NeoEngineProxy,
        canvas: HTMLCanvasElement,
        options: RenderOptions
    ): void {
        CanvasAdapterNeo.render(neo, canvas, options);
    }

    /**
     * Future: Add stats collection or other Neo-specific high-level features here.
     */
}
