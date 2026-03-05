import { HypercubeCpuGrid } from './core/HypercubeCpuGrid';
import { HypercubeMasterBuffer } from './core/HypercubeMasterBuffer';
import { EngineRegistry } from './core/EngineRegistry';

export interface HypercubeConfig {
    engine: string;
    resolution: number | { nx: number, ny: number, nz?: number };
    cols?: number;
    rows?: number;
    workers?: boolean;
    workerScript?: string;
    periodic?: boolean;
}

/**
 * Hypercube V5 - High Level Facade
 * The easiest way to start a simulation.
 */
export class Hypercube {
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

        // Bootstrap Grid
        return await HypercubeCpuGrid.create(
            cols, rows,
            config.resolution,
            masterBuffer,
            () => EngineRegistry.create(config.engine),
            numFaces,
            config.periodic ?? true,
            config.workers ?? true,
            config.workerScript
        );
    }
}
