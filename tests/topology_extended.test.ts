import { describe, it, expect, beforeEach } from 'vitest';
import { MapConstructor } from '../core/topology/MapConstructor';
import { TopologyResolver, BoundaryRoleID } from '../core/topology/TopologyResolver';
import { Dimension3D, GridBoundaries } from '../core/types';

describe('TopologyResolver Extended (New Ropes & Edge Cases)', () => {
    let mapConstructor: MapConstructor;
    let topologyResolver: TopologyResolver;

    beforeEach(() => {
        mapConstructor = new MapConstructor();
        topologyResolver = new TopologyResolver();
    });

    it('should correctly map newly added roles', () => {
        const dims: Dimension3D = { nx: 64, ny: 64, nz: 1 };
        const chunks = { x: 1, y: 1 };
        const boundaries: GridBoundaries = {
            left: { role: 'absorbing' },
            right: { role: 'dirichlet' },
            top: { role: 'neumann' },
            bottom: { role: 'clamped' }
        };

        const virtualChunks = mapConstructor.buildMap(dims, chunks, boundaries);
        const topology = topologyResolver.resolve(virtualChunks[0], chunks, boundaries);

        expect(topology.leftRole).toBe(BoundaryRoleID.ABSORBING);
        expect(topology.rightRole).toBe(BoundaryRoleID.DIRICHLET);
        expect(topology.topRole).toBe(BoundaryRoleID.NEUMANN);
        expect(topology.bottomRole).toBe(BoundaryRoleID.CLAMPED);
    });

    it('should handle "sandwich" configurations (Mixed roles)', () => {
        const dims: Dimension3D = { nx: 128, ny: 64, nz: 1 };
        const chunks = { x: 2, y: 1 };
        const boundaries: GridBoundaries = {
            left: { role: 'inflow' },
            right: { role: 'absorbing' },
            all: { role: 'wall' }
        };

        const virtualChunks = mapConstructor.buildMap(dims, chunks, boundaries);
        
        // Chunk 0: Inflow (L) | Continuity (R)
        const topo0 = topologyResolver.resolve(virtualChunks[0], chunks, boundaries);
        expect(topo0.leftRole).toBe(BoundaryRoleID.INFLOW);
        expect(topo0.rightRole).toBe(BoundaryRoleID.CONTINUITY);

        // Chunk 1: Continuity (L) | Absorbing (R)
        const topo1 = topologyResolver.resolve(virtualChunks[1], chunks, boundaries);
        expect(topo1.leftRole).toBe(BoundaryRoleID.CONTINUITY);
        expect(topo1.rightRole).toBe(BoundaryRoleID.ABSORBING);
    });
});
