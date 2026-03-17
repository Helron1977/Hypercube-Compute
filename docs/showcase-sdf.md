# Case 03: SDF Spatial Engine (Jump Flooding)

## Overview

The **Spatial Decision Engine** utilizes the **Jump Flooding Algorithm (JFA)** to compute exact Euclidean distances (Signed Distance Fields - SDF) for 6 distinct urban criteria across Paris (Subways, Schools, Parks, Hospitals, Shops, Water). 

Unlike continuous PDE diffusion (which was used in Heatmap V1), the SDF approach guarantees mathematically perfect geometric distances and resolves them in **$O(log N)$ parallel passes** on the CPU or GPU, before collapsing the interface into a pure **$O(1)$ analytical renderer**.

## Architecture & Complexity

### 1. Data Ingestion & Seeding
Using OpenStreetMap nodes, the application designates specific generic geographical elements as "seeds" (e.g. Metro Stations). It stores their exactly known geometric $[X, Y]$ coordinates into the target data faces.

### 2. O(log N) JFA Computations
Instead of taking $\approx 500$ physics steps to diffuse heat across a $512 \times 512$ grid, the engine executes exactly $\lceil \log_2(512) \rceil = 9$ steps.
In each step $k$, a grid cell queries its neighbors at a radius of $2^k$. It calculates the exact Pythagorean theorem against the neighbors' known seed coordinates and keeps the coordinates of the closest seed found. 
Because the queries jump outward exponentially, information rapidly crosses the entire map natively dodging obstacles.

### 3. O(1) Real-time Resolution
Once the 9 steps are physically executed, the Engine "Bake" is finished and the physics worker scales down. The `CanvasAdapterNeo.ts` then acts as an analytical shader. For any pixel, it simply reads the pre-computed exact distance to the 6 criteria and evaluates the user UI sliders (Weight and Distance Tolerance) via pure algebra in $O(1)$ time per pixel.
This separation of offline geometry baking and real-time analytical slicing guarantees a 60 FPS UI experience regardless of the total number of constraints.

## User Interface Configuration (Fibonacci & Radius)

The User Interface exposes two controls per criterion:
- **Importance (Fibonacci)**: Determines the weight of the criterion in the overall scoring. The values are mapped to the Fibonacci sequence (1, 2, 3, 5, 8, 13) to ensure unambiguous hierarchy between choices.
- **Tolerance Radius (Meters)**: Defines the physical threshold. If the distance to the closest seed is less than the radius, the constraint is heavily satisfied. As distance increases beyond the threshold, satisfaction strictly decays.

By combining these constraints perfectly mathematically, the user highlights the optimal geographical spots fulfilling all defined needs.
