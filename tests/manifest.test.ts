import { describe, it, expect } from 'vitest';
import { EngineDescriptor, HypercubeConfig } from '../core/types';
import { IManifest } from '../core/IManifest';

class MockEngineManifest implements IManifest {
    constructor(public readonly descriptor: EngineDescriptor) { }

    validate(config: HypercubeConfig) {
        const errors: string[] = [];

        // Rule 1: Multiples of 16
        if (config.dimensions.nx % 16 !== 0 || config.dimensions.ny % 16 !== 0) {
            errors.push('Dimensions must be multiples of 16');
        }

        // Rule 2: Check required parameters
        for (const [key, details] of Object.entries(this.descriptor.parameters)) {
            if (config.params[key] === undefined) {
                errors.push(`Missing required parameter: ${key}`);
            }
        }

        return { valid: errors.length === 0, errors };
    }

    getRequiredResources(config: HypercubeConfig) {
        return {
            numFaces: this.descriptor.faces.length,
            padding: this.descriptor.requirements.ghostCells,
            usePingPong: this.descriptor.requirements.pingPong
        };
    }
}

describe('Hypercube Neo: Declarative Manifest', () => {
    const lbmDescriptor: EngineDescriptor = {
        name: 'LBM-D2Q9',
        version: '1.0.0',
        faces: [{ name: 'fi', type: 'population', isSynchronized: true }],
        parameters: {
            viscosity: { name: 'Viscosity', type: 'number', default: 0.1, min: 0.01, max: 1.0 }
        },
        rules: [
            { type: 'lbm-d2q9', method: 'Custom', source: 'fi' }
        ],
        outputs: [
            { name: 'Populations', sources: ['fi'] }
        ],
        requirements: {
            ghostCells: 1,
            pingPong: true
        }
    };

    const manifest = new MockEngineManifest(lbmDescriptor);

    it('should validate valid configuration (multiple of 16)', () => {
        const config: HypercubeConfig = {
            dimensions: { nx: 128, ny: 128, nz: 1 },
            chunks: { x: 1, y: 1 },
            boundaries: { all: { role: 'wall' } },
            engine: 'LBM-D2Q9',
            params: { viscosity: 0.1 },
            mode: 'cpu'
        };

        const result = manifest.validate(config);
        expect(result.valid).toBe(true);
    });

    it('should invalidate dimensions not multiple of 16', () => {
        const config: HypercubeConfig = {
            dimensions: { nx: 100, ny: 100, nz: 1 },
            chunks: { x: 1, y: 1 },
            boundaries: { all: { role: 'wall' } },
            engine: 'LBM-D2Q9',
            params: { viscosity: 0.1 },
            mode: 'cpu'
        };

        const result = manifest.validate(config);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Dimensions must be multiples of 16');
    });

    it('should detect resource requirements from descriptor', () => {
        const config: HypercubeConfig = {
            dimensions: { nx: 64, ny: 64, nz: 1 },
            chunks: { x: 1, y: 1 },
            boundaries: { all: { role: 'wall' } },
            engine: 'LBM-D2Q9',
            params: { viscosity: 0.1 },
            mode: 'cpu'
        };

        const resources = manifest.getRequiredResources(config);
        expect(resources.padding).toBe(1);
        expect(resources.usePingPong).toBe(true);
    });
});
