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
    obsIdx: u32,       // Slot 12
    vxReadIdx: u32,    // 13
    vyReadIdx: u32,    // 14
    vortReadIdx: u32,  // 15
    smokeReadIdx: u32, // 16
    vxWriteIdx: u32,   // 17
    vyWriteIdx: u32,   // 18
    vortWriteIdx: u32, // 19
    smokeWriteIdx: u32,// 20
    fBase: u32,        // 21
    _engineParam1: u32, // 22
    _engineParam2: u32, // 23
    leftRole: u32,     // 24
    rightRole: u32,    // 25
    topRole: u32,      // 26
    bottomRole: u32,   // 27
    frontRole: u32,    // 28
    backRole: u32,     // 29
    _pad30: u32,       // 30
    _pad31: u32,       // 31
    objects: array<GpuObject, 8> // Slot 32
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

// Agnostic Face Accessor for LBM Populations (Always Ping-Ponged in NeoAero)
fn get_f_idx(d: u32, parity: u32, strideFace: u32, fBase: u32, i: u32) -> u32 {
    return (fBase + d * 2u + parity) * strideFace + i;
}

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    let nx = params.nx;
    let ny = params.ny;
    if (id.x >= nx || id.y >= ny) { return; }

    // Physical buffer coordinates (1..nx)
    let px = id.x + 1u;
    let py = id.y + 1u;
    let pNx = nx + 2u;
    let pNy = ny + 2u;

    let i = py * pNx + px;
    let strideFace = params.strideFace;
    let readParity = params.currentTick % 2u;
    let writeParity = (params.currentTick + 1u) % 2u;

    // Absolute Indices (Passed from GpuDispatcher via ParityManager)
    let obsIdx = params.obsIdx * strideFace + i;
    let vxReadIdx = params.vxReadIdx * strideFace + i;
    let vxWriteIdx = params.vxWriteIdx * strideFace + i;
    let vyReadIdx = params.vyReadIdx * strideFace + i;
    let vyWriteIdx = params.vyWriteIdx * strideFace + i;
    let vortReadIdx = params.vortReadIdx * strideFace + i;
    let vortWriteIdx = params.vortWriteIdx * strideFace + i;
    let smokeReadIdx = params.smokeReadIdx * strideFace + i;
    let smokeWriteIdx = params.smokeWriteIdx * strideFace + i;

    // Static LBM Constants
    let dx_lbm = array<i32, 9>(0, 1, 0, -1, 0, 1, -1, -1, 1);
    let dy_lbm = array<i32, 9>(0, 0, 1, 0, -1, 1, 1, -1, -1);
    let opp = array<u32, 9>(0, 3, 4, 1, 2, 7, 8, 5, 6);
    let w_lbm = array<f32, 9>(4.0/9.0, 1.0/9.0, 1.0/9.0, 1.0/9.0, 1.0/9.0, 1.0/36.0, 1.0/36.0, 1.0/36.0, 1.0/36.0);

    // 1. DYNAMIC INPUTS (Objects & Inflow Column)
    var smokeInjection = 0.0;
    
    // World Coordinates (Crucial for multi-chunk alignment)
    let worldX = f32(params.chunkX * params.nx + id.x);
    let worldY = f32(params.chunkY * params.ny + id.y);

    // Virtual Objects (Dynamic Smoke)
    for (var j = 0u; j < params.numObjects; j = j + 1u) {
        let obj = params.objects[j];
        var inObj = false;
        if (obj.objType == 1u) { // Circle
            let r = obj.dim.x * 0.5;
            let center = obj.pos + vec2<f32>(r, r);
            let ddx = worldX - center.x;
            let ddy = worldY - center.y;
            if (ddx*ddx + ddy*ddy <= r*r) { inObj = true; }
        } else if (obj.objType == 2u || obj.objType == 3u) { // Rect or Polygon (AABB check for injection)
            if (worldX >= obj.pos.x && worldX < obj.pos.x + obj.dim.x &&
                worldY >= obj.pos.y && worldY < obj.pos.y + obj.dim.y) { inObj = true; }
        }
        if (inObj) { smokeInjection = max(smokeInjection, obj.isSmoke); }
    }

    // 2. OBSTACLE MASK
    if (data[params.obsIdx * params.strideFace + i] > 0.99) {
        data[vxWriteIdx] = 0.0; data[vyWriteIdx] = 0.0; data[vortWriteIdx] = 0.0;
        data[get_f_idx(0u, writeParity, strideFace, params.fBase, i)] = w_lbm[0];
        for (var d = 1u; d < 9u; d = d + 1u) { 
            data[get_f_idx(d, writeParity, strideFace, params.fBase, i)] = w_lbm[d]; 
        }
        data[smokeWriteIdx] = max(data[smokeReadIdx], smokeInjection);
        return;
    }

    // --- UNIVERSAL BOUNDARY ROLES ---
    
    // 1. WORLD INFLOW (Role == 2)
    if (px == 1u && params.leftRole == 2u) {
        var scale = 1.0;
        if (id.y < 16u) { scale = f32(id.y) / 16.0; }
        if (id.y > ny - 17u) { scale = f32(ny - 1u - id.y) / 16.0; }

        let ux_inf = params.inflowUx * scale;
        let rho_inf = 1.0;
        let u2_inf = 1.5 * (ux_inf * ux_inf);
        
        data[get_f_idx(0u, writeParity, strideFace, params.fBase, i)] = (4.0/9.0) * rho_inf * (1.0 - u2_inf);
        for (var d = 1u; d < 9u; d = d + 1u) {
            let cu = 3.0 * (f32(dx_lbm[d]) * ux_inf);
            data[get_f_idx(d, writeParity, strideFace, params.fBase, i)] = w_lbm[d] * rho_inf * (1.0 + cu + 0.5 * cu * cu - u2_inf);
        }
        data[vxWriteIdx] = ux_inf; data[vyWriteIdx] = 0.0;
        
        let pitch = max(1u, ny / 20u);
        // Offset injection to avoid sticking to walls
        data[smokeWriteIdx] = select(data[smokeReadIdx], 1.0, (id.y > 4u && id.y < ny - 5u && (id.y + 2u) % pitch <= 2u));
        return;
    }

    // --- AUTOMATIC INITIALIZATION (Step 0 Wakeup) ---
    if (params.currentTick == 0u) {
        let ux_init = params.inflowUx;
        let rho_init = 1.0;
        let u2_init = 1.5 * (ux_init * ux_init);
        for (var d = 0u; d < 9u; d = d + 1u) {
            let cu = 3.0 * (f32(dx_lbm[d]) * ux_init);
            let feq = w_lbm[d] * rho_init * (1.0 + cu + 0.5 * cu * cu - u2_init);
            data[get_f_idx(d, readParity, strideFace, params.fBase, i)] = feq;
            data[get_f_idx(d, writeParity, strideFace, params.fBase, i)] = feq;
        }
        data[vxWriteIdx] = ux_init; data[vxReadIdx] = ux_init;
        data[vyWriteIdx] = 0.0; data[vyReadIdx] = 0.0;
        data[vortWriteIdx] = 0.0;
        data[smokeWriteIdx] = 0.0;
        return;
    }

    // 2. WORLD BCs (Pure Walls: Top, Bottom, Left, Right)
    let isWallTop = (py == 1u && params.topRole == 0u);
    let isWallBottom = (py == ny && params.bottomRole == 0u);
    let isWallLeft = (px == 1u && params.leftRole == 0u);
    let isWallRight = (px == nx && params.rightRole == 0u);

    if (isWallTop || isWallBottom || isWallLeft || isWallRight) {
        for (var d = 0u; d < 9u; d = d + 1u) {
            data[get_f_idx(d, writeParity, strideFace, params.fBase, i)] = data[get_f_idx(d, readParity, strideFace, params.fBase, i)];
        }
        data[vxWriteIdx] = data[vxReadIdx];
        data[vyWriteIdx] = data[vyReadIdx];
        data[smokeWriteIdx] = data[smokeReadIdx];
        return;
    }

    // 3. WORLD OUTFLOW (Role == 3) - Applied at Penultimate Column (nx-1) or Border (nx)
    if (px >= nx - 1u && params.rightRole == 3u) {
        let prev = i - (px - (nx - 2u)); // Reference column (nx-2)
        let uH = data[params.vxWriteIdx * strideFace + prev]; 
        let vH = data[params.vyWriteIdx * strideFace + prev];
        let u2 = 1.5 * (uH * uH + vH * vH);
        
        data[get_f_idx(0u, writeParity, strideFace, params.fBase, i)] = (4.0/9.0) * (1.0 - u2);
        for (var d = 1u; d < 9u; d = d + 1u) {
            let cu = 3.0 * (f32(dx_lbm[d]) * uH + f32(dy_lbm[d]) * vH);
            data[get_f_idx(d, writeParity, strideFace, params.fBase, i)] = w_lbm[d] * (1.0 + cu + 0.5 * cu * cu - u2);
        }
        data[vxWriteIdx] = uH; data[vyWriteIdx] = vH;
        data[smokeWriteIdx] = data[smokeReadIdx];
        return;
    }

    // 3. LBM CORE (Collision & Streaming)
    var rho: f32 = 0.0;
    var pf = array<f32, 9>();
    for (var d = 0u; d < 9u; d = d + 1u) {
        let npx = i32(px) - dx_lbm[d];
        let npy = i32(py) - dy_lbm[d];
        let ni = u32(npy) * pNx + u32(npx);
        
        // Bounce-back on obstacles (penultimate column if obstacle)
        if (data[params.obsIdx * strideFace + ni] > 0.99) {
            pf[d] = data[get_f_idx(opp[d], readParity, strideFace, params.fBase, i)];
        } else {
            pf[d] = data[get_f_idx(d, readParity, strideFace, params.fBase, ni)];
        }
        rho = rho + pf[d];
    }

    let invRho = 1.0 / rho;
    let ux = ((pf[1] + pf[5] + pf[8]) - (pf[3] + pf[6] + pf[7])) * invRho;
    let uy = ((pf[2] + pf[5] + pf[6]) - (pf[4] + pf[7] + pf[8])) * invRho;

    data[vxWriteIdx] = ux; data[vyWriteIdx] = uy;

    let u2 = 1.5 * (ux * ux + uy * uy);
    let omega = params.omega;
    let rOmega = rho * omega;
    let om_1 = 1.0 - omega;

    for (var d = 0u; d < 9u; d = d + 1u) {
        let cu = 3.0 * (f32(dx_lbm[d]) * ux + f32(dy_lbm[d]) * uy);
        let feq = w_lbm[d] * rho * (1.0 + cu + 0.5 * cu * cu - u2);
        data[get_f_idx(d, writeParity, strideFace, params.fBase, i)] = pf[d] * om_1 + feq * omega;
    }

    // Semi-Lagrangian Smoke
    let sx = f32(px) - ux; let sy = f32(py) - uy;
    let x0 = u32(clamp(floor(sx), 0.0, f32(pNx - 2u))); 
    let y0 = u32(clamp(floor(sy), 0.0, f32(pNy - 2u)));
    let fx = sx - f32(x0); let fy = sy - f32(y0);
    
    let srIdx = params.smokeReadIdx * strideFace;
    let s00 = data[srIdx + (y0 * pNx + x0)];   
    let s10 = data[srIdx + (y0 * pNx + x0 + 1u)];
    let s01 = data[srIdx + ((y0 + 1u) * pNx + x0)];   
    let s11 = data[srIdx + ((y0 + 1u) * pNx + x0 + 1u)];
    
    var rawS = (s00 * (1.0 - fx) + s10 * fx) * (1.0 - fy) + (s01 * (1.0 - fx) + s11 * fx) * fy;
    
    // Smoke smoothing (matching NeoAeroKernel.ts:214: 0.005 neighborAvg)
    let neighborAvg = (data[smokeReadIdx - 1u] + data[smokeReadIdx + 1u] + data[smokeReadIdx - pNx] + data[smokeReadIdx + pNx]) * 0.25;
    let finalS = (rawS * 0.995 + neighborAvg * 0.005) * 0.9999;
    
    data[smokeWriteIdx] = max(finalS, smokeInjection); 

    // 4. Vorticité (Curl of velocity field for visualization)
    let idx_xp = py * pNx + min(px + 1u, nx);
    let idx_xm = py * pNx + max(px - 1u, 1u);
    let idx_yp = min(py + 1u, ny) * pNx + px;
    let idx_ym = max(py - 1u, 1u) * pNx + px;

    let v_xp = data[params.vyReadIdx * strideFace + idx_xp];
    let v_xm = data[params.vyReadIdx * strideFace + idx_xm];
    let u_yp = data[params.vxReadIdx * strideFace + idx_yp];
    let u_ym = data[params.vxReadIdx * strideFace + idx_ym];

    data[vortWriteIdx] = (v_xp - v_xm) - (u_yp - u_ym);
}
