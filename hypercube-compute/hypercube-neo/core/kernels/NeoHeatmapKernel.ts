import { IKernel } from './IKernel';
import { NumericalScheme, HypercubeConfig } from '../types';
import { VirtualChunk } from '../GridAbstractions';

export class NeoHeatmapKernel implements IKernel {
    public static readonly DEFAULT_DIFFUSION = 0.25;
    public static readonly DEFAULT_DECAY = 0.99;

    execute(
        views: Float32Array[],
        scheme: NumericalScheme,
        indices: Record<string, { read: number; write: number }>,
        gridConfig: HypercubeConfig,
        chunk: VirtualChunk
    ): void {
        const nx = chunk.localDimensions.nx;
        const ny = chunk.localDimensions.ny;
        const padding = gridConfig.padding ?? 1;

        let maxNx = 0;
        let maxNy = 0;
        if ((gridConfig as any).maxDimensions) {
            maxNx = (gridConfig as any).maxDimensions.nx;
            maxNy = (gridConfig as any).maxDimensions.ny;
        } else {
            maxNx = Math.ceil(gridConfig.dimensions.nx / gridConfig.chunks.x);
            maxNy = Math.ceil(gridConfig.dimensions.ny / gridConfig.chunks.y);
        }
        const pNx = maxNx + 2 * padding;
        const pNy = maxNy + 2 * padding;

        const dt = scheme.params?.diffusion_rate ?? NeoHeatmapKernel.DEFAULT_DIFFUSION;
        const decay = scheme.params?.decay_factor ?? NeoHeatmapKernel.DEFAULT_DECAY;

        const uRead = views[indices[scheme.source].read];
        const uWrite = views[indices[scheme.source].write];
        
        // Fix: Do not fallback obstacles to uRead, as it would treat data as walls!
        const obstacles = indices['obstacles'] ? views[indices['obstacles'].read] : null;
        const injectionFaceName = scheme.params?.injection_face ?? 'injection_mask';
        const injection = indices[injectionFaceName] ? views[indices[injectionFaceName].read] : null;

        for (let py = padding; py < ny + padding; py++) {
            for (let px = padding; px < nx + padding; px++) {
                const i = py * pNx + px;

                // 1. Is it a Wall?
                if (obstacles && obstacles[i] > 0.5) {
                    uWrite[i] = 0;
                    continue;
                }

                // 2. Continuous Injection (Radiators)
                if (injection && injection[i] > 0) {
                    uWrite[i] = injection[i]; // Thermostat override
                    continue;
                }

                // 3. Diffusion from Neighbors (Laplacian Stencil)
                // Harmonized with GPU: We don't skip obstacles, allowing heat to diffuse INTO them (eraser effect)
                const laplacian = (
                    uRead[i - pNx] + uRead[i + pNx] + uRead[i + 1] + uRead[i - 1]
                ) - 4 * uRead[i];
                
                const uc = uRead[i] as number;
                let newU = uc + (dt as number) * laplacian;

                // 4. Thermodynamic Decay
                newU *= (decay as number);

                uWrite[i] = Math.max(0, newU);
            }
        }
    }
}
