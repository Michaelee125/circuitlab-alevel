/**
 * Dense Gaussian elimination with partial pivoting. Circuits in a teaching lab
 * are small (tens of nodes), so a dense solver keeps the engine dependency-free
 * and deterministic.
 */
export interface LinearSolution {
  x: number[];
  singular: boolean;
}

export function solveLinear(A: number[][], b: number[]): LinearSolution {
  const n = b.length;
  if (n === 0) return { x: [], singular: false };

  let maxAbs = 0;
  for (const row of A) for (const value of row) maxAbs = Math.max(maxAbs, Math.abs(value));
  if (!Number.isFinite(maxAbs) || maxAbs === 0) {
    return { x: new Array(n).fill(0), singular: true };
  }
  const tolerance = Math.max(1e-13, maxAbs * 1e-12);

  const M: number[][] = A.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    let best = Math.abs(M[col][col]);
    for (let row = col + 1; row < n; row += 1) {
      const value = Math.abs(M[row][col]);
      if (value > best) {
        best = value;
        pivot = row;
      }
    }
    if (best < tolerance) return { x: new Array(n).fill(0), singular: true };
    if (pivot !== col) {
      const tmp = M[pivot];
      M[pivot] = M[col];
      M[col] = tmp;
    }
    const diag = M[col][col];
    for (let row = col + 1; row < n; row += 1) {
      const factor = M[row][col] / diag;
      if (factor === 0) continue;
      for (let c = col; c <= n; c += 1) M[row][c] -= factor * M[col][c];
    }
  }

  const x = new Array(n).fill(0);
  for (let row = n - 1; row >= 0; row -= 1) {
    let sum = M[row][n];
    for (let c = row + 1; c < n; c += 1) sum -= M[row][c] * x[c];
    x[row] = sum / M[row][row];
  }
  for (const value of x) {
    if (!Number.isFinite(value)) return { x: new Array(n).fill(0), singular: true };
  }
  return { x, singular: false };
}

/** Ordinary least squares line fit, used by the internal-resistance experiment. */
export function linearFit(points: { x: number; y: number }[]): {
  slope: number;
  intercept: number;
  r2: number;
} {
  const n = points.length;
  if (n < 2) return { slope: 0, intercept: 0, r2: 0 };
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (const p of points) {
    sx += p.x;
    sy += p.y;
    sxx += p.x * p.x;
    sxy += p.x * p.y;
    syy += p.y * p.y;
  }
  const denom = n * sxx - sx * sx;
  if (Math.abs(denom) < 1e-18) return { slope: 0, intercept: sy / n, r2: 0 };
  const slope = (n * sxy - sx * sy) / denom;
  const intercept = (sy - slope * sx) / n;
  const ssTot = syy - (sy * sy) / n;
  const ssRes = points.reduce((acc, p) => {
    const predicted = slope * p.x + intercept;
    return acc + (p.y - predicted) ** 2;
  }, 0);
  const r2 = ssTot > 1e-18 ? 1 - ssRes / ssTot : 1;
  return { slope, intercept, r2 };
}
