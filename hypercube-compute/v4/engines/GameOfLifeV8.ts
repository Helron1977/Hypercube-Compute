import { EngineDescriptor } from './EngineManifest';

/**
 * GameOfLifeV8 - Cellular Automata Proof of Concept.
 */
export const GameOfLifeV8: EngineDescriptor = {
    name: 'GameOfLifeV8',
    description: 'Conway\'s Game of Life (Cellular Automata)',

    faces: [
        { name: 'Grid', type: 'scalar', isSynchronized: true, defaultValue: 0 },
        { name: 'GridNext', type: 'scalar', isSynchronized: true },
        { name: 'Obstacles', type: 'mask', isReadOnly: true, defaultValue: 0 }
    ],

    parameters: [
        { name: 'threshold', label: 'Birth Threshold', defaultValue: 3, min: 1, max: 8 },
        { name: 'survivalMin', label: 'Survival Min', defaultValue: 2, min: 1, max: 8 },
        { name: 'survivalMax', label: 'Survival Max', defaultValue: 3, min: 1, max: 8 }
    ],

    rules: [
        {
            type: 'stencil',
            method: 'Custom',
            source: 'Grid',
            destination: 'GridNext',
            stencil: '7-point', // We might need a 8-point Moore stencil here though
            params: {
                ruleId: 1 // GoL
            }
        }
    ],

    visualProfile: {
        primary: 'Grid',
        overlay: 'Obstacles',
        colormap: 'binary'
    }
};
