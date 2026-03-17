# Case 07: Tensor CP Decomposition (ALS)

A non-physical Showcase demonstrating how Hypercube Neo can be used as a high-performance data science engine.

## Concept
Decomposing a 3rd-order tensor into a sum of rank-1 factors using Alternating Least Squares (ALS).

## Engine Architecture
- **Engine**: `neo-tensor-cp-v1`
- **Faces**:
  - `mode_a`: Factor matrix for Mode 1
  - `mode_b`: Factor matrix for Mode 2
  - `mode_c`: Factor matrix for Mode 3
  - `target`: The original data tensor

## Why Neo?
The Hypercube Neo topology is a natural fit for Tensor Decomposition. The ALS update for each mode is mathematically equivalent to "folding" or "fusing" the other modes (faces) against the target data.

## Usage
Select the `showcase-tensor-cp.json` manifest to explore latent patterns in multi-way data.
