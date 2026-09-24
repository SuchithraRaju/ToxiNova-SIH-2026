const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || 'toxinova-sih-demo-secret-change-for-production';
const FRONTEND = path.join(__dirname, '..', 'frontend');
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'database.json');

app.use(cors());
app.use(express.json({ limit: '10mb' }));

const defaultDb = {
  users: [
    { id: 1, username: 'admin', role: 'admin', passwordHash: bcrypt.hashSync('admin123', 10) },
    { id: 2, username: 'supervisor', role: 'supervisor', passwordHash: bcrypt.hashSync('super123', 10) },
    { id: 3, username: 'worker', role: 'worker', passwordHash: bcrypt.hashSync('worker123', 10) }
  ],
  workers: [
    { id: 'W-128', name: 'Worker 128', department: 'Refinery', active: true },
    { id: 'W-129', name: 'Worker 129', department: 'Refinery', active: true },
    { id: 'W-130', name: 'Worker 130', department: 'Maintenance', active: true }
  ],
  calibration: [
    { de: 0, dose: 0 }, { de: 15, dose: 5 }, { de: 30, dose: 10 },
    { de: 45, dose: 20 }, { de: 60, dose: 35 }, { de: 75, dose: 55 }
  ],
  records: [
    { id: 'W-128', date: '07 Sep 2026 · 08:30', dose: 12.6, twa: 1.58, status: 'Synced', source: 'demo' },
    { id: 'W-129', date: '07 Sep 2026 · 09:10', dose: 24.8, twa: 3.10, status: 'Synced', source: 'demo' },
    { id: 'W-130', date: '07 Sep 2026 · 10:00', dose: 31.2, twa: 3.90, status: 'Synced', source: 'demo' }
  ]
};

function ensureDb() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify(defaultDb, null, 2));
    return;
  }

  let db;
  try { db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
  catch { db = {}; }

  let changed = false;
  for (const key of ['users', 'workers', 'calibration', 'records']) {
    if (!Array.isArray(db[key]) || (key === 'users' && db[key].length === 0)) {
      db[key] = defaultDb[key];
      changed = true;
    }
  }
  if (changed) writeDb(db);
}
function readDb() { ensureDb(); return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
function writeDb(db) { fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); }
function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { return res.status(401).json({ error: 'Invalid or expired token' }); }
}
function role(...roles) { return (req, res, next) => roles.includes(req.user.role) ? next() : res.status(403).json({ error: 'Insufficient permission' }); }

app.get('/api/health', (req, res) => res.json({ ok: true, service: 'ToxiNova API', time: new Date().toISOString() }));

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  const db = readDb();
  const user = db.users.find(u => u.username === username);
  if (!user || !bcrypt.compareSync(password || '', user.passwordHash)) return res.status(401).json({ error: 'Invalid username or password' });
  const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '8h' });
  res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
});

app.get('/api/me', auth, (req, res) => res.json(req.user));

app.get('/api/calibration', auth, (req, res) => {
  const db = readDb();
  res.json({ points: db.calibration, source: 'prototype calibration dataset', validated: false });
});

app.put('/api/calibration', auth, role('admin'), (req, res) => {
  const points = Array.isArray(req.body.points) ? req.body.points : [];
  if (!points.length || points.some(p => !Number.isFinite(Number(p.de)) || !Number.isFinite(Number(p.dose)))) return res.status(400).json({ error: 'Invalid calibration points' });
  const db = readDb(); db.calibration = points.map(p => ({ de: Number(p.de), dose: Number(p.dose) })).sort((a,b)=>a.de-b.de); writeDb(db);
  res.json({ points: db.calibration });
});

app.get('/api/workers', auth, (req, res) => res.json(readDb().workers));
app.post('/api/workers', auth, role('admin','supervisor'), (req, res) => {
  const { id, name, department } = req.body || {};
  if (!id || !name) return res.status(400).json({ error: 'Worker ID and name are required' });
  const db = readDb(); if (db.workers.some(w => w.id === id)) return res.status(409).json({ error: 'Worker already exists' });
  const worker = { id, name, department: department || 'General', active: true }; db.workers.push(worker); writeDb(db); res.status(201).json(worker);
});

app.get('/api/records', auth, (req, res) => res.json(readDb().records));
app.post('/api/records', auth, (req, res) => {
  const r = req.body || {};
  if (!r.id || !Number.isFinite(Number(r.dose)) || !Number.isFinite(Number(r.twa))) return res.status(400).json({ error: 'Invalid exposure record' });
  const db = readDb();
  const record = { id: String(r.id), date: r.date || new Date().toISOString(), dose: Number(r.dose), twa: Number(r.twa), status: 'Synced', source: 'prototype' };
  db.records.push(record); writeDb(db); res.status(201).json(record);
});

app.post('/api/sync', auth, (req, res) => {
  const incoming = Array.isArray(req.body.records) ? req.body.records : [];
  const db = readDb(); let added = 0;
  for (const r of incoming) {
    if (!r || !r.id || !Number.isFinite(Number(r.dose)) || !Number.isFinite(Number(r.twa))) continue;
    const exists = db.records.some(x => x.id === r.id && x.date === r.date && Math.abs(Number(x.dose)-Number(r.dose)) < 0.001);
    if (!exists) { db.records.push({ id: String(r.id), date: r.date || new Date().toISOString(), dose: Number(r.dose), twa: Number(r.twa), status: 'Synced', source: 'offline-sync' }); added++; }
  }
  writeDb(db); res.json({ ok: true, added, records: db.records });
});

app.get('/api/hse', auth, role('admin','supervisor'), (req, res) => {
  const db = readDb();
  const records = db.records.slice().reverse();
  const pending = records.filter(r => r.status !== 'Synced').length;
  const high = records.filter(r => Number(r.twa) >= 4).length;
  res.json({ activeWorkers: db.workers.filter(w=>w.active).length, highPriority: high, pendingSync: pending, twaWindow: 8, records });
});

app.use(express.static(FRONTEND));
app.get('*', (req, res) => res.sendFile(path.join(FRONTEND, 'index.html')));

ensureDb();
app.listen(PORT, () => console.log(`ToxiNova full-stack server running at http://localhost:${PORT}`));
