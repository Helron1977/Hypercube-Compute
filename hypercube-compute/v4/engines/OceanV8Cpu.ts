import { EngineDescriptor } from './EngineManifest';

/**
 * OceanV8 - Manifest for the 2.5D Ocean Engine (LBM D2Q9 + Biology).
 * This manifest acts as a semantic bridge for the legacy OceanEngine (02).
 */
export const OceanV8Cpu: EngineDescriptor = {
    name: 'OceanEngine 2.5D (V4)',
    version: '4.0.1_STABILIZED',
    description: '2.5D Ocean Simulation with Thermal/Biological currents',

    // 1. Data Contract (25 Faces matching Physical Layout of OceanEngine)
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

        // Masks & Results (9-13)
        { name: 'Obstacles', type: 'mask', isReadOnly: true, defaultValue: 0 },   // 9
        { name: 'Velocity_X', type: 'scalar', isSynchronized: true },            // 10
        { name: 'Velocity_Y', type: 'scalar', isSynchronized: true },            // 11
        { name: 'Water_Height', type: 'scalar', isSynchronized: true, defaultValue: 1.0 },          // 12
        { name: 'Biology', type: 'scalar', isSynchronized: true, defaultValue: 0.5 }               // 13
    ],

    // 2. Control Contract (Parameters)
    parameters: [
        { name: 'tau_0', label: 'Relaxation Time', defaultValue: 0.8, min: 0.5, max: 2.0 },
        { name: 'omega', label: 'Omega', defaultValue: 1.8, min: 1.0, max: 1.99 },
        { name: 'smagorinsky', label: 'Smagorinsky', defaultValue: 0.2, min: 0, max: 0.5 },
        { name: 'bioDiffusion', label: 'Bio Diffusion', defaultValue: 0.05, min: 0, max: 0.2 },
        { name: 'bioGrowth', label: 'Bio Growth', defaultValue: 0.0005, min: 0, max: 0.01 }
    ],

    // 3. Compute Contract (Abstract representation)
    rules: [
        { type: 'lbm-d2q9', method: 'Custom', source: 'P0' },
        { type: 'advection', method: 'Upwind', source: 'Biology', field: 'Velocity' }
    ],

    // 4. Default Visualization Profile
    visualProfile: {
        styleId: 'ocean',
        layers: [
            { faceLabel: 'Water_Height', role: 'primary', colormap: 'ocean', range: [0.0, 1.5] },
            { faceLabel: 'Biology', role: 'secondary', colormap: 'ocean', alpha: 0.5 }
        ],
        defaultMode: '2.5d'
    }
};
