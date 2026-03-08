import { EngineDescriptor, HypercubeConfig } from './types';

/**
 * The Manifest defines the declarative contract for an Engine.
 * It is used for validation and resource allocation.
 */
export interface IManifest {
    readonly descriptor: EngineDescriptor;

    /**
     * Validates a configuration against the descriptor.
     */
    validate(config: HypercubeConfig): { valid: boolean; errors: string[] };

    /**
     * Deduce numerical properties (e.g., total faces, ghost cells) from the descriptor.
     */
    getRequiredResources(config: HypercubeConfig): {
        numFaces: number;
        padding: number;
        usePingPong: boolean;
    };
}
