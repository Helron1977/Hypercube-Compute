import { IKernel } from './IKernel';
import { NumericalScheme, HypercubeConfig } from '../types';
import { VirtualChunk } from '../GridAbstractions';

export class NeoHeatmapKernel implements IKernel {
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

        const dt = scheme.params?.diffusion_rate ?? 0.25;
        const decay = scheme.params?.decay_factor ?? 0.99;

        const uRead = views[indices[scheme.source].read];
        const uWrite = views[indices[scheme.source].write];
        const obstacles = indices['obstacles'] ? views[indices['obstacles'].read] : uRead;
        const injectionFaceName = scheme.params?.injection_face ?? 'injection_mask';
        const injection = indices[injectionFaceName] ? views[indices[injectionFaceName].read] : uRead;

        for (let py = 1; py < pNy - 1; py++) {
            for (let px = 1; px < pNx - 1; px++) {
                const i = py * pNx + px;

                // 1. Is it a Wall?
                if (obstacles[i] > 0.5) {
                    uWrite[i] = 0;
                    continue;
                }

                // 2. Continuous Injection (Radiators)
                if (injection[i] > 0) {
                    uWrite[i] = injection[i]; // Thermostat override
                    continue;
                }

                // 3. Diffusion from Neighbors (Laplacian Stencil)
                let sumHeat = 0;
                let validNeighbors = 0;

                // Orthogonal only (Von Neumann neighborhood)
                if (obstacles[i - pNx] < 0.5) { sumHeat += uRead[i - pNx]; validNeighbors++; }
                if (obstacles[i + pNx] < 0.5) { sumHeat += uRead[i + pNx]; validNeighbors++; }
                if (obstacles[i + 1] < 0.5) { sumHeat += uRead[i + 1]; validNeighbors++; }
                if (obstacles[i - 1] < 0.5) { sumHeat += uRead[i - 1]; validNeighbors++; }

                const uc = uRead[i] as number;
                let newU = uc;

                if (validNeighbors > 0) {
                    const laplacian = sumHeat - validNeighbors * uc;
                    newU += (dt as number) * laplacian;
                }

                // 4. Thermodynamic Decay
                newU *= (decay as number);

                uWrite[i] = Math.max(0, newU);
            }
        }
    }
}
