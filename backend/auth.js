// Password hashing (scrypt) and in-memory sessions. No external packages.
const crypto = require('crypto');
function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  return salt.toString('hex') + ':' + crypto.scryptSync(pw, salt, 32).toString('hex');
}
function verifyPassword(pw, stored) {
  const [salt, hash] = stored.split(':');
  const test = crypto.scryptSync(pw, Buffer.from(salt, 'hex'), 32);
  return crypto.timingSafeEqual(test, Buffer.from(hash, 'hex'));
}
const sessions = new Map();               // token -> { id, email, role, name }
const newSession = user => { const t = crypto.randomBytes(24).toString('hex'); sessions.set(t, user); return t; };
const getSession = token => sessions.get(token);
const endSession = token => sessions.delete(token);
function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').map(c => c.trim().split('=')).filter(p => p[0]).map(([k, ...v]) => [k, v.join('=')]));
}
module.exports = { hashPassword, verifyPassword, newSession, getSession, endSession, parseCookies };
