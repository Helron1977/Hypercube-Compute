# Case 06: Spatial Pathfinder (Wavefront)

This showcase demonstrates Dijkstra-like wavefront propagation in a spatial grid with obstacles.

## Mathematical Core
- **Type**: Distance Field Propagation (Wavefront)
- **Engine**: `neo-path-v1`
- **Face Concept**: 
  - `distance`: The distance field (Ping-Pong)
  - `obstacles`: Static mask (No synchronization)

## Implementation Details
- **Pattern**: A 4-point cardinal stencil (Manhattan) or 8-point (Chebyshev) that propagates the minimum distance from seed points while respecting obstacle boundaries.
- **Complexity**: O(N) per step, where N is the number of grid points.

## Usage
Select the `showcase-path.json` manifest to launch this simulation.
