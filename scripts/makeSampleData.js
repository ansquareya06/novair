// Generates SIMULATED historical incident records (data/historical_incidents.csv) used to fit the models.
// The records are synthetic: they are NOT real disaster history. A seeded PRNG keeps the output repeatable.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const districts = JSON.parse(fs.readFileSync(path.join(root, 'data', 'districts.json'))).districts;

let seed = 20260101;
const rand = () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const normal = () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
const gamma = (k) => { // Marsaglia-Tsang
  if (k < 1) return gamma(k + 1) * Math.pow(rand(), 1 / k);
  const d = k - 1 / 3, c = 1 / Math.sqrt(9 * d);
  for (;;) { let x, v; do { x = normal(); v = 1 + c * x; } while (v <= 0); v = v ** 3; const u = rand();
    if (Math.log(u) < 0.5 * x * x + d - d * v + d * Math.log(v)) return d * v; } };
const poisson = (lam) => { if (lam > 30) return Math.max(0, Math.round(lam + Math.sqrt(lam) * normal()));
  const L = Math.exp(-lam); let k = 0, p = 1; do { k++; p *= rand(); } while (p > L); return k - 1; };
const pick = (a) => a[Math.floor(rand() * a.length)];

const types = ['Flood', 'Fire', 'Earthquake', 'Heatwave', 'Storm', 'Landslide', 'Industrial Accident', 'Other'];
const rows = ['district,disaster_type,severity,water_level,rainfall,temperature,affected,density,prior_incidents,risk_class,injured'];
for (let n = 0; n < 600; n++) {
  const d = pick(districts), type = pick(types);
  const sev = 1 + Math.floor(Math.pow(rand(), 1.3) * 4);
  const flood = type === 'Flood' || type === 'Storm';
  const wl = +(flood ? rand() * 6 : rand() * 1.2).toFixed(2);
  const rain = +(flood ? rand() * 80 : rand() * 15).toFixed(2);
  const temp = +(type === 'Heatwave' || type === 'Fire' ? 36 + rand() * 11 : 24 + rand() * 12).toFixed(1);
  const aff = Math.round(Math.exp(5 + rand() * 4.8) * (0.5 + sev / 4));
  const prior = Math.floor(rand() * 4);
  const z = 0.9 * sev + 0.35 * wl + 0.012 * rain + 0.00008 * aff + 0.0004 * d.den + 0.04 * Math.max(0, temp - 35) + 0.3 * prior + 0.6 * normal();
  const risk = z < 2.5 ? 0 : z < 4 ? 1 : z < 5.5 ? 2 : 3;
  const mu = Math.exp(0.6 + 0.45 * sev + 0.45 * Math.log1p(aff) + 0.04 * wl - 0.8);
  const injured = poisson(mu * gamma(1 / 0.12) * 0.12); // gamma-Poisson = negative binomial (overdispersed)
  rows.push([d.name, type, sev, wl, rain, temp, aff, d.den, prior, risk, injured].join(','));
}
fs.writeFileSync(path.join(root, 'data', 'historical_incidents.csv'), rows.join('\n') + '\n');
console.log('Wrote data/historical_incidents.csv (' + (rows.length - 1) + ' simulated records)');
