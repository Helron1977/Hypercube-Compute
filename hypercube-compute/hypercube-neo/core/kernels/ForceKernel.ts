import { IKernel } from './IKernel';
import { NumericalScheme } from '../types';
import { VirtualChunk } from '../GridAbstractions';

/**
 * Kernel for adding Forces (Gravitational, Buoyancy, etc.).
 */
export class ForceKernel implements IKernel {
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

        const multiplier = (scheme.params?.multiplier as number) || 1.0;
        const dt = (scheme.params?.dt as number) || 0.1;

        for (let py = padding; py < ny + padding; py++) {
            for (let px = padding; px < nx + padding; px++) {
                const idx = py * pNx + px;

                let s = src[idx];
                let d = dst[idx];

                // Safety: Protect against Non-Finite values
                if (!Number.isFinite(s)) s = 0;
                if (!Number.isFinite(d)) d = 0;

                const delta = s * multiplier * dt;

                // Accumulate safely
                if (Number.isFinite(delta)) {
                    dst[idx] = d + delta;
                }
            }
        }
    }
}
