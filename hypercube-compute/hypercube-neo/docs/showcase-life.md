# Case 05: Conway's Game of Life (Neo)

This showcase demonstrates cellular automata using the Hypercube Neo orchestration layer.

## Mathematical Core
- **Type**: Cellular Automata (B3/S23)
- **Engine**: `neo-life-v1`
- **Face Concept**: `cells` (Ping-Pong)
- **Stencil**: 3x3 (Moore Neighborhood)

## Implementation Details
- **CPU**: Parallel execution across virtual chunks. Each chunk computes the next state based on the current neighbor counts.
- **GPU**: WGSL compute shader executing 16x16 workgroups. Leverages zero-allocation ping-pong buffering.

## Usage
Select the `showcase-life.json` manifest to launch this simulation.
