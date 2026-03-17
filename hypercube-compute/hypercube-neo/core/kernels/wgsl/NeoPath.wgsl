@group(0) @binding(1) var<storage, read_write> uData: array<f32>;

struct Config {
    nx: u32,
    ny: u32,
    nz: u32,
    padding: u32,
    tick: u32,
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
    
    let distRead = config.faces[0];
    let distWrite = config.faces[1];
    let obsOffset = config.faces[2];
    
    let i = py * pNx + px;
    
    if (uData[obsOffset + i] > 0.5) {
        uData[distWrite + i] = 1000000.0;
        return;
    }
    
    var minDist = uData[distRead + i];
    
    // Check neighbors
    let n1 = (py - 1u) * pNx + px;
    let n2 = (py + 1u) * pNx + px;
    let n3 = py * pNx + (px - 1u);
    let n4 = py * pNx + (px + 1u);
    
    minDist = min(minDist, uData[distRead + n1] + 1.0);
    minDist = min(minDist, uData[distRead + n2] + 1.0);
    minDist = min(minDist, uData[distRead + n3] + 1.0);
    minDist = min(minDist, uData[distRead + n4] + 1.0);
    
    uData[distWrite + i] = minDist;
}
