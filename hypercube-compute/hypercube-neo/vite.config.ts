import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
    root: path.resolve(__dirname, 'showcase'),
    base: './',
    server: {
        port: 3001,
        headers: {
            'Cross-Origin-Opener-Policy': 'same-origin',
            'Cross-Origin-Embedder-Policy': 'require-corp',
        }
    },
    resolve: {
        alias: {
            '@core': path.resolve(__dirname, 'core'),
            '@io': path.resolve(__dirname, 'io'),
            '@helpers': path.resolve(__dirname, 'helpers')
        }
    }
});
