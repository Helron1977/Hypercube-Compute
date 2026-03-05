import { HypercubeMasterBuffer } from './HypercubeMasterBuffer';
import { HypercubeChunk } from './HypercubeChunk';
import type { IHypercubeEngine } from '../engines/IHypercubeEngine';
import { HypercubeGPUContext } from './gpu/HypercubeGPUContext';

/**
 * HypercubeGpuGrid manages the WebGPU dispatch pipeline.
 * Unlike CPU Multithreading which chunks data per core, WebGPU prefers massive uniform arrays.
 * This Grid delegates ComputeEncoder dispatch to the engines.
 */
export class HypercubeGpuGrid {
    public cubes: (HypercubeChunk | null)[][] = [];
    public readonly cols: number;
    public readonly rows: number;
    public readonly nx: number;
    public readonly ny: number;
    public readonly nz: number;
    public masterBuffer: HypercubeMasterBuffer;

    public stats = {
        computeTimeMs: 0,
        syncTimeMs: 0
    };

    constructor(
        cols: number,
        rows: number,
        resolution: number | { nx: number, ny: number, nz?: number },
        masterBuffer: HypercubeMasterBuffer,
        engineFactory: () => IHypercubeEngine,
        numFaces: number = 6
    ) {
        this.cols = cols;
        this.rows = rows;

        if (typeof resolution === 'number') {
            this.nx = resolution;
            this.ny = resolution;
            this.nz = 1;
        } else {
            this.nx = resolution.nx;
            this.ny = resolution.ny;
            this.nz = resolution.nz ?? 1;
        }

        this.masterBuffer = masterBuffer;

        const tempEngine = engineFactory();
        const requiredFaces = tempEngine.getRequiredFaces();
        const finalNumFaces = Math.max(numFaces, requiredFaces);

        // Allocate cubes structurally but GPU memory logic handles them as unified 
        for (let y = 0; y < rows; y++) {
            this.cubes[y] = [];
            for (let x = 0; x < cols; x++) {
                const cube = new HypercubeChunk(x, y, this.nx, this.ny, this.nz, masterBuffer, finalNumFaces);
                const engineInstance = y === 0 && x === 0 ? tempEngine : engineFactory();
                cube.setEngine(engineInstance);
                // We do NOT init CPU arrays because GPU mode works directly on VRAM later.
                this.cubes[y][x] = cube;
            }
        }
    }

    /**
     * Instantiates the GPU Context and compiles the shader pipelines.
     */
    static async create(
        cols: number,
        rows: number,
        resolution: number | { nx: number, ny: number, nz?: number },
        masterBuffer: HypercubeMasterBuffer,
        engineFactory: () => IHypercubeEngine,
        numFaces: number = 6
    ): Promise<HypercubeGpuGrid> {

        const success = await HypercubeGPUContext.init();
        if (!success) {
            throw new Error("[HypercubeGpuGrid] Impossible to initialize WebGPU Context. Hardware unsupported.");
        }

        const grid = new HypercubeGpuGrid(cols, rows, resolution, masterBuffer, engineFactory, numFaces);

        for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
                grid.cubes[y][x]?.initGPU();
            }
        }

        return grid;
    }

    /**
     * Submits a CommandEncoder queue for GPU compute shaders.
     */
    async compute() {
        const start = performance.now();
        const commandEncoder = HypercubeGPUContext.device.createCommandEncoder();

        for (let y = 0; y < this.rows; y++) {
            for (let x = 0; x < this.cols; x++) {
                const cube = this.cubes[y][x];
                if (cube && cube.engine && cube.engine.computeGPU) {
                    // Dispatch the GPU pipeline
                    cube.engine.computeGPU(HypercubeGPUContext.device, commandEncoder, cube.nx, cube.ny, cube.nz);
                }
            }
        }

        // Send to GPU queue
        HypercubeGPUContext.device.queue.submit([commandEncoder.finish()]);

        // Await GPU ? Actually, WebGPU queue submission is asynchronous but we might want device.queue.onSubmittedWorkDone()
        // Here we just record the submission time.
        this.stats.computeTimeMs = performance.now() - start;
        this.stats.syncTimeMs = 0; // GPU manages its own memory
    }

    public destroy() {
        if (HypercubeGPUContext.device) {
            HypercubeGPUContext.device.destroy();
        }
    }
}
