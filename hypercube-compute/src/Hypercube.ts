import { HypercubeCpuGrid } from './core/HypercubeCpuGrid';
import { HypercubeMasterBuffer } from './core/HypercubeMasterBuffer';
import { EngineRegistry } from './core/EngineRegistry';
import { CanvasAdapter } from './io/CanvasAdapter';
import { WebGpuRenderer } from './io/WebGpuRenderer';
import { HypercubeIsoRenderer } from './utils/HypercubeIsoRenderer';
import { HypercubeGPUContext } from './core/gpu/HypercubeGPUContext';
import { HypercubeChunk } from './core/HypercubeChunk';
import { HypercubeGpuVolumeRenderer } from './io/HypercubeGpuVolumeRenderer';
import type { IHypercubeEngine } from './engines/IHypercubeEngine';

export interface HypercubeConfig {
    engine: string;
    mode?: 'auto' | 'cpu' | 'gpu';
    resolution: number | { nx: number, ny: number, nz?: number };
    cols?: number;
    rows?: number;
    workers?: boolean;
    workerScript?: string;
    periodic?: boolean;
    params?: Record<string, any>;
}

/**
 * Hypercube V5 - High Level Facade
 * The easiest way to start a simulation.
 */
export class Hypercube {
    private masterBuffer: HypercubeMasterBuffer;

    constructor(initialMemoryMB: number = 100) {
        this.masterBuffer = new HypercubeMasterBuffer(initialMemoryMB * 1024 * 1024);
    }

    /**
     * Legacy helper for tests. Creates a single chunk grid.
     */
    public createCube(
        id: string,
        res: { nx: number, ny: number, nz?: number },
        engine: IHypercubeEngine,
        numFaces: number = 6
    ): HypercubeChunk {
        const nx = res.nx;
        const ny = res.ny;
        const nz = res.nz ?? 1;
        const chunk = new HypercubeChunk(0, 0, nx, ny, nz, this.masterBuffer, numFaces);
        chunk.setEngine(engine);
        engine.init(chunk.faces, nx, ny, nz, false);
        return chunk;
    }

    /**
     * Creates and initializes a complete simulation grid.
     */
    public static async create(config: HypercubeConfig): Promise<HypercubeCpuGrid> {
        const cols = config.cols ?? 1;
        const rows = config.rows ?? 1;
        const res = typeof config.resolution === 'number' ? config.resolution : config.resolution.nx;

        // Auto-instantiate engine to get metadata
        const tempEngine = EngineRegistry.create(config.engine);
        const numFaces = tempEngine.getRequiredFaces();

        // Calculate dimensions
        let nx = 0, ny = 0, nz = 1;
        if (typeof config.resolution === 'number') {
            nx = ny = config.resolution;
        } else {
            nx = config.resolution.nx;
            ny = config.resolution.ny;
            nz = config.resolution.nz ?? 1;
        }

        // Auto-allocate MasterBuffer
        const totalCellsPerChunk = nx * ny * nz;
        const bytesNeeded = totalCellsPerChunk * numFaces * 4 * cols * rows + 4096;
        const masterBuffer = new HypercubeMasterBuffer(bytesNeeded);

        // Resolve Mode (Auto / CPU / GPU)
        let resolvedMode: 'cpu' | 'gpu' = config.mode === 'gpu' ? 'gpu' : 'cpu';
        if (config.mode === 'auto' || config.mode === 'gpu') {
            const gpuAvailable = await HypercubeGPUContext.init();
            if (gpuAvailable) {
                resolvedMode = 'gpu';
            } else if (config.mode === 'gpu') {
                throw new Error("WebGPU is not supported on this device/browser, but mode was forced to 'gpu'.");
            } else {
                console.info("[Hypercube] WebGPU unavailable. Falling back to CPU mode.");
                resolvedMode = 'cpu';
            }
        }

        // Bootstrap Grid
        const grid = await HypercubeCpuGrid.create(
            cols, rows,
            config.resolution,
            masterBuffer,
            () => EngineRegistry.create(config.engine, config.params),
            numFaces,
            config.periodic ?? true,
            config.workers ?? true,
            config.workerScript,
            resolvedMode
        );

        // Store engine name for auto-rendering
        (grid as any)._engineName = config.engine;
        return grid;
    }

