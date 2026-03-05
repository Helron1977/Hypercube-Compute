const fs = require('fs');
const path = require('path');

const testDir = path.join(__dirname, 'tests');
const files = fs.readdirSync(testDir).filter(f => f.endsWith('.test.ts'));

for (const file of files) {
    const filePath = path.join(testDir, file);
    let content = fs.readFileSync(filePath, 'utf8');

    if (file === 'webgpu-validation.test.ts') {
        content = content.replace(/'\.\.\/src\/core\/HypercubeGrid'/g, "'../src/core/HypercubeGpuGrid'");
        content = content.replace(/HypercubeGrid/g, "HypercubeGpuGrid");
    } else if (file === 'HypercubeGrid.test.ts') {
        content = content.replace(/'\.\.\/src\/core\/HypercubeGrid'/g, "'../src/core/HypercubeCpuGrid'");
        content = content.replace(/import \{ HypercubeGrid \} from/g, "import { HypercubeCpuGrid as HypercubeGrid } from");
    } else {
        content = content.replace(/'\.\.\/src\/core\/HypercubeGrid'/g, "'../src/core/HypercubeCpuGrid'");
    }

    fs.writeFileSync(filePath, content);
    console.log(`Fixed import in ${file}`);
}
