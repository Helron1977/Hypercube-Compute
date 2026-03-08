import { describe, it, expect, vi } from 'vitest';
import { ParameterMapper } from '../core/ParameterMapper';
import { V8EngineProxy } from '../core/V8EngineProxy';
import { EngineDescriptor } from '../engines/EngineManifest';
import { V8_PARAMS_OFFSET, V8_PARAM_STRIDE } from '../core/UniformPresets';

describe('V8 ParameterMapper', () => {
    const mockDescriptor: EngineDescriptor = {
        name: 'TestEngine',
        faces: [],
        parameters: [
            { name: 'viscosity', label: 'Viscosity', defaultValue: 0.1 },
            { name: 'diffusion', label: 'Diffusion', defaultValue: 0.5 },
        ],
        rules: []
    };

    it('should resolve semantic names to correct offsets', () => {
        const mapper = new ParameterMapper(mockDescriptor);
        expect(mapper.getOffset('viscosity')).toBe(0);
        expect(mapper.getOffset('diffusion')).toBe(1);
    });

    it('should throw error for unknown parameters', () => {
        const mapper = new ParameterMapper(mockDescriptor);
        expect(() => mapper.getOffset('unknown')).toThrow();
    });

    it('should return correct default values array', () => {
        const mapper = new ParameterMapper(mockDescriptor);
        const defaults = mapper.getDefaults();
        expect(defaults[0]).toBe(0.1);
        expect(defaults[1]).toBe(0.5);
    });
});

describe('V8EngineProxy', () => {
    const mockDescriptor: EngineDescriptor = {
        name: 'TestEngine',
        faces: [],
        parameters: [
            { name: 'heat', label: 'Heat', defaultValue: 10.0 },
        ],
        rules: []
    };

    it('should update grid.uniforms correctly with base offsets', () => {
        const mockGrid = {
            uniforms: new Float32Array(512),
            compute: vi.fn(),
            nx: 16, ny: 16, nz: 1
        };
        const mockEngine = { parity: 0 };

        const proxy = new V8EngineProxy(mockGrid as any, mockDescriptor, mockEngine as any);

        // Initial value check (defaults injected at offset 8)
        expect(mockGrid.uniforms[V8_PARAMS_OFFSET]).toBe(10.0);

        // Update via semantic name
        proxy.setParam('heat', 99.0);
        expect(mockGrid.uniforms[V8_PARAMS_OFFSET]).toBe(99.0);
    });

    it('should call grid.compute when step is called', () => {
        const mockGrid = {
            uniforms: new Float32Array(512),
            compute: vi.fn()
        };
        const mockEngine = { parity: 0 };
        const proxy = new V8EngineProxy(mockGrid as any, mockDescriptor, mockEngine as any);
        proxy.compute();
        expect(mockGrid.compute).toHaveBeenCalled();
    });
});
