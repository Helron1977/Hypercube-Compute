struct GpuObject {
    pos: vec2<f32>,
    dim: vec2<f32>,
    isObstacle: f32,
    isTempInjection: f32,
    objType: u32,
    _pad: u32
};

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
    tempReadIdx: u32,  // Slot 13
    _pad14: u32, _pad15: u32, _pad16: u32,
    tempWriteIdx: u32, // Slot 17
    _pad18: u32, _pad19: u32, _pad20: u32, _pad21: u32, _pad22: u32, _pad23: u32,
    _pad24: u32, _pad25: u32, _pad26: u32, _pad27: u32, _pad28: u32, _pad29: u32, _pad30: u32, _pad31: u32,
    objects: array<GpuObject, 8> // Slot 32
};

@group(0) @binding(0) var<storage, read_write> data: array<f32>;
@group(0) @binding(1) var<uniform> params: Params;

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    let nx = params.nx;
    let ny = params.ny;
    if (id.x >= nx || id.y >= ny) { return; }

    let px = id.x + 1u;
    let py = id.y + 1u;
    let pNx = nx + 2u;

    let i = py * pNx + px;
    let strideFace = params.strideFace;

    let obsIdx = params.obsIdx * strideFace + i;
    let tempReadIdx = params.tempReadIdx * strideFace + i;
    let tempWriteIdx = params.tempWriteIdx * strideFace + i;

    var injectionValue = -1.0;
    var isWall = data[obsIdx] > 0.5;

    for (var j = 0u; j < params.numObjects; j = j + 1u) {
        let obj = params.objects[j];
        var inObj = false;
        if (obj.objType == 1u) { // Circle
            let r = obj.dim.x * 0.5;
            let center = obj.pos + vec2<f32>(r, r);
            let ddx = f32(id.x) - center.x;
            let ddy = f32(id.y) - center.y;
            if (ddx*ddx + ddy*ddy <= r*r) { inObj = true; }
        } else if (obj.objType == 2u) { // Rect
            if (f32(id.x) >= obj.pos.x && f32(id.x) < obj.pos.x + obj.dim.x &&
                f32(id.y) >= obj.pos.y && f32(id.y) < obj.pos.y + obj.dim.y) { inObj = true; }
        }
        if (inObj) {
            if (obj.isObstacle > 0.5) { isWall = true; }
            if (obj.isTempInjection > 0.0) { injectionValue = obj.isTempInjection; }
        }
    }

    if (isWall) {
        data[tempWriteIdx] = 0.0;
        return;
    }

    if (injectionValue >= 0.0) {
        data[tempWriteIdx] = injectionValue;
        return;
    }

    let val = data[tempReadIdx];
    let diffusionRate = params.omega;

    // Laplacian stencil (weighted)
    let laplacian = (
        (data[tempReadIdx - 1u] + data[tempReadIdx + 1u] +
         data[tempReadIdx - pNx] + data[tempReadIdx + pNx]) * 0.5 +
        (data[tempReadIdx - pNx - 1u] + data[tempReadIdx - pNx + 1u] +
         data[tempReadIdx + pNx - 1u] + data[tempReadIdx + pNx + 1u]) * 0.25
    ) - 3.0 * val;

    var nextVal = val + diffusionRate * laplacian;

    if (id.x == 0u || id.x == nx - 1u || id.y == 0u || id.y == ny - 1u) {
        nextVal = nextVal * 0.98;
    }
    nextVal = nextVal * 0.999;

    data[tempWriteIdx] = max(0.0, nextVal);
}
