import { GpuKernelRegistry } from './GpuKernelRegistry';

// @ts-ignore
import NeoAeroSource from './wgsl/NeoAero.wgsl?raw';

/**
 * Initializes the GPU compute kernels for Hypercube Neo.
 */
export function initializeGpuKernels(): void {
    GpuKernelRegistry.setSource('lbm-aero-fidelity-v1', NeoAeroSource);
}
