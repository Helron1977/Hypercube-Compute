import { IKernel } from './IKernel';

/**
 * Registry for numerical kernels.
 * Allows decoupling the dispatcher from specific operator implementations.
 */
export class KernelRegistry {
    private static kernels: Map<string, IKernel> = new Map();

    /**
     * Registers a new kernel implementation for a specific scheme type.
     */
    public static register(type: string, kernel: IKernel): void {
        this.kernels.set(type, kernel);
    }

    /**
     * Retrieves a kernel for a given scheme type.
     */
    public static get(type: string): IKernel {
        const kernel = this.kernels.get(type);
        if (!kernel) {
            throw new Error(`KernelRegistry: No kernel registered for scheme type "${type}".`);
        }
        return kernel;
    }
}
