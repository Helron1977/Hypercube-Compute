import { NumericalScheme } from '../types';
import { VirtualChunk } from '../GridAbstractions';

/**
 * Interface for a numerical operator (Kernel).
 * A kernel handles a specific type of computation (e.g., Diffusion, Advection).
 */
export interface IKernel {
    /**
     * Executes the numerical operation on a set of physical views.
     * @param views Raw Float32Arrays for the chunk.
     * @param scheme The declarative scheme from the engine descriptor.
     * @param indices Mapping of face names to their current read/write indices.
     * @param gridConfig Global configuration (nx, ny, etc.)
     * @param chunk The virtual chunk being processed.
     */
    execute(
        views: Float32Array[],
        scheme: NumericalScheme,
        indices: Record<string, { read: number; write: number }>,
        gridConfig: any,
        chunk: VirtualChunk
    ): void;
}
