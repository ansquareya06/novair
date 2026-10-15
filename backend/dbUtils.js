// Keeps the `resources` and `responders` tables in step with the `districts` table.
const rnd = x => Math.floor(x + 0.5);

async function setRow(db, table, col, did, key, total) {
  const r = await db.run(`UPDATE ${table} SET total=? WHERE district_id=? AND ${col}=?`, [total, did, key]);
  if (!r.affectedRows) {
    const exists = await db.get(`SELECT id FROM ${table} WHERE district_id=? AND ${col}=?`, [did, key]);   // same value => 0 rows changed
    if (!exists) await db.run(`INSERT INTO ${table}(district_id,${col},total) VALUES(?,?,?)`, [did, key, total]);
  }
}

async function syncResources(db, id) {
  const d = await db.get('SELECT * FROM districts WHERE id=?', [id]);
  const resources = {
    'Ambulances': d.ambulances, 'Hospital Beds': d.beds, 'Doctors': rnd(d.beds / 12), 'Nurses': rnd(d.beds / 6),
    'Medical Kits': rnd(d.beds / 2), 'Firefighters': d.firefighters, 'Police': d.police, 'Rescue Teams': d.rescue_teams,
    'Food Packets (x100)': rnd(d.population_lakh * 3), 'Water (x100 L)': rnd(d.population_lakh * 4)
  };
  for (const [n, t] of Object.entries(resources)) await setRow(db, 'resources', 'name', id, n, t);
  const responders = {
    'Ambulance Teams': d.ambulances, 'Doctors': rnd(d.beds / 12), 'Nurses': rnd(d.beds / 6),
    'Rescue Teams': d.rescue_teams, 'Police': d.police, 'Firefighters': d.firefighters
  };
  for (const [n, t] of Object.entries(responders)) await setRow(db, 'responders', 'type', id, n, t);
}
module.exports = { syncResources, rnd };
