// MySQL access layer (mysql2). Every helper is async.
//   db.all(sql, params) -> rows        db.get(sql, params) -> first row | undefined
//   db.run(sql, params) -> { insertId, affectedRows }
//   db.tx(async t => { ... })          -> runs the callback in a transaction (t has the same helpers)
const mysql = require('mysql2/promise');
const cfg = require('./config');

function wrap(conn) {
  const api = {
    async all(sql, params = []) { const [rows] = await conn.query(sql, params); return rows; },
    async get(sql, params = []) { return (await api.all(sql, params))[0]; },
    async run(sql, params = []) { const [r] = await conn.query(sql, params); return { insertId: Number(r.insertId), affectedRows: r.affectedRows }; },
    async exec(sql) { await conn.query(sql); }
  };
  return api;
}

const pool = mysql.createPool({ host: cfg.host, port: cfg.port, user: cfg.user, password: cfg.password, database: cfg.database,
  waitForConnections: true, connectionLimit: 10, charset: 'utf8mb4' });
const db = wrap(pool);
db.tx = async fn => {
  const conn = await pool.getConnection();
  try { await conn.beginTransaction(); const out = await fn(wrap(conn)); await conn.commit(); return out; }
  catch (e) { await conn.rollback(); throw e; }
  finally { conn.release(); }
};
db.wrap = wrap;
db.pool = pool;
module.exports = db;
