import { IKernel } from './IKernel';
import { NumericalScheme, HypercubeConfig } from '../types';
import { VirtualChunk } from '../topology/GridAbstractions';

/**
 * NeoPathKernel: Wavefront propagation for pathfinding.
 * Similar to Dijkstra or Breadth-First Search on a grid.
 */
export class NeoPathKernel implements IKernel {
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

        const distFace = indices['distance'] || indices[scheme.source] || Object.values(indices)[0];
        const obsFace = indices['obstacles'];

        const uRead = views[distFace.read];
        const uWrite = views[distFace.write];
        const obstacles = obsFace ? views[obsFace.read] : null;

        for (let py = 1; py < pNy - 1; py++) {
            for (let px = 1; px < pNx - 1; px++) {
                const i = py * pNx + px;

                if (obstacles && obstacles[i] > 0.5) {
                    uWrite[i] = 1e9; // Wall
                    continue;
                }

                let minNeighborDist = uRead[i];

                // Check 4 cardinal neighbors
                const neighbors = [
                    (py - 1) * pNx + px,
                    (py + 1) * pNx + px,
                    py * pNx + (px - 1),
                    py * pNx + (px + 1)
                ];

                for (const ni of neighbors) {
                    const d = uRead[ni] + 1.0;
                    if (d < minNeighborDist) {
                        minNeighborDist = d;
                    }
                }

                uWrite[i] = minNeighborDist;
            }
        }
    }
}
