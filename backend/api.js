// API handlers. Each route: [method, pattern, allowedRoles | null, async handler(ctx)].
// ctx = { db, user, params, body, session: { start(user), end() } }
const M = require('../models/riskModel');
const { dijkstra, pathTo } = require('./routing');
const { syncResources, rnd } = require('./dbUtils');
const { verifyPassword } = require('./auth');

class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const LBL = { Admin: 'Administrator', Staff: 'Field Staff', Citizen: 'Citizen' };
const INAMES = { kits: 'Medical Kits', food: 'Food Packets', water: 'Water (L)', blk: 'Blankets', eq: 'Emergency Equipment' };
const FIELD = { pop: 'population_lakh', den: 'density', beds: 'beds', amb: 'ambulances', pol: 'police', fire: 'firefighters', resc: 'rescue_teams', shel: 'shelter_capacity' };
const RTYPES = ['Ambulance Teams', 'Doctors', 'Nurses', 'Rescue Teams', 'Police', 'Firefighters'];
const ceil = x => Math.ceil(x - 1e-9);
const nowT = () => new Date().toLocaleTimeString('en-GB');
const parse = (s, d) => { try { return JSON.parse(s); } catch { return d; } };
const num = (v, name, min = -Infinity, max = Infinity) => { const n = Number(v); if (!Number.isFinite(n) || n < min || n > max) throw new HttpError(400, 'Invalid ' + name); return n; };

// ---------- simulated sensors (random walk; NOT real hardware) ----------
const SENS = { wl: 1.2, rain: 14, temp: 33, crowd: 100 }; let lastStep = 0;
async function sensors(db) {
  if (Date.now() - lastStep > 2500) {
    lastStep = Date.now();
    SENS.wl = Math.max(0, SENS.wl + (Math.random() - 0.45) * 0.2); SENS.rain = Math.max(0, SENS.rain + (Math.random() - 0.5) * 4);
    SENS.temp += (Math.random() - 0.5) * 0.6; SENS.crowd += (Math.random() - 0.5) * 5;
    const r = await db.run('INSERT INTO sensor_readings(ts,water_level,rainfall,temperature,crowd) VALUES(?,?,?,?,?)', [new Date().toISOString(), SENS.wl, SENS.rain, SENS.temp, SENS.crowd]);
    await db.run('DELETE FROM sensor_readings WHERE id < ?', [r.insertId - 500]);            // keep the latest ~500 readings
  }
  return { ...SENS };
}

const log = (db, actor, text) => db.run('INSERT INTO activity_log(ts,actor,`text`) VALUES(?,?,?)', [nowT(), actor, text]);
const addAlert = (db, iid, did, level, title, msg) => db.run('INSERT INTO alerts(incident_id,district_id,level,title,message,created_at) VALUES(?,?,?,?,?,?)', [iid, did, level, title, msg, nowT()]);

// ---------- shaping rows for the frontend ----------
const prObj = p => ({ lg: parse(p.logits, []), p: parse(p.probs, []), cl: M.CLASSES, risk: p.risk, score: p.score, inj: p.expected_injured, model: p.count_model, mu: p.mean, vr: p.variance, dm: parse(p.demand, {}) });
const incObj = (i, p, dname) => ({ id: i.id, by: i.reported_role, d: dname, loc: i.area, type: i.type, date: i.date, time: i.time,
  i: { sev: i.severity, wl: i.water_level, rain: i.rainfall, temp: i.temperature, aff: i.affected }, rep: i.reported_injured, desc: i.description, pr: p ? prObj(p) : null });

