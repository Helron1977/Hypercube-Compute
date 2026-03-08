import { EngineDescriptor } from './EngineManifest';

/**
 * VolumeDiffusionV8 - Declarative Manifest for 3D Stencil Diffusion.
 */
export const VolumeDiffusionV8: EngineDescriptor = {
    name: 'VolumeDiffusionV8',
    description: '3D Heat or Concentration Diffusion in a Volume',

    faces: [
        { name: 'State', type: 'scalar', isSynchronized: true, defaultValue: 0 },
        { name: 'StateNext', type: 'scalar', isSynchronized: true }
    ],

    parameters: [
        { name: 'diffusionRate', label: 'Diffusion Rate', defaultValue: 0.1, min: 0, max: 0.166 },
        { name: 'dissipation', label: 'Dissipation', defaultValue: 1.0, min: 0, max: 1.0 }
    ],

    rules: [
        {
            type: 'diffusion',
            method: 'Explicit-Euler',
            source: 'State',
            destination: 'StateNext',
            stencil: '7-point'
        }
    ],

    visualProfile: {
        primary: 'State',
        colormap: 'magma'
    }
};
