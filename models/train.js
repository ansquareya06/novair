// Fits the prediction models on data/historical_incidents.csv (SIMULATED history) and writes models/coefficients.json.
//  1) Multinomial logistic regression  -> risk class   (batch gradient descent, small L2 penalty)
//  2) Poisson regression               -> injured count (IRLS / Newton-Raphson)
//  3) Overdispersion check             -> Pearson chi2 / df > 1.5 => use Negative Binomial (alpha by method of moments)
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const lines = fs.readFileSync(path.join(root, 'data', 'historical_incidents.csv'), 'utf8').trim().split('\n');
const head = lines[0].split(','), rows = lines.slice(1).map(l => { const v = l.split(','), o = {};
  head.forEach((h, i) => o[h] = isNaN(+v[i]) ? v[i] : +v[i]); return o; });

const RISK_F = ['severity', 'water_level', 'rainfall', 'heat_excess', 'log_affected', 'density_k', 'prior_incidents'];
const COUNT_F = ['severity', 'log_affected', 'water_level'];
const riskX = r => [r.severity, r.water_level, r.rainfall, Math.max(0, r.temperature - 35), Math.log1p(r.affected), r.density / 1000, r.prior_incidents];
const countX = r => [r.severity, Math.log1p(r.affected), r.water_level];

function standardize(X) {
  const f = X[0].length, mean = Array(f).fill(0), sd = Array(f).fill(0);
  X.forEach(x => x.forEach((v, j) => mean[j] += v / X.length));
  X.forEach(x => x.forEach((v, j) => sd[j] += (v - mean[j]) ** 2 / X.length));
  sd.forEach((v, j) => sd[j] = Math.sqrt(v) || 1);
  return { Z: X.map(x => x.map((v, j) => (v - mean[j]) / sd[j])), mean, sd };
}
// convert coefficients fitted on standardized inputs back to the raw scale
const unscale = (b0, w, mean, sd) => ({ b0: b0 - w.reduce((s, c, j) => s + c * mean[j] / sd[j], 0), w: w.map((c, j) => c / sd[j]) });
const softmax = z => { const m = Math.max(...z), e = z.map(v => Math.exp(v - m)), s = e.reduce((a, b) => a + b); return e.map(v => v / s); };

// ---- split: 80% train / 20% test (deterministic) ----
const train = rows.filter((_, i) => i % 5 !== 0), test = rows.filter((_, i) => i % 5 === 0);

// ---- 1) multinomial logistic regression ----
const K = 4, st = standardize(train.map(riskX)), F = RISK_F.length;
let W = Array.from({ length: K }, () => Array(F).fill(0)), B = Array(K).fill(0);
const lr = 0.2, lambda = 1e-3;
for (let it = 0; it < 4000; it++) {
  const gW = W.map(r => r.map(() => 0)), gB = Array(K).fill(0);
  st.Z.forEach((x, i) => {
    const p = softmax(W.map((w, k) => B[k] + w.reduce((s, c, j) => s + c * x[j], 0)));
    for (let k = 0; k < K; k++) { const e = p[k] - (train[i].risk_class === k ? 1 : 0); gB[k] += e / train.length;
      for (let j = 0; j < F; j++) gW[k][j] += e * x[j] / train.length; }
  });
  for (let k = 0; k < K; k++) { B[k] -= lr * gB[k]; for (let j = 0; j < F; j++) W[k][j] -= lr * (gW[k][j] + lambda * W[k][j]); }
}
const riskRaw = W.map((w, k) => unscale(B[k], w, st.mean, st.sd));
const predictClass = r => { const x = riskX(r), z = riskRaw.map(m => m.b0 + m.w.reduce((s, c, j) => s + c * x[j], 0)); return z.indexOf(Math.max(...z)); };
const accuracy = test.filter(r => predictClass(r) === r.risk_class).length / test.length;

// ---- 2) Poisson regression by IRLS ----
function solve(A, b) { const n = b.length, M = A.map((r, i) => [...r, b[i]]);
  for (let i = 0; i < n; i++) { let p = i; for (let r = i + 1; r < n; r++) if (Math.abs(M[r][i]) > Math.abs(M[p][i])) p = r;
    [M[i], M[p]] = [M[p], M[i]];
    for (let r = i + 1; r < n; r++) { const f = M[r][i] / M[i][i]; for (let c = i; c <= n; c++) M[r][c] -= f * M[i][c]; } }
  const x = Array(n).fill(0); for (let i = n - 1; i >= 0; i--) { x[i] = (M[i][n] - M.slice(i + 1).reduce((s, r, d) => s + r[i + 1 + d] * x[i + 1 + d], 0)) / M[i][i]; } return x; }
const sc = standardize(train.map(countX)), y = train.map(r => r.injured), P = COUNT_F.length + 1;
let beta = Array(P).fill(0); beta[0] = Math.log(y.reduce((a, b) => a + b, 0) / y.length);
const eta = (x, b) => Math.min(12, b[0] + x.reduce((s, v, j) => s + b[j + 1] * v, 0));
for (let it = 0; it < 30; it++) {
  const H = Array.from({ length: P }, () => Array(P).fill(0)), g = Array(P).fill(0);
  sc.Z.forEach((x, i) => { const xi = [1, ...x], mu = Math.exp(eta(x, beta));
    for (let a = 0; a < P; a++) { g[a] += (y[i] - mu) * xi[a]; for (let c = 0; c < P; c++) H[a][c] += mu * xi[a] * xi[c]; } });
  const step = solve(H, g); beta = beta.map((v, j) => v + step[j]);
}
const mus = sc.Z.map(x => Math.exp(eta(x, beta)));
const dof = train.length - P;
const pearson = y.reduce((s, yi, i) => s + (yi - mus[i]) ** 2 / mus[i], 0) / dof;           // ~1 for Poisson, >1 overdispersed
const alpha = Math.max(1e-6, y.reduce((s, yi, i) => s + ((yi - mus[i]) ** 2 - mus[i]) / mus[i] ** 2, 0) / dof);
const cRaw = unscale(beta[0], beta.slice(1), sc.mean, sc.sd);

const out = {
  trained_on: 'data/historical_incidents.csv (SIMULATED records)', trained_at: new Date().toISOString(),
  risk: { features: RISK_F, classes: ['Low', 'Medium', 'High', 'Critical'], intercepts: riskRaw.map(m => m.b0), coefs: riskRaw.map(m => m.w),
          n_train: train.length, test_accuracy: +accuracy.toFixed(3) },
  count: { features: COUNT_F, intercept: cRaw.b0, coefs: cRaw.w, dispersion: +pearson.toFixed(3), alpha: +alpha.toFixed(4),
           overdispersed: pearson > 1.5, n_train: train.length }
};
fs.writeFileSync(path.join(__dirname, 'coefficients.json'), JSON.stringify(out, null, 2));
console.log('Risk model test accuracy:', out.risk.test_accuracy);
console.log('Pearson dispersion:', out.count.dispersion, '=>', out.count.overdispersed ? 'Negative Binomial (alpha ' + out.count.alpha + ')' : 'Poisson');
