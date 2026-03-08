
const ITERATIONS = 1000000;
const obstacles = new Float32Array(ITERATIONS + 1);
const f_in = Array.from({ length: 9 }, () => new Float32Array(ITERATIONS + 1));
const opp = [0, 3, 4, 1, 2, 7, 8, 5, 6];

function benchmarkClosure() {
    const start = Date.now();
    for (let i = 1; i < ITERATIONS; i++) {
        const stream = (k, ni) => {
            const oppK = opp[k];
            const obsN = obstacles[ni];
            return f_in[k][ni] * (1.0 - obsN) + f_in[oppK][i] * obsN;
        };
        const val = stream(1, i - 1);
    }
    return Date.now() - start;
}

function benchmarkInline() {
    const start = Date.now();
    for (let i = 1; i < ITERATIONS; i++) {
        const k = 1;
        const ni = i - 1;
        const oppK = opp[k];
        const obsN = obstacles[ni];
        const val = f_in[k][ni] * (1.0 - obsN) + f_in[oppK][i] * obsN;
    }
    return Date.now() - start;
}

console.log("Starting micro-benchmark...");
const t1 = benchmarkClosure();
console.log(`Closure-based: ${t1.toFixed(2)}ms`);
const t2 = benchmarkInline();
console.log(`Inline-based: ${t2.toFixed(2)}ms`);
console.log(`Ratio: ${(t1 / t2).toFixed(2)}x slowdown`);
