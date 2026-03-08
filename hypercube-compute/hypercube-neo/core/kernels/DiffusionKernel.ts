import { IKernel } from './IKernel';
import { NumericalScheme } from '../types';
import { VirtualChunk } from '../GridAbstractions';

/**
 * Kernel for Explicit Diffusion (Explicit Euler).
 * Solves: dc/dt = alpha * Laplacian(c)
 * Features finite-value protection and numerical damping.
 */
export class DiffusionKernel implements IKernel {
    public execute(
        views: Float32Array[],
        scheme: NumericalScheme,
        indices: Record<string, { read: number; write: number }>,
        gridConfig: any,
        chunk: VirtualChunk
    ): void {
        const sourceFace = scheme.source;
        const destFace = scheme.destination || sourceFace;

        const srcIdx = indices[sourceFace].read;
        const dstIdx = indices[destFace].write;

        const src = views[srcIdx];
        const dst = views[dstIdx];

        const nx = Math.floor(gridConfig.dimensions.nx / gridConfig.chunks.x);
        const ny = Math.floor(gridConfig.dimensions.ny / gridConfig.chunks.y);
        const padding = 1;

        const pNx = nx + 2 * padding;
        const alpha = (scheme.params?.alpha as number) || 0.1;

        for (let py = padding; py < ny + padding; py++) {
            for (let px = padding; px < nx + padding; px++) {
                const idx = py * pNx + px;

                let c = src[idx];
                let n = src[idx - pNx];
                let s = src[idx + pNx];
                let e = src[idx + 1];
                let w = src[idx - 1];

                // Safety: Protect against Non-Finite values
                if (!Number.isFinite(c)) c = 0;
                if (!Number.isFinite(n)) n = c;
                if (!Number.isFinite(s)) s = c;
                if (!Number.isFinite(e)) e = c;
                if (!Number.isFinite(w)) w = c;

                // Laplacian (Energy-conserving filter)
                const laplacian = (n + s + e + w - 4 * c);

                // Update
                const delta = alpha * laplacian;

                // Final Value Safety
                if (Number.isFinite(delta)) {
                    dst[idx] += delta;
                }
            }
        }
    }
}