async function buildState(db, user) {
  const citizen = user.role === 'Citizen';
  const ds = await db.all('SELECT * FROM districts ORDER BY id');
  const idx = {}, names = {}; ds.forEach((d, k) => { idx[d.id] = k; names[d.id] = d.name; });
  const preds = {}; (await db.all('SELECT * FROM predictions')).forEach(p => preds[p.incident_id] = p);
  let incs = await db.all('SELECT * FROM incidents ORDER BY id DESC');
  if (citizen) incs = incs.filter(i => i.reported_by === user.id);
  const latest = {}; incs.forEach(i => { if (!latest[i.district_id]) latest[i.district_id] = i; });
  const out = {}, inv = {}, base = {};
  (await db.all('SELECT * FROM responders')).forEach(r => (out[r.district_id] ||= {})[r.type] = r.deployed);
  (await db.all('SELECT * FROM inventory')).forEach(r => { (inv[r.district_id] ||= {})[r.item] = r.stock; (base[r.district_id] ||= {})[r.item] = r.base; });

  const districts = ds.map(d => {
    const li = citizen ? null : latest[d.id], p = li ? preds[li.id] : null;
    return { id: d.id, n: d.name, pop: d.population_lakh, den: d.density, beds: d.beds, amb: d.ambulances, pol: d.police, fire: d.firefighters, resc: d.rescue_teams,
      shel: d.shelter_capacity, x: d.gx, y: d.gy, risk: citizen ? 'Low' : d.risk, occ: d.occupancy, areas: parse(d.areas, []),
      out: out[d.id] || {}, inv: inv[d.id] || {}, base: base[d.id] || {},
      inc: li ? incObj(li, p, d.name) : null, pr: p ? prObj(p) : null, need: p ? parse(p.need, null) : null, alloc: p ? parse(p.alloc, null) : null };
  });
  const incidents = incs.map(i => incObj(i, preds[i.id], names[i.district_id]));
  const state = { districts, incidents, alerts: [], assignments: [], dem: [], feed: [], invlog: [] };
  if (citizen) return state;

  state.alerts = (await db.all('SELECT * FROM alerts ORDER BY id DESC LIMIT 60')).map(a => ({ lvl: a.level, d: names[a.district_id], t: a.title, m: a.message, time: a.created_at }));
  const last = await db.get('SELECT id FROM incidents ORDER BY id DESC LIMIT 1');
  if (last) {
    state.assignments = (await db.all('SELECT * FROM assignments WHERE incident_id=? ORDER BY id', [last.id])).map(a => ({
      id: a.id, type: a.type, from: names[a.station_id], si: idx[a.station_id], to: names[a.target_id], units: a.units, path: a.path, km: a.km, min: a.minutes,
      st: a.status, by: a.updated_by, at: a.updated_at }));
    const need = parse(preds[last.id]?.responder_need, {});
    state.dem = RTYPES.filter(t => t in need).map(t => {
      const sent = state.assignments.filter(a => a.type === t && a.st !== 'Completed').reduce((s, a) => s + a.units, 0);
      return [t, need[t], sent, Math.max(0, need[t] - sent)]; });
  }
  state.feed = (await db.all('SELECT * FROM activity_log ORDER BY id DESC LIMIT 30')).map(f => ({ t: f.ts, by: f.actor, text: f.text }));
  state.invlog = (await db.all('SELECT * FROM inventory_log ORDER BY id DESC LIMIT 30')).map(l => ({ t: l.ts, d: names[l.district_id], item: INAMES[l.item], act: l.action, q: l.qty, by: l.actor }));
  return state;
}

// ---------- shared helpers ----------
async function roadGraph(db) {
  const edges = (await db.all('SELECT from_id,to_id,km FROM routes')).map(r => [r.from_id, r.to_id, r.km]);
  const names = {}; (await db.all('SELECT id,name FROM districts')).forEach(d => names[d.id] = d.name);
  return { edges, names };
}
const minutesFor = km => km ? Math.round(km / 55 * 6000) / 100 : 10;

