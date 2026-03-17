@group(0) @binding(1) var<storage, read_write> uCells: array<f32>;

// Config struct provided by GpuDispatcher at uniformObjectOffset
struct Config {
    nx: u32,
    ny: u32,
    nz: u32,
    padding: u32,
    tick: u32,
    // ... offsets for faces
    faces: array<u32, 8>
};
@group(0) @binding(0) var<uniform> config: Config;

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    let nx = config.nx;
    let ny = config.ny;
    let pNx = nx + 2u;
    
    let px = id.x + 1u;
    let py = id.y + 1u;
    
    if (id.x >= nx || id.y >= ny) { return; }
    
    let readOffset = config.faces[0];  // Ping
    let writeOffset = config.faces[1]; // Pong
    
    var neighbors = 0u;
    for (var dy = -1i; dy <= 1i; dy = dy + 1i) {
        for (var dx = -1i; dx <= 1i; dx = dx + 1i) {
            if (dx == 0i && dy == 0i) { continue; }
            let ni = u32(i32(py) + dy) * pNx + u32(i32(px) + dx);
            if (uCells[readOffset + ni] > 0.5) {
                neighbors = neighbors + 1u;
            }
        }
    }
    
    let i = py * pNx + px;
    let alive = uCells[readOffset + i] > 0.5;
    
    var nextState = 0.0;
    if (alive) {
        if (neighbors == 2u || neighbors == 3u) {
            nextState = 1.0;
        }
    } else {
        if (neighbors == 3u) {
            nextState = 1.0;
        }
    }
    
    uCells[writeOffset + i] = nextState;
}
