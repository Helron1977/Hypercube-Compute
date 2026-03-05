const fs = require('fs');
const path = require('path');

function walkDir(dir, callback) {
    fs.readdirSync(dir).forEach(f => {
        let dirPath = path.join(dir, f);
        let isDirectory = fs.statSync(dirPath).isDirectory();
        if (isDirectory) {
            walkDir(dirPath, callback);
        } else {
            callback(dirPath);
        }
    });
}

const targets = [
    path.join(__dirname, 'tests'),
    path.join(__dirname, '../hypercube-examples')
];

for (const target of targets) {
    walkDir(target, (filePath) => {
        if (!filePath.endsWith('.ts') && !filePath.endsWith('.js')) return;

        let content = fs.readFileSync(filePath, 'utf8');
        let modified = false;

        // Replace imports
        if (content.includes('HypercubeGrid')) {
            // For GPU specific tests, we need manual intervention, but for now we replace with CpuGrid unless it's obviously GPU
            if (filePath.includes('webgpu') || filePath.includes('gpu')) {
                // handle manually
            } else {
                content = content.replace(/import \{([^}]*)HypercubeGrid([^}]*)\} from/g, 'import {$1HypercubeCpuGrid$2} from');
                content = content.replace(/new HypercubeCpuGrid/g, 'new HypercubeCpuGrid');

                // Replace create calls and remove the 'cpu' argument
                // e.g. HypercubeCpuGrid.create(..., false) -> HypercubeCpuGrid.create(..., false)
                // e.g. HypercubeCpuGrid.create(...) -> HypercubeCpuGrid.create(...)
                let originalContent = content;
                content = content.replace(/HypercubeGrid\.create/g, 'HypercubeCpuGrid.create');

                content = content.replace(/,\s*'cpu'\s*,\s*(true|false)\s*\)/g, ', $1)');
                content = content.replace(/,\s*"cpu"\s*,\s*(true|false)\s*\)/g, ', $1)');
                content = content.replace(/,\s*'cpu'\s*\)/g, ')');
                content = content.replace(/,\s*"cpu"\s*\)/g, ')');

                if (content !== originalContent) {
                    modified = true;
                }
            }
        }

        if (modified) {
            fs.writeFileSync(filePath, content);
            console.log(`Refactored: ${filePath}`);
        }
    });
}