// responder allocation: nearest station with spare units first (Dijkstra distances); every station keeps 30% in reserve
async function allocate(db, iid, target, inj, aff, type) {
  const fire = type === 'Fire' || type === 'Industrial Accident';
  const needs = [['Ambulance Teams', ceil(inj / 10)], ['Doctors', ceil(inj / 15)], ['Nurses', ceil(inj / 6)],
    ['Rescue Teams', ceil(aff / 1500)], ['Police', ceil(aff / 800)], ['Firefighters', fire ? ceil(aff / 300) : ceil(aff / 4000)]];
  const { edges, names } = await roadGraph(db);
  const { dist, prev } = dijkstra(edges, target.id);
  const need = {}, short = [];
  for (const [t, n] of needs) {
    need[t] = n; let left = n;
    const stations = (await db.all('SELECT * FROM responders WHERE type=?', [t])).filter(r => dist[r.district_id] !== undefined)
      .sort((a, b) => dist[a.district_id] - dist[b.district_id]);
    for (const r of stations) {
      if (left <= 0) break;
      const take = Math.min(left, Math.floor(r.total * 0.7) - r.deployed);
      if (take <= 0) continue;
      const km = dist[r.district_id], route = pathTo(prev, target.id, r.district_id).reverse().map(id => names[id]);
      await db.run('INSERT INTO assignments(incident_id,type,station_id,target_id,units,path,km,minutes,status,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
        [iid, t, r.district_id, target.id, take, km ? route.join(' → ') : 'Within district', km, minutesFor(km), 'Dispatched', nowT()]);
      await db.run('UPDATE responders SET deployed=deployed+? WHERE id=?', [take, r.id]);
      await log(db, 'System', `${take} × ${t} dispatched from ${names[r.district_id]}`);
      left -= take;
    }
    if (left > 0) short.push([t, n, n - left, left]);
  }
  return { need, short };
}

