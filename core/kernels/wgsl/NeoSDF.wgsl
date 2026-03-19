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
    nz: u32,
    // [13-21] Unified Semantic Indices
    obsIdx: u32,
    vxReadIdx: u32,
    vyReadIdx: u32,
    rhoReadIdx: u32,
    bioReadIdx: u32,
    vxWriteIdx: u32,
    vyWriteIdx: u32,
    rhoWriteIdx: u32,
    bioWriteIdx: u32,
    fBase: u32,
    // [23+] Extensions (Slots 23-31 before objects at 32)
    jfaStep: u32,       
    baseX: u32,         
    leftRole: u32,      
    rightRole: u32,     
    topRole: u32,       
    bottomRole: u32,    
    frontRole: u32,     
    backRole: u32,      
    baseY: u32,         
    baseZ: u32,
    objects: array<GpuObject, 8> 
};

struct GpuObject {
    pos: vec3<f32>,
    dim: vec3<f32>,
    isObstacle: f32,
    biology: f32,
    objType: u32,
    rho: f32
};

@group(0) @binding(0) var<storage, read_write> data: array<f32>;
@group(0) @binding(1) var<uniform> params: Params;

fn get_idx(id: vec3<u32>) -> u32 {
    if (params.nz <= 1u) { return id.y * params.nx + id.x; }
    return (id.z * params.ny + id.y) * params.nx + id.x;
}

fn get_phys_idx(base_idx: u32, parity: u32, i: u32) -> u32 {
    let strideFace = params.strideFace;
    return (base_idx + parity) * strideFace + i;
}

fn distSq(p1: vec3<f32>, p2: vec3<f32>) -> f32 {
    if (p2.x < -9000.0) { return 1.0e20; }
    let d = p1 - p2;
    return dot(d, d);
}

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    let nx = params.nx;
    let ny = params.ny;
    let nz = params.nz;
    if (id.x >= nx || id.y >= ny || id.z >= nz) { return; }

    let readParity = params.currentTick % 2u;
    let writeParity = (params.currentTick + 1u) % 2u;
    
    let i = get_idx(id);
    let gPos = vec3<f32>(f32(id.x), f32(id.y), f32(id.z));

    let baseX = params.baseX;
    let baseY = params.baseY;
    let baseZ = params.baseZ;

    var bestSeed = vec3<f32>(
        data[get_phys_idx(baseX, readParity, i)],
        data[get_phys_idx(baseY, readParity, i)],
        0.0
    );
    if (nz > 1u) { bestSeed.z = data[get_phys_idx(baseZ, readParity, i)]; }
    
    var bestDist = distSq(gPos, bestSeed);
    let step = i32(params.jfaStep);
    let s = select(1i, step, step > 0);

    let dzMax = select(0i, 1i, nz > 1u);
    for (var dz = -dzMax; dz <= dzMax; dz++) {
        for (var dy = -1i; dy <= 1i; dy++) {
            for (var dx = -1i; dx <= 1i; dx++) {
                if (dx == 0 && dy == 0 && dz == 0) { continue; }
                let nix = i32(id.x) + dx * s;
                let niy = i32(id.y) + dy * s;
                let niz = i32(id.z) + dz * s;
                if (nix < 0 || nix >= i32(nx) || niy < 0 || niy >= i32(ny) || niz < 0 || niz >= i32(nz)) { continue; }
                
                let ni = get_idx(vec3<u32>(u32(nix), u32(niy), u32(niz)));
                var seed = vec3<f32>(
                    data[get_phys_idx(baseX, readParity, ni)],
                    data[get_phys_idx(baseY, readParity, ni)],
                    0.0
                );
                if (nz > 1u) { seed.z = data[get_phys_idx(baseZ, readParity, ni)]; }
                
                let d = distSq(gPos, seed);
                if (d < bestDist) { bestDist = d; bestSeed = seed; }
            }
        }
    }

    data[get_phys_idx(baseX, writeParity, i)] = bestSeed.x;
    data[get_phys_idx(baseY, writeParity, i)] = bestSeed.y;
    if (nz > 1u) { data[get_phys_idx(baseZ, writeParity, i)] = bestSeed.z; }
}
