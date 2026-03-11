import { IKernel } from './IKernel';
import { NumericalScheme, HypercubeConfig } from '../types';
import { VirtualChunk } from '../GridAbstractions';

export class NeoSDFKernel implements IKernel {
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

        const uReadX = views[indices[scheme.source + '_x'].read];
        const uReadY = views[indices[scheme.source + '_y'].read];
        const uWriteX = views[indices[scheme.source + '_x'].write];
        const uWriteY = views[indices[scheme.source + '_y'].write];
        // Ensure obstacles block the distance propagation!
        const obstacles = indices['obstacles'] ? views[indices['obstacles'].read] : null;

        const chunkGlobalOffsetX = chunk.x * nx;
        const chunkGlobalOffsetY = chunk.y * ny;

        const distSq = (x1: number, y1: number, x2: number, y2: number) => {
            if (x2 < -9000 || y2 < -9000) return 999999999; // Invalid seed
            const dx = x1 - x2;
            const dy = y1 - y2;
            return dx * dx + dy * dy;
        };

        for (let py = 1; py < pNy - 1; py++) {
            for (let px = 1; px < pNx - 1; px++) {
                const i = py * pNx + px;

                // 1. Is it an obstacle? Obstacles block propagation completely.
                if (obstacles && obstacles[i] > 0.5) {
                    uWriteX[i] = -10000;
                    uWriteY[i] = -10000;
                    continue;
                }

                const gX = chunkGlobalOffsetX + (px - 1);
                const gY = chunkGlobalOffsetY + (py - 1);

                let bestX = uReadX[i];
                let bestY = uReadY[i];
                let bestDist = distSq(gX, gY, bestX, bestY);

                // 2. Check 8-Neighbors for a closer seed coordinate.
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        if (dx === 0 && dy === 0) continue;
                        const ni = (py + dy) * pNx + (px + dx);

                        // Don't read across obstacles (Ray-bending / Maze effect)
                        if (obstacles && obstacles[ni] > 0.5) continue;

                        const seedX = uReadX[ni];
                        const seedY = uReadY[ni];
                        const d = distSq(gX, gY, seedX, seedY);

                        if (d < bestDist) {
                            bestDist = d;
                            bestX = seedX;
                            bestY = seedY;
                        }
                    }
                }

                uWriteX[i] = bestX;
                uWriteY[i] = bestY;
            }
        }
    }
}