    /**
     * High-level rendering helper. 
     * Automatically chooses the best renderer (2D or Iso) for the given grid.
     */
    public static autoRender(grid: HypercubeCpuGrid, canvas: HTMLCanvasElement, options: any = {}) {
        const firstChunk = grid.cubes[0][0];
        const engine = firstChunk?.engine;
        const tags = (engine as any)?.getTags ? (engine as any).getTags() : [];
        const currentParity = (engine as any)?.parity ?? 0;
        const smokeFace = 22 + currentParity;
        const isIso = tags.includes('iso') || tags.includes('2.5d') || options.mode === 'isometric';

        if (isIso && grid.mode === 'cpu') {
            // Iso Render
            if (!(grid as any)._renderer || !((grid as any)._renderer instanceof HypercubeIsoRenderer)) {
                (grid as any)._renderer = new HypercubeIsoRenderer(canvas, undefined, options.scale || 4.0);
            }
            const renderer = (grid as any)._renderer as HypercubeIsoRenderer;
            renderer.clearAndSetup(options.r ?? 10, options.g ?? 20, options.b ?? 35);
            renderer.renderMultiChunkVolume(
                grid.cubes.map(r => r.map(c => c!.faces)),
                grid.nx, grid.ny, grid.cols, grid.rows,
                {
                    densityFaceIndex: options.faceIndex ?? smokeFace,
                    obstacleFaceIndex: options.obstaclesFace ?? 18
                }
            );
        } else if (grid.mode === 'gpu') {
            // Native GPU Direct Render (V6.0 - Zero-Copy)
            if (!(grid as any)._gpuRenderer) {
                (grid as any)._gpuRenderer = new HypercubeGpuVolumeRenderer(canvas);
            }
            const firstChunk = grid.cubes[0][0];
            const engine = firstChunk?.engine;
            const tags = (engine as any)?.getTags ? (engine as any).getTags() : [];
            const isIso = tags.includes('iso') || tags.includes('2.5d') || (options as any).mode === 'isometric';

            let defaultColormap: any = 'heatmap';
            if (tags.includes('arctic')) defaultColormap = 'arctic';
            if (tags.includes('ocean')) defaultColormap = 'ocean';

            const renderer = (grid as any)._gpuRenderer as HypercubeGpuVolumeRenderer;
            renderer.render(grid, {
                faceIndex: options.faceIndex ?? (tags.includes('arctic') ? smokeFace : 0),
                obstacleFaceIndex: options.obstaclesFace ?? (tags.includes('lbm') ? 18 : undefined),
                vorticityFace: options.vorticityFace ?? (tags.includes('arctic') ? 21 : undefined),
                colormap: options.colormap || defaultColormap,
                minVal: options.minVal ?? 0,
                maxVal: options.maxVal ?? (tags.includes('ocean') ? 1.5 : 1.0),
                mode: isIso ? 'isometric' : 'topdown'
            });
        } else {
            // CPU Canvas Adapter (2D or 3D slice)
            if (!(grid as any)._renderer) {
                (grid as any)._renderer = new CanvasAdapter(canvas);
            }
            const adapter = (grid as any)._renderer as CanvasAdapter;

            adapter.renderFromFaces(
                grid.cubes.map(r => r.map(c => c!.faces)),
                grid.nx, grid.ny, grid.cols, grid.rows,
                {
                    faceIndex: options.faceIndex ?? (tags.includes('arctic') ? smokeFace : 0),
                    obstaclesFace: options.obstaclesFace ?? (tags.includes('lbm') ? 18 : undefined),
                    vorticityFace: options.vorticityFace ?? (tags.includes('arctic') ? 21 : undefined),
                    colormap: options.colormap ?? (tags.includes('arctic') ? 'arctic' : (tags.includes('ocean') ? 'ocean' : 'heatmap')),
                    minVal: options.minVal ?? 0,
                    maxVal: options.maxVal ?? 1,
                    sliceZ: options.sliceZ ?? 0
                }
            );
        }
    }
}