const handlers = [
  ['POST', '/api/login', null, async ({ db, body, session }) => {
    const u = await db.get('SELECT * FROM users WHERE email=?', [String(body.email || '').trim().toLowerCase()]);
    if (!u || !verifyPassword(String(body.password || ''), u.password_hash)) throw new HttpError(401, 'Incorrect email or password.');
    session.start({ id: u.id, email: u.email, role: u.role, name: u.name });
    return { role: u.role, name: u.name, email: u.email };
  }],
  ['POST', '/api/logout', null, async ({ session }) => { session.end(); return { ok: true }; }],
  ['GET', '/api/me', ['Admin', 'Staff', 'Citizen'], async ({ user }) => ({ role: user.role, name: user.name, email: user.email })],
  ['GET', '/api/sensors', ['Admin', 'Staff', 'Citizen'], ({ db }) => sensors(db)],
  ['GET', '/api/state', ['Admin', 'Staff', 'Citizen'], ({ db, user }) => buildState(db, user)],

  // ---- incidents: save -> predict -> demand -> shortages -> alerts -> responder allocation (one transaction) ----
  ['POST', '/api/incidents', ['Admin', 'Citizen'], async ({ db, user, body: j }) => {
    const d0 = await db.get('SELECT * FROM districts WHERE name=?', [j.district]);
    if (!d0) throw new HttpError(400, 'Unknown district');
    const sev = num(j.severity, 'severity', 1, 4), aff = num(j.affected, 'people affected', 1, 5e6), rep = num(j.reported_injured || 0, 'reported injured', 0, 5e6);
    const wl = num(j.water_level ?? 0, 'water level', 0, 50), rain = num(j.rainfall ?? 0, 'rainfall', 0, 1000), temp = num(j.temperature ?? 32, 'temperature', -20, 60);
    const area = String(j.area || '').trim().slice(0, 80), type = String(j.type || 'Other').slice(0, 40);
    if (!area) throw new HttpError(400, 'Area is required');
    return db.tx(async t => {
      const d = await t.get('SELECT * FROM districts WHERE id=? FOR UPDATE', [d0.id]);
      const prior = (await t.get('SELECT COUNT(*) AS c FROM incidents WHERE district_id=?', [d.id])).c;
      // risk class: multinomial logistic regression
      const { classes, p, logits } = M.predictRisk(M.riskFeatures(sev, wl, rain, temp, aff, d.density, Number(prior)));
      const k = p.indexOf(Math.max(...p)), risk = classes[k], score = p.reduce((s, v, i) => s + v * i, 0);
      // injured count: Poisson / Negative Binomial
      const c = M.predictCount(M.countFeatures(sev, aff, wl)), inj = Math.round(c.mu);
      // resource demand vs availability
      const res = {}; (await t.all('SELECT name,total FROM resources WHERE district_id=?', [d.id])).forEach(r => res[r.name] = r.total);
      const dm = {
        'Ambulances': [ceil(inj / 10), res['Ambulances']], 'Hospital Beds': [ceil(inj * 0.7), rnd(res['Hospital Beds'] * 0.25)],
        'Doctors': [ceil(inj / 15), res['Doctors']], 'Medical Kits': [ceil(inj * 2), res['Medical Kits']],
        'Rescue Teams': [ceil(aff / 1500), res['Rescue Teams']], 'Shelter Places': [ceil(aff * 0.4), rnd(d.shelter_capacity * (1 - d.occupancy))],
        'Food Packets (x100)': [ceil(aff * 0.4 / 100 * 3), res['Food Packets (x100)']], 'Water (x100 L)': [ceil(aff * 0.4 * 3 / 100), res['Water (x100 L)']] };
      const need = { kits: ceil(inj * 2), food: ceil(aff * 3), water: ceil(aff * 4), blk: ceil(aff * 0.4), eq: ceil(aff / 500) };
      // save the incident, update the district and its shelter
      const iid = (await t.run('INSERT INTO incidents(district_id,area,type,`date`,`time`,severity,affected,reported_injured,water_level,rainfall,temperature,description,reported_by,reported_role,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        [d.id, area, type, String(j.date || ''), String(j.time || ''), sev, aff, rep, wl, rain, temp, String(j.description || '').slice(0, 500), user.id, user.role, new Date().toISOString()])).insertId;
      const areas = parse(d.areas, []); if (!areas.includes(area)) areas.push(area);
      const occ = Math.min(1, d.occupancy + 0.2);
      await t.run('UPDATE districts SET risk=?,occupancy=?,areas=? WHERE id=?', [risk, occ, JSON.stringify(areas), d.id]);
      const people = Math.min(d.shelter_capacity, rnd(d.shelter_capacity * occ * 0.5) + rnd(aff * 0.4));
      await t.run('UPDATE shelters SET occupancy=?,status=? WHERE district_id=?', [people, risk === 'Critical' ? 'Emergency' : people >= d.shelter_capacity ? 'Full' : people / d.shelter_capacity > 0.8 ? 'Near Capacity' : 'Available', d.id]);
      // alerts
      const pct = (p[k] * 100).toFixed(2);
      if (risk === 'Critical' || risk === 'High') await addAlert(t, iid, d.id, risk.toUpperCase(), risk + ' risk', `${type} at ${area}. Probability of ${risk}: ${pct}%`);
      if (inj > 150) await addAlert(t, iid, d.id, 'HIGH', 'High predicted injuries', `Predicted injured: ${inj}, reported: ${rep}`);
      for (const [name, [r, a]] of Object.entries(dm)) if (r > a)
        await addAlert(t, iid, d.id, name === 'Hospital Beds' || name === 'Ambulances' ? 'CRITICAL' : 'WARNING', 'Shortage: ' + name, `Required: ${r}, available: ${a}, shortage: ${r - a}`);
      if (dm['Shelter Places'][0] > dm['Shelter Places'][1]) await addAlert(t, iid, d.id, 'WARNING', 'Shelter capacity exceeded', d.name);
      const stock = {}; (await t.all('SELECT item,stock FROM inventory WHERE district_id=?', [d.id])).forEach(r => stock[r.item] = r.stock);
      for (const [key, n] of Object.entries(need)) if (n > stock[key]) await addAlert(t, iid, d.id, 'WARNING', 'Low inventory: ' + INAMES[key], `Required ${n}, in stock ${Math.round(stock[key])}`);
      // responder allocation
      const { need: rneed, short } = await allocate(t, iid, d, inj, aff, type);
      for (const [rt, n, sent, left] of short) await addAlert(t, iid, d.id, 'WARNING', 'Responder shortfall: ' + rt, `Required ${n}, deployable ${sent}, unmet ${left}`);
      await t.run('INSERT INTO predictions(incident_id,risk,probs,logits,score,expected_injured,count_model,mean,variance,demand,need,responder_need) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
        [iid, risk, JSON.stringify(p), JSON.stringify(logits), score, inj, c.model, c.mu, c.variance, JSON.stringify(dm), JSON.stringify(need), JSON.stringify(rneed)]);
      return { ok: true, incident_id: iid };
    });
  }],

  // ---- responders ----
  ['PUT', /^\/api\/assignments\/(\d+)$/, ['Admin', 'Staff'], async ({ db, user, params, body }) => {
    if (!['Dispatched', 'En route', 'On scene', 'Completed'].includes(body.status)) throw new HttpError(400, 'Invalid status');
    return db.tx(async t => {
      const a = await t.get('SELECT * FROM assignments WHERE id=?', [params[0]]);
      if (!a) throw new HttpError(404, 'Assignment not found');
      if (body.status === 'Completed' && a.status !== 'Completed') await t.run('UPDATE responders SET deployed=deployed-? WHERE district_id=? AND type=?', [a.units, a.station_id, a.type]);
      if (a.status === 'Completed' && body.status !== 'Completed') await t.run('UPDATE responders SET deployed=deployed+? WHERE district_id=? AND type=?', [a.units, a.station_id, a.type]);
      await t.run('UPDATE assignments SET status=?,updated_by=?,updated_at=? WHERE id=?', [body.status, LBL[user.role], nowT(), a.id]);
      const { names } = await roadGraph(t);
      await log(t, LBL[user.role], `${a.type} ×${a.units} (${names[a.station_id]} → ${names[a.target_id]}): ${body.status}`);
      return { ok: true };
    });
  }],
  ['POST', '/api/dispatch', ['Admin', 'Staff'], async ({ db, user, body }) => {          // set how many units of a type are being sent
    const type = body.type, v = Math.max(0, Math.round(num(body.units, 'units', 0, 100000)));
    if (!RTYPES.includes(type)) throw new HttpError(400, 'Unknown responder type');
    return db.tx(async t => {
      const last = await t.get('SELECT * FROM incidents ORDER BY id DESC LIMIT 1');
      if (!last) throw new HttpError(400, 'No active incident');
      const rows = await t.all("SELECT * FROM assignments WHERE incident_id=? AND type=? AND status<>'Completed'", [last.id, type]);
      const cur = rows.reduce((s, r) => s + r.units, 0);
      if (v < cur) {                                                                    // release from the farthest stations first
        let cut = cur - v;
        for (const r of rows.sort((a, b) => b.km - a.km)) {
          const c = Math.min(cut, r.units); cut -= c;
          await t.run('UPDATE assignments SET units=units-? WHERE id=?', [c, r.id]);
          await t.run('UPDATE responders SET deployed=deployed-? WHERE district_id=? AND type=?', [c, r.station_id, type]);
        }
        await t.run("DELETE FROM assignments WHERE incident_id=? AND type=? AND units<=0 AND status<>'Completed'", [last.id, type]);
      } else if (v > cur) {                                                             // add from the nearest stations with spare units
        let add = v - cur;
        const { edges, names } = await roadGraph(t);
        const { dist, prev } = dijkstra(edges, last.district_id);
        const stations = (await t.all('SELECT * FROM responders WHERE type=?', [type])).filter(r => dist[r.district_id] !== undefined).sort((a, b) => dist[a.district_id] - dist[b.district_id]);
        for (const r of stations) {
          if (add <= 0) break;
          const take = Math.min(add, Math.floor(r.total * 0.7) - r.deployed); if (take <= 0) continue;
          add -= take;
          const ex = rows.find(x => x.station_id === r.district_id);
          if (ex) await t.run('UPDATE assignments SET units=units+? WHERE id=?', [take, ex.id]);
          else { const km = dist[r.district_id], route = pathTo(prev, last.district_id, r.district_id).reverse().map(id => names[id]);
            await t.run('INSERT INTO assignments(incident_id,type,station_id,target_id,units,path,km,minutes,status,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
              [last.id, type, r.district_id, last.district_id, take, km ? route.join(' → ') : 'Within district', km, minutesFor(km), 'Dispatched', nowT()]); }
          await t.run('UPDATE responders SET deployed=deployed+? WHERE id=?', [take, r.id]);
        }
      }
      await log(t, LBL[user.role], `Now sending ${v} ${type}`);
      return { ok: true };
    });
  }],

  // ---- inventory ----
  ['POST', '/api/inventory', ['Admin', 'Staff'], async ({ db, user, body }) => {
    const d = await db.get('SELECT id FROM districts WHERE name=?', [body.district]);
    if (!d || !(body.item in INAMES)) throw new HttpError(400, 'Unknown district or item');
    if (!['Add', 'Issue'].includes(body.action)) throw new HttpError(400, 'Invalid action');
    const q = num(body.qty, 'quantity', 0.0001, 1e9);
    return db.tx(async t => {
      const row = await t.get('SELECT * FROM inventory WHERE district_id=? AND item=? FOR UPDATE', [d.id, body.item]);
      if (body.action === 'Issue' && q > row.stock) throw new HttpError(400, 'Cannot issue more than current stock (' + Math.round(row.stock) + ').');
      await t.run('UPDATE inventory SET stock=stock+? WHERE id=?', [body.action === 'Add' ? q : -q, row.id]);
      await t.run('INSERT INTO inventory_log(ts,district_id,item,action,qty,actor) VALUES(?,?,?,?,?,?)', [nowT(), d.id, body.item, body.action, q, LBL[user.role]]);
      await log(t, LBL[user.role], `${body.action} ${q} ${INAMES[body.item]} (${body.district})`);
      return { ok: true };
    });
  }],
  ['POST', '/api/inventory/allocate', ['Admin', 'Staff'], async ({ db, user, body }) => {  // deduct the predicted requirement of the latest incident
    const d = await db.get('SELECT * FROM districts WHERE name=?', [body.district]);
    if (!d) throw new HttpError(400, 'Unknown district');
    return db.tx(async t => {
      const p = await t.get('SELECT p.* FROM predictions p JOIN incidents i ON i.id=p.incident_id WHERE i.district_id=? ORDER BY i.id DESC LIMIT 1', [d.id]);
      if (!p || p.alloc) throw new HttpError(400, 'Nothing to allocate for this district');
      const need = parse(p.need, {}), alloc = {};
      for (const key of Object.keys(INAMES)) {
        const row = await t.get('SELECT * FROM inventory WHERE district_id=? AND item=? FOR UPDATE', [d.id, key]), al = Math.min(row.stock, need[key]);
        await t.run('UPDATE inventory SET stock=stock-? WHERE id=?', [al, row.id]); alloc[key] = al;
        if (al) await t.run('INSERT INTO inventory_log(ts,district_id,item,action,qty,actor) VALUES(?,?,?,?,?,?)', [nowT(), d.id, key, 'Allocated to incident', al, LBL[user.role]]);
      }
      await t.run('UPDATE predictions SET alloc=? WHERE id=?', [JSON.stringify(alloc), p.id]);
      await log(t, LBL[user.role], `Allocated stock to incident (${d.name})`);
      return { ok: true };
    });
  }],

  // ---- district data (admin) ----
  ['PUT', /^\/api\/districts\/(\d+)$/, ['Admin'], async ({ db, params, body }) => {
    const col = FIELD[body.field]; if (!col) throw new HttpError(400, 'Unknown field');
    const v = num(body.value, body.field, 0, 1e9);
    if (!(await db.get('SELECT id FROM districts WHERE id=?', [params[0]]))) throw new HttpError(404, 'District not found');
    return db.tx(async t => { await t.run(`UPDATE districts SET ${col}=? WHERE id=?`, [v, params[0]]); await syncResources(t, Number(params[0])); return { ok: true }; });
  }],
  ['POST', /^\/api\/districts\/(\d+)\/areas$/, ['Admin'], async ({ db, params, body }) => {
    const d = await db.get('SELECT areas FROM districts WHERE id=?', [params[0]]); if (!d) throw new HttpError(404, 'District not found');
    const area = String(body.area || '').trim().slice(0, 80), areas = parse(d.areas, []);
    if (area && !areas.includes(area)) { areas.push(area); await db.run('UPDATE districts SET areas=? WHERE id=?', [JSON.stringify(areas), params[0]]); }
    return { ok: true };
  }]
];
module.exports = { handlers, HttpError };
