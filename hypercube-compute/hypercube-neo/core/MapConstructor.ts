import { IMapConstructor, VirtualChunk, JointDescriptor } from './GridAbstractions';
import { Dimension3D, GridBoundaries, BoundarySide } from './types';

export class MapConstructor implements IMapConstructor {
    buildMap(
        dims: Dimension3D,
        chunks: { x: number; y: number; z?: number },
        globalBoundaries: GridBoundaries
    ): VirtualChunk[] {
        const virtualChunks: VirtualChunk[] = [];
        const numZ = chunks.z ?? 1;

        for (let cz = 0; cz < numZ; cz++) {
            for (let cy = 0; cy < chunks.y; cy++) {
                for (let cx = 0; cx < chunks.x; cx++) {
                    const chunkId = `chunk_${cx}_${cy}_${cz}`;
                    const joints: JointDescriptor[] = [];

                    // Deducing joints for each face
                    joints.push(this.deduceJoint(cx, cy, cz, 'left', chunks, globalBoundaries));
                    joints.push(this.deduceJoint(cx, cy, cz, 'right', chunks, globalBoundaries));
                    joints.push(this.deduceJoint(cx, cy, cz, 'top', chunks, globalBoundaries));
                    joints.push(this.deduceJoint(cx, cy, cz, 'bottom', chunks, globalBoundaries));

                    if (numZ > 1) {
                        joints.push(this.deduceJoint(cx, cy, cz, 'front', chunks, globalBoundaries));
                        joints.push(this.deduceJoint(cx, cy, cz, 'back', chunks, globalBoundaries));
                    }

                    virtualChunks.push({
                        x: cx,
                        y: cy,
                        z: cz,
                        id: chunkId,
                        joints
                    });
                }
            }
        }

        return virtualChunks;
    }

    private deduceJoint(
        cx: number, cy: number, cz: number,
        face: 'left' | 'right' | 'top' | 'bottom' | 'front' | 'back',
        chunks: { x: number; y: number; z?: number },
        globalBoundaries: GridBoundaries
    ): JointDescriptor {
        let isInternal = false;
        let neighborId: string | undefined;

        const numX = chunks.x;
        const numY = chunks.y;
        const numZ = chunks.z ?? 1;

        switch (face) {
            case 'left':
                if (cx > 0) { isInternal = true; neighborId = `chunk_${cx - 1}_${cy}_${cz}`; }
                break;
            case 'right':
                if (cx < numX - 1) { isInternal = true; neighborId = `chunk_${cx + 1}_${cy}_${cz}`; }
                break;
            case 'top':
                if (cy > 0) { isInternal = true; neighborId = `chunk_${cx}_${cy - 1}_${cz}`; }
                break;
            case 'bottom':
                if (cy < numY - 1) { isInternal = true; neighborId = `chunk_${cx}_${cy + 1}_${cz}`; }
                break;
            case 'front':
                if (cz > 0) { isInternal = true; neighborId = `chunk_${cx}_${cy}_${cz - 1}`; }
                break;
            case 'back':
                if (cz < numZ - 1) { isInternal = true; neighborId = `chunk_${cx}_${cy}_${cz + 1}`; }
                break;
        }

        if (isInternal) {
            return { role: 'joint', face, neighborId };
        }

        // If not internal, it's a world boundary.
        // We use the global boundaries or fallback to 'wall' if not defined.
        const boundarySide = globalBoundaries[face] || globalBoundaries.all || { role: 'wall' };
        let role = boundarySide.role;
        let periodicNeighborId: string | undefined;

        if (role === 'periodic') {
            role = 'joint';
            switch (face) {
                case 'left': periodicNeighborId = `chunk_${numX - 1}_${cy}_${cz}`; break;
                case 'right': periodicNeighborId = `chunk_0_${cy}_${cz}`; break;
                case 'top': periodicNeighborId = `chunk_${cx}_${numY - 1}_${cz}`; break;
                case 'bottom': periodicNeighborId = `chunk_${cx}_0_${cz}`; break;
                case 'front': periodicNeighborId = `chunk_${cx}_${cy}_${numZ - 1}`; break;
                case 'back': periodicNeighborId = `chunk_${cx}_${cy}_0`; break;
            }
            return { role, face, neighborId: periodicNeighborId };
        }

        return { role, face };
    }
}
