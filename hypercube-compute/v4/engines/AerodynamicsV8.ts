import { EngineDescriptor } from './EngineManifest';

/**
 * AerodynamicsV8 - Declarative Manifest for LBM D2Q9.
 */
export const AerodynamicsV8: EngineDescriptor = {
    name: 'AerodynamicsV8',
    description: 'Lattice Boltzmann Methods for 2D Fluid Dynamics',

    faces: [
        // LBM Populations (0-8)
        { name: 'P0', type: 'scalar', isSynchronized: true, defaultValue: 0.444444 },
        { name: 'P1', type: 'scalar', isSynchronized: true, defaultValue: 0.111111 },
        { name: 'P2', type: 'scalar', isSynchronized: true, defaultValue: 0.111111 },
        { name: 'P3', type: 'scalar', isSynchronized: true, defaultValue: 0.111111 },
        { name: 'P4', type: 'scalar', isSynchronized: true, defaultValue: 0.111111 },
        { name: 'P5', type: 'scalar', isSynchronized: true, defaultValue: 0.027777 },
        { name: 'P6', type: 'scalar', isSynchronized: true, defaultValue: 0.027777 },
        { name: 'P7', type: 'scalar', isSynchronized: true, defaultValue: 0.027777 },
        { name: 'P8', type: 'scalar', isSynchronized: true, defaultValue: 0.027777 },

        { name: 'Obstacles', type: 'mask', isReadOnly: true, defaultValue: 0 },   // 9
        { name: 'Velocity_X', type: 'scalar', isSynchronized: true },            // 10
        { name: 'Velocity_Y', type: 'scalar', isSynchronized: true },            // 11
        { name: 'Vorticity', type: 'scalar', isSynchronized: true },             // 12
        { name: 'Smoke', type: 'scalar', isSynchronized: true }                  // 13
    ],

    parameters: [
        { name: 'viscosity', label: 'Viscosity', defaultValue: 0.02, min: 0.001, max: 0.1 },
        { name: 'omega', label: 'Omega', defaultValue: 1.75, min: 1.0, max: 1.99 },
        { name: 'inflowVelocity', label: 'Inflow Velocity', defaultValue: 0.12, min: 0, max: 0.2 }
    ],

    rules: [
        {
            type: 'lbm-d2q9',
            method: 'Custom',
            source: 'P0', // Semantic hint
            params: {
                viscosity: 0.02
            }
        },
        {
            type: 'advection',
            method: 'Semi-Lagrangian',
            source: 'Smoke',
            field: 'Velocity'
        }
    ],

    // 4. Default Visualization Profile
    visualProfile: {
        styleId: 'arctic',
        layers: [
            { faceLabel: 'Smoke', role: 'primary', colormap: 'arctic' },
            { faceLabel: 'Obstacles', role: 'obstacle' }
        ],
        defaultMode: 'topdown'
    }
};
