struct Params {
    nx: u32,
    ny: u32,
    chunksX: u32,
    chunksY: u32,
    omega: f32,
    inflowUx: f32,
    time: f32,
    currentTick: u32,
    chunkX: u32,
    chunkY: u32,
    strideFace: u32,
    numObjects: u32,
    _pad: u32,
    _pad2: vec4<f32>, 
    objects: array<GpuObject, 8> 
};

struct GpuObject {
    pos: vec2<f32>,
    dim: vec2<f32>,
    isObstacle: f32,
    isSmoke: f32,
    objType: u32,
    _pad: u32
};

@group(0) @binding(0) var<storage, read_write> data: array<f32>;
@group(0) @binding(1) var<uniform> params: Params;

fn get_face_idx(face: u32, parity: u32, chunkOffset: u32, strideFace: u32, i: u32) -> u32 {
    return chunkOffset + (face * 2u + parity) * strideFace + i;
}

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    let nx = params.nx;
    let ny = params.ny;
    if (id.x >= nx || id.y >= ny) { return; }

    // Map thread ID (0..nx-1) to physical buffer position (1..nx)
    let px = id.x + 1u;
    let py = id.y + 1u;
    let pNx = nx + 2u;
    let pNy = ny + 2u;

    let i = py * pNx + px;
    let strideFace = params.strideFace;
    let readParity = params.currentTick % 2u;
    let writeParity = (params.currentTick + 1u) % 2u;
    let chunkOffset = 0u;

    // Static LBM Constants
    let dx_lbm = array<i32, 9>(0, 1, 0, -1, 0, 1, -1, -1, 1);
    let dy_lbm = array<i32, 9>(0, 0, 1, 0, -1, 1, 1, -1, -1);
    let opp = array<u32, 9>(0, 3, 4, 1, 2, 7, 8, 5, 6);
    let w_lbm = array<f32, 9>(4.0/9.0, 1.0/9.0, 1.0/9.0, 1.0/9.0, 1.0/9.0, 1.0/36.0, 1.0/36.0, 1.0/36.0, 1.0/36.0);

    // Buffers Indices
    let obsIdx = chunkOffset + 18u * strideFace + i;
    let vxIdx = chunkOffset + 19u * strideFace + i;
    let vyIdx = chunkOffset + 20u * strideFace + i;
    let vortIdx = chunkOffset + 21u * strideFace + i;
    let smokeReadIdx = chunkOffset + (22u + readParity) * strideFace + i;
    let smokeWriteIdx = chunkOffset + (22u + writeParity) * strideFace + i;

    // 1. DYNAMIC INPUTS (Objects & Inflow Column)
    var smokeInjection = 0.0;
    
    // Virtual Objects (Dynamic Smoke)
    for (var j = 0u; j < params.numObjects; j = j + 1u) {
        let obj = params.objects[j];
        var inObj = false;
        if (obj.objType == 1u) { // Circle
            let r = obj.dim.x * 0.5;
            let ddx = f32(id.x) - obj.pos.x;
            let ddy = f32(id.y) - obj.pos.y;
            if (ddx*ddx + ddy*ddy <= r*r) { inObj = true; }
        } else if (obj.objType == 2u) { // Rect
            if (f32(id.x) >= obj.pos.x && f32(id.x) <= obj.pos.x + obj.dim.x &&
                f32(id.y) >= obj.pos.y && f32(id.y) <= obj.pos.y + obj.dim.y) { inObj = true; }
        }
        if (inObj) { smokeInjection = max(smokeInjection, obj.isSmoke); }
    }

    // Inflow column (stays consistent with V1 design)
    if (id.x == 0u) {
        let pitch = max(1u, ny / 40u);
        if ((id.y + 2u) % pitch <= 2u) { smokeInjection = 1.0; }
    }

    // 2. OBSTACLE MASK ( Supports Polygons)
    if (data[obsIdx] > 0.99) {
        data[vxIdx] = 0.0; data[vyIdx] = 0.0; data[vortIdx] = 0.0;
        data[smokeWriteIdx] = 0.0;
        data[get_face_idx(0u, writeParity, chunkOffset, strideFace, i)] = w_lbm[0];
        for (var d = 1u; d < 9u; d = d + 1u) { data[get_face_idx(d, writeParity, chunkOffset, strideFace, i)] = w_lbm[d]; }
        return;
    }

    // World Inflow (Standard BGK Enforcer at Left Edge)
    if (id.x == 0u) {
        let ux_inf = params.inflowUx;
        let rho_inf = 1.0;
        let u2_inf = 1.5 * (ux_inf * ux_inf);
        data[get_face_idx(0u, writeParity, chunkOffset, strideFace, i)] = (4.0/9.0) * rho_inf * (1.0 - u2_inf);
        for (var d = 1u; d < 9u; d = d + 1u) {
            let cu = 3.0 * (f32(dx_lbm[d]) * ux_inf);
            data[get_face_idx(d, writeParity, chunkOffset, strideFace, i)] = w_lbm[d] * rho_inf * (1.0 + cu + 0.5 * cu * cu - u2_inf);
        }
        data[vxIdx] = ux_inf; data[vyIdx] = 0.0;
        data[smokeWriteIdx] = max(data[smokeReadIdx], smokeInjection);
        return;
    }

    // World Outflow (Open Boundary at Right Edge)
    if (id.x == nx - 1u) {
        // Simple zero-gradient extrapolation: copy from neighbor to the left
        let neighbor_i = i - 1u;
        for (var d = 0u; d < 9u; d = d + 1u) {
            data[get_face_idx(d, writeParity, chunkOffset, strideFace, i)] = data[get_face_idx(d, readParity, chunkOffset, strideFace, neighbor_i)];
        }
        data[vxIdx] = data[vxIdx - 1u]; 
        data[vyIdx] = data[vyIdx - 1u];
        data[smokeWriteIdx] = data[smokeReadIdx];
        return;
    }

    // 3. LBM CORE (Collision & Streaming)
    var rho: f32 = 0.0;
    var pf = array<f32, 9>();
    for (var d = 0u; d < 9u; d = d + 1u) {
        let npx = u32(i32(px) - dx_lbm[d]);
        let npy = u32(i32(py) - dy_lbm[d]);
        
        let ni = npy * pNx + npx;
        let isBoundary = (npx == 0u || npx == pNx - 1u || npy == 0u || npy == pNy - 1u);
        let nObsIdx = chunkOffset + 18u * strideFace + ni;
        
        if (isBoundary || data[nObsIdx] > 0.99) { // Bounce-back from walls or ghost cells
            pf[d] = data[get_face_idx(opp[d], readParity, chunkOffset, strideFace, i)];
        } else {
            pf[d] = data[chunkOffset + (d * 2u + readParity) * strideFace + ni];
        }
        rho = rho + pf[d];
    }

    let ux = ((pf[1] + pf[5] + pf[8]) - (pf[3] + pf[6] + pf[7])) / rho;
    let uy = ((pf[2] + pf[5] + pf[6]) - (pf[4] + pf[7] + pf[8])) / rho;
    data[vxIdx] = ux; data[vyIdx] = uy;

    let u2 = 1.5 * (ux * ux + uy * uy);
    let omega = params.omega;
    for (var d = 0u; d < 9u; d = d + 1u) {
        let cu = 3.0 * (f32(dx_lbm[d]) * ux + f32(dy_lbm[d]) * uy);
        let feq = w_lbm[d] * rho * (1.0 + cu + 0.5 * cu * cu - u2);
        data[get_face_idx(d, writeParity, chunkOffset, strideFace, i)] = pf[d] * (1.0 - omega) + feq * omega;
    }

    // 4. AUXILIARY (Vorticity & Smoke Advection)
    // Central difference for vorticity
    let dUy_dx = (data[vyIdx + 1u] - data[vyIdx - 1u]) * 0.5;
    let dUx_dy = (data[vxIdx + pNx] - data[vxIdx - pNx]) * 0.5;
    data[vortIdx] = dUy_dx - dUx_dy;

    // Semi-Lagrangian Smoke
    let sx = f32(px) - ux; let sy = f32(py) - uy;
    let x0 = u32(clamp(floor(sx), 1.0, f32(pNx - 2u))); 
    let y0 = u32(clamp(floor(sy), 1.0, f32(pNy - 2u)));
    let fx = sx - f32(x0); let fy = sy - f32(y0);
    
    let sr0 = chunkOffset + (22u + readParity) * strideFace + (y0 * pNx);
    let sr1 = chunkOffset + (22u + readParity) * strideFace + ((y0 + 1u) * pNx);
    
    let s00 = data[sr0 + x0];   let s10 = data[sr0 + x0 + 1u];
    let s01 = data[sr1 + x0];   let s11 = data[sr1 + x0 + 1u];
    
    var rawS = (s00 * (1.0 - fx) + s10 * fx) * (1.0 - fy) + (s01 * (1.0 - fx) + s11 * fx) * fy;
    data[smokeWriteIdx] = max(rawS, smokeInjection); // Removed 0.9995 decay to maximize persistence
}
