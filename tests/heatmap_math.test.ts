import { describe, it, expect } from 'vitest';

function calculateScore(
    criteria: { heat: number, threshold: number, weight: number }[]
): number {
    let sumW = 0;
    for (const c of criteria) sumW += c.weight;

    if (sumW === 0) return 1.0; // No constraints = all green

    let score = 0;
    for (const c of criteria) {
        if (c.weight === 0) continue;

        // Local satisfaction for this constraint
        let sLoc = (c.heat >= c.threshold) ? 1.0 : (c.heat / c.threshold);

        // Weight contribution
        score += (c.weight / sumW) * sLoc;
    }

    return score;
}

describe('Spatial Constraint Logic (Weighted Average)', () => {
    it('Should be 1.0 (All Green) if all weights are 0', () => {
        const score = calculateScore([
            { heat: 0, threshold: 0.1, weight: 0 },
            { heat: 0, threshold: 0.1, weight: 0 }
        ]);
        expect(score).toBe(1.0);
    });

    it('Should strictly drop to 0 if a single criterion is defined and not met', () => {
        // "critere 1 importance 1 dist 50 m" -> heat = 0 (not met)
        const score = calculateScore([
            { heat: 0.0, threshold: 0.1, weight: 1 }, // 50m threshold not met
            { heat: 1.0, threshold: 0.1, weight: 0 },
            { heat: 1.0, threshold: 0.1, weight: 0 }
        ]);
        expect(score).toBe(0.0);
    });

    it('Should be exactly 1.0 if a single criterion is defined and perfectly met', () => {
        // "critere 1 importance 1 dist 50 m" -> heat = 0.5 (met)
        const score = calculateScore([
            { heat: 0.5, threshold: 0.1, weight: 1 }, // 50m threshold met!
            { heat: 0.0, threshold: 0.1, weight: 0 },
            { heat: 0.0, threshold: 0.1, weight: 0 }
        ]);
        expect(score).toBe(1.0);
    });

    it('Should penalize heavily if high-importance criterion is missing, despite lower-importance being met', () => {
        // Metro (w=8, misses), School (w=1, hits)
        const score = calculateScore([
            { heat: 0.0, threshold: 0.1, weight: 8 }, // Metro not met!
            { heat: 1.0, threshold: 0.1, weight: 1 }  // School met
        ]);

        // Score should be 1/9 = 0.11
        expect(score).toBeCloseTo(0.111, 2);
    });

    it('Should stay quite high if high-importance criterion is met, despite lower-importance missing', () => {
        // Metro (w=8, hits), School (w=1, misses)
        const score = calculateScore([
            { heat: 1.0, threshold: 0.1, weight: 8 }, // Metro met!
            { heat: 0.0, threshold: 0.1, weight: 1 }  // School not met
        ]);

        // Score should be 8/9 = 0.88
        expect(score).toBeCloseTo(0.888, 2);
    });
});
