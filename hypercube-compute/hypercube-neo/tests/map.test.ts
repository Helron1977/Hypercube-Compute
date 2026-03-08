import { describe, it, expect } from 'vitest';
import { MapConstructor } from '../core/MapConstructor';
import { Dimension3D, GridBoundaries } from '../core/types';

describe('Hypercube Neo: MapConstructor', () => {
    const mapConstructor = new MapConstructor();
    const dims: Dimension3D = { nx: 128, ny: 128, nz: 1 };

    it('should deduce joints in a 2x1 grid', () => {
        const chunks = { x: 2, y: 1 };
        const globalBoundaries: GridBoundaries = { all: { role: 'wall' } };

        const map = mapConstructor.buildMap(dims, chunks, globalBoundaries);

        expect(map.length).toBe(2);

        // Chunk 0,0 (left)
        const c0 = map[0];
        expect(c0.x).toBe(0);
        // Right side of c0 should be a joint to c1
        const rightJoint = c0.joints.find(j => j.face === 'right');
        expect(rightJoint?.role).toBe('joint');
        expect(rightJoint?.neighborId).toBe('chunk_1_0_0');

        // Left side of c0 should be a world wall
        const leftJoint = c0.joints.find(j => j.face === 'left');
        expect(leftJoint?.role).toBe('wall');

        // Chunk 1,0 (right)
        const c1 = map[1];
        expect(c1.x).toBe(1);
        // Left side of c1 should be a joint to c0
        const c1LeftJoint = c1.joints.find(j => j.face === 'left');
        expect(c1LeftJoint?.role).toBe('joint');
        expect(c1LeftJoint?.neighborId).toBe('chunk_0_0_0');
    });

    it('should respect periodic boundaries at world borders', () => {
        const chunks = { x: 2, y: 1 };
        const globalBoundaries: GridBoundaries = {
            left: { role: 'periodic' },
            right: { role: 'periodic' },
            top: { role: 'wall' },
            bottom: { role: 'wall' }
        };

        const map = mapConstructor.buildMap(dims, chunks, globalBoundaries);

        const c0 = map[0]; // Left chunk
        const leftJoint = c0.joints.find(j => j.face === 'left');
        expect(leftJoint?.role).toBe('periodic');

        const c1 = map[1]; // Right chunk
        const rightJoint = c1.joints.find(j => j.face === 'right');
        expect(rightJoint?.role).toBe('periodic');
    });
});
