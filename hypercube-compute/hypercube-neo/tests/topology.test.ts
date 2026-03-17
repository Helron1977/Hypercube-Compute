import { describe, it, expect, beforeEach } from 'vitest';
import { MapConstructor } from '../core/topology/MapConstructor';
import { TopologyResolver, BoundaryRoleID } from '../core/topology/TopologyResolver';
import { Dimension3D, GridBoundaries } from '../core/types';

describe('TopologyResolver (Universal Chunk Autonomy)', () => {
    let mapConstructor: MapConstructor;
    let topologyResolver: TopologyResolver;

    beforeEach(() => {
        mapConstructor = new MapConstructor();
        topologyResolver = new TopologyResolver();
    });

    describe('Scenario 1: 1x1 Tunnel (Classical Aero)', () => {
        it('should correctly identify Left as INFLOW and Right as OUTFLOW', () => {
            const dims: Dimension3D = { nx: 128, ny: 128, nz: 1 };
            const chunks = { x: 1, y: 1 };
            const boundaries: GridBoundaries = {
                left: { role: 'inflow' },
                right: { role: 'outflow' },
                top: { role: 'wall' },
                bottom: { role: 'wall' }
            };

            const virtualChunks = mapConstructor.buildMap(dims, chunks, boundaries);
            const topology = topologyResolver.resolve(virtualChunks[0], chunks, boundaries);

            expect(topology.leftRole).toBe(BoundaryRoleID.INFLOW);
            expect(topology.rightRole).toBe(BoundaryRoleID.OUTFLOW);
            expect(topology.topRole).toBe(BoundaryRoleID.WALL);
            expect(topology.bottomRole).toBe(BoundaryRoleID.WALL);
        });
    });

    describe('Scenario 2: 1x1 Toroidal (Closed Loop)', () => {
        it('should identify all sides as PERIODIC', () => {
            const dims: Dimension3D = { nx: 128, ny: 128, nz: 1 };
            const chunks = { x: 1, y: 1 };
            const boundaries: GridBoundaries = { all: { role: 'periodic' } };

            const virtualChunks = mapConstructor.buildMap(dims, chunks, boundaries);
            const topology = topologyResolver.resolve(virtualChunks[0], chunks, boundaries);

            // In 1x1 periodic, left neighbor is itself, role is CONTINUITY (or PERIODIC mapped to CONTINUITY)
            expect(topology.leftRole).toBe(BoundaryRoleID.CONTINUITY);
            expect(topology.rightRole).toBe(BoundaryRoleID.CONTINUITY);
            expect(topology.topRole).toBe(BoundaryRoleID.CONTINUITY);
            expect(topology.bottomRole).toBe(BoundaryRoleID.CONTINUITY);
        });
    });

    describe('Scenario 3: 2x1 Multi-Chunk Tunnel', () => {
        const dims: Dimension3D = { nx: 256, ny: 128, nz: 1 };
        const chunks = { x: 2, y: 1 };
        const boundaries: GridBoundaries = {
            left: { role: 'inflow' },
            right: { role: 'outflow' },
            top: { role: 'wall' },
            bottom: { role: 'wall' }
        };

        it('should identify Chunk 0 (Left) as Inflow/Continuity', () => {
            const virtualChunks = mapConstructor.buildMap(dims, chunks, boundaries);
            const topology = topologyResolver.resolve(virtualChunks[0], chunks, boundaries);

            expect(topology.leftRole).toBe(BoundaryRoleID.INFLOW);
            expect(topology.rightRole).toBe(BoundaryRoleID.CONTINUITY); // Joint with Chunk 1
            expect(topology.topRole).toBe(BoundaryRoleID.WALL);
        });

        it('should identify Chunk 1 (Right) as Continuity/Outflow', () => {
            const virtualChunks = mapConstructor.buildMap(dims, chunks, boundaries);
            const topology = topologyResolver.resolve(virtualChunks[1], chunks, boundaries);

            expect(topology.leftRole).toBe(BoundaryRoleID.CONTINUITY); // Joint with Chunk 0
            expect(topology.rightRole).toBe(BoundaryRoleID.OUTFLOW);
            expect(topology.topRole).toBe(BoundaryRoleID.WALL);
        });
    });

    describe('Scenario 4: 2x2 Box (Internal Joints)', () => {
        it('should identify pure CONTINUITY for internal corner', () => {
            const dims: Dimension3D = { nx: 256, ny: 256, nz: 1 };
            const chunks = { x: 2, y: 2 };
            const boundaries: GridBoundaries = { all: { role: 'wall' } };

            const virtualChunks = mapConstructor.buildMap(dims, chunks, boundaries);
            
            // Chunk (0,0) - Top Left
            const tl = topologyResolver.resolve(virtualChunks[0], chunks, boundaries);
            expect(tl.leftRole).toBe(BoundaryRoleID.WALL);
            expect(tl.topRole).toBe(BoundaryRoleID.WALL);
            expect(tl.rightRole).toBe(BoundaryRoleID.CONTINUITY);
            expect(tl.bottomRole).toBe(BoundaryRoleID.CONTINUITY);

            // Chunk (1,1) - Bottom Right
            const br = topologyResolver.resolve(virtualChunks[3], chunks, boundaries);
            expect(br.leftRole).toBe(BoundaryRoleID.CONTINUITY);
            expect(br.topRole).toBe(BoundaryRoleID.CONTINUITY);
            expect(br.rightRole).toBe(BoundaryRoleID.WALL);
            expect(br.bottomRole).toBe(BoundaryRoleID.WALL);
        });
    });

    describe('Scenario 5: 3D Topology (Box)', () => {
        it('should handle Front/Back roles', () => {
            const dims: Dimension3D = { nx: 64, ny: 64, nz: 64 };
            const chunks = { x: 1, y: 1, z: 2 };
            const boundaries: GridBoundaries = { all: { role: 'wall' } };

            const virtualChunks = mapConstructor.buildMap(dims, chunks, boundaries);
            
            // Chunk 0 (Front)
            const front = topologyResolver.resolve(virtualChunks[0], chunks, boundaries);
            expect(front.frontRole).toBe(BoundaryRoleID.WALL);
            expect(front.backRole).toBe(BoundaryRoleID.CONTINUITY);

            // Chunk 1 (Back)
            const back = topologyResolver.resolve(virtualChunks[1], chunks, boundaries);
            expect(back.frontRole).toBe(BoundaryRoleID.CONTINUITY);
            expect(back.backRole).toBe(BoundaryRoleID.WALL);
        });
    });
});
