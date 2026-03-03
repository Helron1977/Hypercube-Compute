# 07 - Volume Diffusion 3D

This example demonstrates a 3D Volume Diffusion simulation using the **Hypercube Compute** engine.

## Features
- **3D Compute**: Simulates heat/concentration diffusion in a 64x64x64 grid.
- **Volume Rendering**: Uses `HypercubeIsoRenderer` to visualize isothermal surfaces (voxels) in real-time.
- **Slice View**: Toggleable 2D slice view of the 3D volume.
- **Performance**: High-performance tensor-based computation with O(1) complexity per cell.

## Controls
- **View Mode**: Switch between Isometric (3D) and Slice (2D) views.
- **Diffusion Rate**: Adjust the speed of the diffusion process.
- **Reset**: Inject a "hot" sphere back into the center of the volume.

## Getting Started
1. Install dependencies:
   ```bash
   npm install
   ```
2. Run the development server:
   ```bash
   npm run dev
   ```
