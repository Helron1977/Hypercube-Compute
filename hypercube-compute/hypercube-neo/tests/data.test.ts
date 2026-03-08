import { describe, it, expect } from 'vitest';
import { DataContract } from '../core/DataContract';
import { EngineDescriptor } from '../core/types';

describe('Hypercube Neo: DataContract', () => {
    const lbmDescriptor: EngineDescriptor = {
        name: 'LBM-D2Q9',
        version: '1.0.0',
        faces: [
            { name: 'fi', type: 'population', isSynchronized: true },
            { name: 'rho', type: 'macro', isSynchronized: false }
        ],
        parameters: {
            viscosity: { name: 'Viscosity', type: 'number', default: 0.1 }
        },
        rules: [
            { type: 'lbm-d2q9', method: 'Custom', source: 'fi' }
        ],
        outputs: [],
        requirements: { ghostCells: 1, pingPong: true }
    };

    const contract = new DataContract(lbmDescriptor);

    it('should deduce face mappings and sync requirements', () => {
        const mappings = contract.getFaceMappings();

        expect(mappings.length).toBe(2);

        // Face 0: Population -> Should require sync
        expect(mappings[0].name).toBe('fi');
        expect(mappings[0].requiresSync).toBe(true);
        expect(mappings[0].isPingPong).toBe(true);

        // Face 1: Macro -> Should not require sync by default in this abstract model
        expect(mappings[1].name).toBe('rho');
        expect(mappings[1].requiresSync).toBe(false);
    });

    it('should calculate correct byte allocation for a padded 2D grid', () => {
        const nx = 16, ny = 16, nz = 1, padding = 1;
        // fi: synchronized=true -> 2 buffers
        // rho: synchronized=false -> 1 buffer
        // Total: 3 buffers * 324 * 4 = 3888 bytes
        const expectedBytes = (16 + 2) * (16 + 2) * 1 * 4 * 3;

        const bytes = contract.calculateChunkBytes(nx, ny, nz, padding);
        expect(bytes).toBe(expectedBytes);
    });
});
