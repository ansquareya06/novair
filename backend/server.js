// NOVAIR web server: static files + JSON API (Node http) backed by MySQL.
const http = require('http'), fs = require('fs'), path = require('path');
const db = require('./db');
const auth = require('./auth');
const { handlers, HttpError } = require('./api');

const root = path.join(__dirname, '..');
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
const send = (res, status, body, type = 'application/json', extra = {}) => { res.writeHead(status, { 'Content-Type': type, ...extra }); res.end(body); };

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = ''; req.on('data', c => { data += c; if (data.length > 1e6) { reject(new HttpError(413, 'Body too large')); req.destroy(); } });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch { reject(new HttpError(400, 'Invalid JSON')); } });
  });
}

async function handleApi(req, res, url) {
  const token = auth.parseCookies(req.headers.cookie).novair_sid, user = auth.getSession(token);
  for (const [method, pattern, roles, fn] of handlers) {
    if (method !== req.method) continue;
    const m = typeof pattern === 'string' ? (url.pathname === pattern ? [] : null) : url.pathname.match(pattern);
    if (!m) continue;
    if (roles && !user) return send(res, 401, JSON.stringify({ error: 'Please log in' }));
    if (roles && !roles.includes(user.role)) return send(res, 403, JSON.stringify({ error: 'Not allowed for your role' }));
    let cookie = null;
    const session = { start: u => { cookie = `novair_sid=${auth.newSession(u)}; HttpOnly; SameSite=Lax; Path=/`; },
                      end: () => { auth.endSession(token); cookie = 'novair_sid=; Max-Age=0; Path=/'; } };
    try {
      const body = req.method === 'GET' ? {} : await readBody(req);
      const out = await fn({ db, user, params: m.slice(1), body, session });
      return send(res, 200, JSON.stringify(out), 'application/json', cookie ? { 'Set-Cookie': cookie } : {});
    } catch (e) {
      if (!(e instanceof HttpError)) console.error(e);
      return send(res, e.status || 500, JSON.stringify({ error: e instanceof HttpError ? e.message : 'Server error' }));
    }
  }
  send(res, 404, JSON.stringify({ error: 'Not found' }));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) return handleApi(req, res, url);
  const file = url.pathname === '/' ? path.join(root, 'templates', 'index.html') : path.join(root, url.pathname);
  if (!file.startsWith(path.join(root, 'static')) && !file.endsWith('index.html')) return send(res, 404, 'Not found', 'text/plain');
  fs.readFile(file, (err, data) => err ? send(res, 404, 'Not found', 'text/plain') : send(res, 200, data, MIME[path.extname(file)] || 'application/octet-stream'));
});

(async () => {
  try { await db.get('SELECT COUNT(*) AS c FROM districts'); }
  catch (e) {
    console.error('\nCould not read the NOVAIR database in MySQL: ' + e.message);
    console.error('Check that MySQL is running, that your details in .env are correct, and that you ran:  npm run setup\n');
    process.exit(1);
  }
  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => console.log(`NOVAIR running at http://localhost:${PORT}`));
})();
