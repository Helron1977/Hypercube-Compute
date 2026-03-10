import { KernelRegistry } from './KernelRegistry';
import { LBMSmokeKernel } from './LBMSmokeKernel';
import { DiffusionKernel } from './DiffusionKernel';
import { AdvectionKernel } from './AdvectionKernel';
import { ForceKernel } from './ForceKernel';
import { LBMD2Q9Kernel } from './LBMKernel';
import { LBMMacroKernel } from './LBMMacroKernel';
import { NeoAeroKernel } from './NeoAeroKernel';
import { NeoOceanKernel } from './NeoOceanKernel';

/**
 * Initializes the default set of CPU kernels for the Hypercube Neo engine.
 * These are the standard "rules" available in manifests.
 */
export function initializeKernels(): void {
    KernelRegistry.register('diffusion', new DiffusionKernel());
    KernelRegistry.register('advection', new AdvectionKernel());
    KernelRegistry.register('force', new ForceKernel());
    KernelRegistry.register('lbm-d2q9', new LBMD2Q9Kernel());
    KernelRegistry.register('lbm-macro', new LBMMacroKernel());
    KernelRegistry.register('lbm-smoke', new LBMSmokeKernel());
    KernelRegistry.register('lbm-aero-fidelity-v1', new NeoAeroKernel());
    KernelRegistry.register('lbm-ocean-v1', new NeoOceanKernel());
}
