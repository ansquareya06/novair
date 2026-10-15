// Prediction models used by the server. Coefficients come from models/coefficients.json (written by models/train.js).
//  - Risk class: multinomial logistic regression (Low / Medium / High / Critical)
//  - Injury count: Poisson regression, or Negative Binomial when the training data is overdispersed
const fs = require('fs'), path = require('path');
const C = JSON.parse(fs.readFileSync(path.join(__dirname, 'coefficients.json'), 'utf8'));
const CLASSES = ['Low', 'Medium', 'High', 'Critical'];

const riskFeatures = (sev, wl, rain, temp, aff, density, prior) =>
  [sev, wl, rain, Math.max(0, temp - 35), Math.log1p(aff), density / 1000, prior];
const countFeatures = (sev, aff, wl) => [sev, Math.log1p(aff), wl];

function softmax(z) {
  const m = Math.max(...z), e = z.map(v => Math.exp(v - m)), s = e.reduce((a, b) => a + b, 0);
  return e.map(v => v / s);
}

function predictRisk(x) {
  const logits = C.risk.coefs.map((row, k) => C.risk.intercepts[k] + row.reduce((s, c, j) => s + c * x[j], 0));
  return { classes: CLASSES, p: softmax(logits), logits };
}

function predictCount(x) {
  const eta = Math.min(12, C.count.intercept + C.count.coefs.reduce((s, c, j) => s + c * x[j], 0));
  const mu = Math.exp(eta);
  const nb = C.count.overdispersed;                 // Var = mu (Poisson)  |  Var = mu + alpha*mu^2 (Neg. Binomial)
  return { mu, variance: nb ? mu + C.count.alpha * mu * mu : mu, model: nb ? 'Negative Binomial' : 'Poisson' };
}

module.exports = { CLASSES, riskFeatures, countFeatures, predictRisk, predictCount, info: C };
