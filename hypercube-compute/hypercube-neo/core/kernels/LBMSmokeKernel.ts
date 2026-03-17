import { IKernel } from './IKernel';
import { NumericalScheme } from '../types';

/**
 * LBMSmokeKernel
 * Advects a passive scalar (smoke) using the macroscopic velocity field.
 * Includes slight diffusion and dissipation for visual stability.
 */
export class LBMSmokeKernel implements IKernel {
    public execute(
        views: Float32Array[],
        scheme: NumericalScheme,
        indices: Record<string, { read: number; write: number }>,
        gridConfig: any
    ): void {
        const nx = Math.floor(gridConfig.dimensions.nx / gridConfig.chunks.x);
        const ny = Math.floor(gridConfig.dimensions.ny / gridConfig.chunks.y);
        const padding = gridConfig.padding ?? 1;
        const pNx = nx + 2 * padding;

        const smokeInIdx = indices['smoke'].read;
        const smokeOutIdx = indices['smoke'].write;
        const vxIdx = indices['vx'].write; // Use the updated velocity
        const vyIdx = indices['vy'].write;

        const sIn = views[smokeInIdx];
        const sOut = views[smokeOutIdx];
        const vx = views[vxIdx];
        const vy = views[vyIdx];

        const dissipation = (scheme.params?.dissipation as number) || 0.9995;
        const diffAlpha = (scheme.params?.diffusion as number) || 0.005;

        for (let py = padding; py < ny + padding; py++) {
            for (let px = padding; px < nx + padding; px++) {
                const idx = py * pNx + px;

                const ux = vx[idx];
                const uy = vy[idx];

                // Back-tracing position
                const sx = px - ux;
                const sy = py - uy;

                // Bilinear Interpolation
                const x0 = Math.floor(sx);
                const y0 = Math.floor(sy);
                const x1 = x0 + 1;
                const y1 = y0 + 1;
                const fx = sx - x0;
                const fy = sy - y0;

                let sample = 0;
                // Bounds check (including padding)
                if (x0 >= 0 && x1 < pNx && y0 >= 0 && y1 < (ny + 2 * padding)) {
                    const v00 = sIn[y0 * pNx + x0];
                    const v10 = sIn[y0 * pNx + x1];
                    const v01 = sIn[y1 * pNx + x0];
                    const v11 = sIn[y1 * pNx + x1];
                    sample = (v00 * (1 - fx) + v10 * fx) * (1 - fy) + (v01 * (1 - fx) + v11 * fx) * fy;
                }

                // Slight neighborhood average for diffusion
                const avg = (sIn[idx - 1] + sIn[idx + 1] + sIn[idx - pNx] + sIn[idx + pNx]) * 0.25;

                sOut[idx] = (sample * (1 - diffAlpha) + avg * diffAlpha) * dissipation;
            }
        }
    }
}
