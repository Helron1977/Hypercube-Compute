import { KernelRegistry } from './KernelRegistry';
import { DiffusionKernel } from './DiffusionKernel';
import { AdvectionKernel } from './AdvectionKernel';
import { ForceKernel } from './ForceKernel';
import { LBMD2Q9Kernel } from './LBMKernel';
import { LBMMacroKernel } from './LBMMacroKernel';
import { LBMSmokeKernel } from './LBMSmokeKernel';
import { NeoAeroKernel } from './NeoAeroKernel';

/**
 * Initializes the default set of kernels for the Hypercube Neo engine.
 * Must be called in every thread (Main and Worker) that uses the KernelRegistry.
 */
export function initializeKernels(): void {
    KernelRegistry.register('diffusion', new DiffusionKernel());
    KernelRegistry.register('advection', new AdvectionKernel());
    KernelRegistry.register('force', new ForceKernel());
    KernelRegistry.register('lbm-d2q9', new LBMD2Q9Kernel());
    KernelRegistry.register('lbm-macro', new LBMMacroKernel());
    KernelRegistry.register('lbm-smoke', new LBMSmokeKernel());
    KernelRegistry.register('lbm-aero-fidelity-v1', new NeoAeroKernel());
}
