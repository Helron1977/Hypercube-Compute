import { HypercubeConfig, EngineDescriptor } from './types';

/**
 * Interface for the Hypercube Factory.
 * Responsible for creating abstract grid structures before any memory allocation.
 */
export interface IFactory {
    /**
     * Create a virtual representation of the grid.
     */
    createVirtualGrid(config: HypercubeConfig, descriptor: EngineDescriptor): any;

    /**
     * Instantiate the real grid (CPU or GPU) and orchestration proxy.
     */
    build(config: HypercubeConfig, descriptor: EngineDescriptor): Promise<any>;
}
