import { IKernel } from './IKernel';
import { NumericalScheme } from '../types';

/**
 * LBMMacroKernel
 * Aggregates LBM populations into macroscopic properties:
 * - Density (rho)
 * - Velocity (vx, vy)
 * - Vorticity (curl)
 */
export class LBMMacroKernel implements IKernel {
    private readonly cx = [0, 1, 0, -1, 0, 1, -1, -1, 1];
    private readonly cy = [0, 0, 1, 0, -1, 1, 1, -1, -1];

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

        const fIdxs = [
            indices['f0'], indices['f1'], indices['f2'], indices['f3'], indices['f4'],
            indices['f5'], indices['f6'], indices['f7'], indices['f8']
        ];

        // LBM populations should be read from the NEWLY UPDATED write buffer 
        // if this kernel runs after LBMKernel in the same step.
        // Actually, NumericalDispatcher always prepares indices.
        // If they are ping-pong, indices.write is the evolved state.

        const f_in = fIdxs.map(idx => views[idx.write]);

        const rhoFace = indices['density']?.write;
        const vxFace = indices['vx']?.write;
        const vyFace = indices['vy']?.write;
        const curlFace = indices['vorticity']?.write;

        const den = rhoFace !== undefined ? views[rhoFace] : null;
        const vx = vxFace !== undefined ? views[vxFace] : null;
        const vy = vyFace !== undefined ? views[vyFace] : null;
        const curl = curlFace !== undefined ? views[curlFace] : null;

        for (let py = padding; py < ny + padding; py++) {
            for (let px = padding; px < nx + padding; px++) {
                const idx = py * pNx + px;

                let r = 0;
                let ux = 0;
                let uy = 0;

                for (let k = 0; k < 9; k++) {
                    const f = f_in[k][idx];
                    r += f;
                    ux += this.cx[k] * f;
                    uy += this.cy[k] * f;
                }

                if (r > 0) {
                    ux /= r;
                    uy /= r;
                }

                if (den) den[idx] = r;
                if (vx) vx[idx] = ux;
                if (vy) vy[idx] = uy;

                // Vorticity calculation if requested
                if (curl && vx && vy) {
                    // Central difference across 2 neighbors
                    const dux_dy = (vx[idx + pNx] - vx[idx - pNx]) * 0.5;
                    const duy_dx = (vy[idx + 1] - vy[idx - 1]) * 0.5;
                    curl[idx] = duy_dx - dux_dy;
                }
            }
        }
    }
}
