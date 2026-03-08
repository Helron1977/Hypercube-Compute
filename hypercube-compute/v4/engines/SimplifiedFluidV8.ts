import { EngineDescriptor } from './EngineManifest';

/**
 * SimplifiedFluidV8 - Declarative Manifest for Simplified Fluid Dynamics.
 */
export const SimplifiedFluidV8: EngineDescriptor = {
    name: 'SimplifiedFluidV8',
    description: 'Simplified Grid-based Fluid Simulation',

    faces: [
        { name: 'Density', type: 'scalar', isSynchronized: true, defaultValue: 0 },
        { name: 'DensityNext', type: 'scalar', isSynchronized: true },
        { name: 'Velocity', type: 'vector', isSynchronized: true },
        { name: 'Obstacles', type: 'mask', isReadOnly: true, defaultValue: 0 }
    ],

    parameters: [
        { name: 'viscosity', label: 'Viscosity', defaultValue: 0.001, min: 0, max: 0.1 },
        { name: 'diffusion', label: 'Diffusion', defaultValue: 0.0001, min: 0, max: 0.01 }
    ],

    rules: [
        {
            type: 'advection',
            method: 'MacCormack',
            source: 'Density',
            destination: 'DensityNext',
            field: 'Velocity'
        },
        {
            type: 'diffusion',
            method: 'Explicit-Euler',
            source: 'DensityNext',
            destination: 'Density',
            stencil: '7-point'
        }
    ],

    visualProfile: {
        primary: 'Density',
        overlay: 'Obstacles',
        colormap: 'viridis'
    }
};
