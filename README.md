# Hypercube Neo: Cognitive Simulation Core 🌊🚀

Hypercube Neo is a state-of-the-art **Spatial Computing & Physical Simulation Engine**. Built specifically for high-performance fluid dynamics, cellular automata, and volumetric computing, it bridges the gap between hardware-agnostic declarative manifests and high-fidelity real-time execution.

<div align="center">
  <img src="https://raw.githubusercontent.com/Helron1977/Hypercube-Compute/main/docs/assets/logo.png" alt="Hypercube Neo Logo" width="220" style="border-radius:24px; box-shadow: 0 10px 40px rgba(0,0,0,0.3);" onerror="this.src='https://img.icons8.com/isometric/512/cube.png';"/>
  <p><strong>Pure O(1) Cognitive Engine • Zero-Allocation Tensors • WebGPU & Multithreaded CPU</strong></p>

  [![Version](https://img.shields.io/badge/Version-4.0.0--alpha.2-orange.svg?style=flat-square)](https://github.com/Helron1977/Hypercube-Compute)
  [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](https://opensource.org/licenses/MIT)
  [![Build: Passing](https://img.shields.io/badge/Tests-72%2F72%20Passing-green?style=flat-square)](./tests/)
</div>

---

## 🎥 Visual Performance (60 FPS)

Hypercube Neo achieves consistent 60 FPS performance by leveraging a **Zero-Stall Pipeline** and **Contiguous Memory Tensors**.

![Ocean GPU Demo](https://raw.githubusercontent.com/Helron1977/Hypercube-Compute/main/docs/media/ocean-gpu-demo.webp)
*Real-time fluid vorticity and bio-advection calculated via WebGPU (Hypercube Neo).*

---

## 🔥 Core Philosophy

Traditional engines struggle with object-oriented bottlenecks. Hypercube Neo treats the world as a **Hypercube of data tensors**:
- **O(1) Complexity**: Execution time is determined by grid resolution, not the number of interacting objects.
- **Zero-Copy Architecture**: SharedArrayBuffer (CPU) and VRAM-to-VRAM (GPU) orchestration eliminates costly memory transfers.
- **Manifest-Driven**: Define physics, topology, and visuals in a single JSON schema. High-level architecture is entirely decoupled from numerical kernels.

---

## 🏗️ Repository Architecture

The project is structured following industrial standards for high-performance compute libraries:

- **[`/core`](./core/)**: The heart of the engine (Physical mapping, Dispatchers, Orchestration).
  - [`/memory`](./core/memory/): `MasterBuffer` (VRAM/RAM anchor) and `IBufferBridge`.
  - [`/topology`](./core/topology/): `VirtualGrid` and `ParityManager`.
- **[`/io`](./io/)**: Input/Output adapters (Canvas Rendering, WebHooks).
- **[`/showcase`](./showcase/)**: Interactive demo hub for Neo simulations.
- **[`/kernels`](./core/kernels/)**: Pure numerical algorithms (LBM, Advection, Diffusion).
- **[`/docs`](./docs/)**: Comprehensive technical guides and architectural concepts.

---

## 🚀 Quick Start

Launch a multi-threaded fluid simulation in seconds:

```typescript
import { HypercubeNeoFactory } from './core/HypercubeNeoFactory';

const factory = new HypercubeNeoFactory();
const manifest = await factory.fromManifest('./showcase/cpu/aero-cpu.json');
const engine = await factory.build(manifest.config, manifest.engine);

async function loop() {
    await engine.step(); // O(1) Compute step
    requestAnimationFrame(loop);
}
loop();
```

---

## 📚 Documentation & Guides

- **[Declarative Architecture Guide](./docs/declarative-architecture.md)**: Deep dive into the V8/Neo manifest system.
- **[Aero Guide](./docs/showcase-aero.md)**: Master LBM Aerodynamics and viscosity tuning.
- **[Ocean Guide](./docs/showcase-ocean.md)**: Learn 2.5D Shallow Water equations and bio-advection.
- **[SDF Spatial Engine](./docs/showcase-sdf.md)**: $O(log N)$ Euclidean Distance Fields via Jump Flooding.

---

<p align="center">
  <i>Part of the <b>MonOs Cognitive Copilot</b> ecosystem. Built for the era of agentic computing.</i>
</p>
