// Creates the `novair` database in MySQL, builds the tables from schema.sql and loads the SAMPLE data.
// Run:  npm run seed   (or npm run setup, which also generates the data and trains the models)
const fs = require('fs'), path = require('path');
const { hashPassword } = require('../backend/auth');
const { syncResources, rnd } = require('../backend/dbUtils');
const root = path.join(__dirname, '..');

async function seedData(db) {
  // users (DEMO credentials)
  for (const [e, n, r] of [['admin@novair.com', 'Administrator', 'Admin'], ['staff@novair.com', 'Field Staff', 'Staff'], ['citizen@novair.com', 'Citizen', 'Citizen']])
    await db.run('INSERT INTO users(email,name,password_hash,role) VALUES(?,?,?,?)', [e, n, hashPassword('NOVAIR@2026'), r]);

  // districts + hospitals, shelters, inventory, resources, responders
  const data = JSON.parse(fs.readFileSync(path.join(root, 'data', 'districts.json')));
  const ids = {};
  for (const d of data.districts) {
    const id = (await db.run('INSERT INTO districts(name,population_lakh,density,beds,ambulances,police,firefighters,rescue_teams,shelter_capacity,areas,gx,gy) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
      [d.name, d.pop, d.den, d.beds, d.amb, d.pol, d.fire, d.resc, d.shel, JSON.stringify(d.areas), d.x, d.y])).insertId;
    ids[d.name] = id;
    const main = rnd(d.beds * 0.6);
    await db.run('INSERT INTO hospitals(district_id,name,beds) VALUES(?,?,?)', [id, d.name + ' District Hospital', main]);
    await db.run('INSERT INTO hospitals(district_id,name,beds) VALUES(?,?,?)', [id, d.name + ' Other Hospitals', d.beds - main]);
    await db.run('INSERT INTO shelters(district_id,name,capacity,occupancy,facilities) VALUES(?,?,?,?,?)', [id, d.name + ' Relief Camp', d.shel, rnd(d.shel * 0.175), 'Medical, Food, Water']);
    const inv = { kits: rnd(d.beds / 4), food: d.pop * 1500, water: d.pop * 2500, blk: d.pop * 500, eq: d.resc * 40 };
    for (const [k, v] of Object.entries(inv)) await db.run('INSERT INTO inventory(district_id,item,stock,base) VALUES(?,?,?,?)', [id, k, v, v]);
    await syncResources(db, id);
  }
  for (const [a, b, km] of data.routes) await db.run('INSERT INTO routes(from_id,to_id,km) VALUES(?,?,?)', [ids[a], ids[b], km]);

  // simulated history that the models were trained on
  const lines = fs.readFileSync(path.join(root, 'data', 'historical_incidents.csv'), 'utf8').trim().split('\n').slice(1);
  for (const l of lines)
    await db.run('INSERT INTO historical_incidents(district,disaster_type,severity,water_level,rainfall,temperature,affected,density,prior_incidents,risk_class,injured) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
      l.split(',').map((v, i) => i < 2 ? v : +v));
  await db.run('INSERT INTO sensor_readings(ts,water_level,rainfall,temperature,crowd) VALUES(?,?,?,?,?)', [new Date().toISOString(), 1.2, 14, 33, 100]);
  return data.districts.length;
}

async function main() {
  const mysql = require('mysql2/promise'), cfg = require('../backend/config'), { wrap } = require('../backend/db');
  let conn;
  try {
    conn = await mysql.createConnection({ host: cfg.host, port: cfg.port, user: cfg.user, password: cfg.password, multipleStatements: true, charset: 'utf8mb4' });
  } catch (e) {
    console.error('\nCould not connect to MySQL: ' + e.message);
    console.error('Check that MySQL is running and that MYSQL_USER / MYSQL_PASSWORD in your .env file are correct.\n');
    process.exit(1);
  }
  await conn.query(`CREATE DATABASE IF NOT EXISTS \`${cfg.database}\` CHARACTER SET utf8mb4`);
  await conn.query(`USE \`${cfg.database}\``);
  await conn.query(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
  const n = await seedData(wrap(conn));
  console.log(`Database "${cfg.database}" created in MySQL with ${n} sample districts.`);
  await conn.end();
}

module.exports = { seedData };
if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
