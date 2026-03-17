import { IKernel } from './IKernel';
import { NumericalScheme, HypercubeConfig } from '../types';
import { VirtualChunk } from '../topology/GridAbstractions';

/**
 * NeoLifeKernel: Implementation of Conway's Game of Life (B3/S23).
 * Uses a 3x3 stencil on a ping-pong face.
 */
export class NeoLifeKernel implements IKernel {
    execute(
        views: Float32Array[],
        scheme: NumericalScheme,
        indices: Record<string, { read: number; write: number }>,
        gridConfig: HypercubeConfig,
        chunk: VirtualChunk
    ): void {
        const nx = Math.floor(gridConfig.dimensions.nx / gridConfig.chunks.x);
        const ny = Math.floor(gridConfig.dimensions.ny / gridConfig.chunks.y);
        const padding = 1;
        const pNx = nx + 2 * padding;
        const pNy = ny + 2 * padding;

        const cellsFace = indices['cells'] || indices[scheme.source] || Object.values(indices)[0];
        const uRead = views[cellsFace.read];
        const uWrite = views[cellsFace.write];

        for (let py = 1; py < pNy - 1; py++) {
            for (let px = 1; px < pNx - 1; px++) {
                const i = py * pNx + px;
                
                // Count 8 neighbors
                let neighbors = 0;
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        if (dx === 0 && dy === 0) continue;
                        if (uRead[(py + dy) * pNx + (px + dx)] > 0.5) {
                            neighbors++;
                        }
                    }
                }

                const alive = uRead[i] > 0.5;
                if (alive) {
                    // Survival: 2 or 3 neighbors
                    uWrite[i] = (neighbors === 2 || neighbors === 3) ? 1.0 : 0.0;
                } else {
                    // Birth: exactly 3 neighbors
                    uWrite[i] = (neighbors === 3) ? 1.0 : 0.0;
                }
            }
        }
    }
}
