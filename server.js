
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const Database = require('better-sqlite3');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const path = require('path');

const DB_PATH = path.join(__dirname, 'data', 'attendance.db');
const JWT_SECRET = process.env.JWT_SECRET || 'change_this_secret';
const PORT = process.env.PORT || 4000;

if (!fs.existsSync(path.join(__dirname, 'data'))) fs.mkdirSync(path.join(__dirname, 'data'));

// initialize DB if not exists
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS Users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  id_number TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  role TEXT NOT NULL DEFAULT 'developer',
  color TEXT DEFAULT '#2563eb',
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS Events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  event_date TEXT NOT NULL,
  start_time TEXT,
  end_time TEXT,
  type TEXT NOT NULL,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY(user_id) REFERENCES Users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS IX_Events_Date ON Events(event_date);
`);

// Ensure Users table has color column (for older DB versions)
try {
  const cols = db.prepare("PRAGMA table_info(Users)").all();
  const hasColor = cols.some(c => c.name === 'color');
  if (!hasColor) {
    db.exec("ALTER TABLE Users ADD COLUMN color TEXT DEFAULT '#2563eb';");
    console.log('Added color column to Users table');
  }
} catch (err) {
  console.error('Failed to ensure color column on Users table:', err);
}

// Ensure at least one staff (admin) user exists
try {
  const staffCount = db.prepare("SELECT COUNT(*) as c FROM Users WHERE role = 'staff'").get().c;
  if (staffCount === 0) {
    db.prepare(`
      INSERT OR IGNORE INTO Users (id_number, full_name, email, phone, role)
      VALUES ('000000000', 'Admin User', 'admin@example.com', '', 'staff')
    `).run();
    console.log('Seeded initial staff user with id_number 000000000');
  }
} catch (err) {
  console.error('Failed to ensure initial staff user:', err);
}


// helper functions
function generateToken(user) {
  const payload = { id: user.id, id_number: user.id_number, full_name: user.full_name, role: user.role, color: user.color };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '8h' });
}

function authenticateJWT(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ message: 'No token' });
  const token = auth.split(' ')[1];
  jwt.verify(token, JWT_SECRET, (err, payload) => {
    if (err) return res.status(403).json({ message: 'Invalid token' });
    req.user = payload;
    next();
  });
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: 'No token' });
    if (req.user.role !== role) return res.status(403).json({ message: 'Forbidden' });
    next();
  };
}

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'frontend')));

// AUTH: signup and login
app.post('/api/auth/signup', (req, res) => {
  try {
    const { id_number, full_name, email, phone } = req.body;
    if (!id_number || !full_name) return res.status(400).json({ message: 'Missing fields' });
    const exists = db.prepare('SELECT id, id_number, full_name, role, color FROM Users WHERE id_number = ?').get(id_number);
    if (exists) return res.status(400).json({ message: 'User already exists' });
    const info = db.prepare('INSERT INTO Users (id_number, full_name, email, phone) VALUES (?, ?, ?, ?)').run(id_number, full_name, email || null, phone || null);
    const user = db.prepare('SELECT id, id_number, full_name, role, color FROM Users WHERE id = ?').get(info.lastInsertRowid);
    const token = generateToken(user);
    res.json({ user, token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

app.post('/api/auth/login', (req, res) => {
  try {
    const { id_number } = req.body;
    if (!id_number) return res.status(400).json({ message: 'Missing id_number' });
    const user = db.prepare('SELECT id, id_number, full_name, role, color FROM Users WHERE id_number = ?').get(id_number);
    if (!user) return res.status(404).json({ message: 'User not found' });
    const token = generateToken(user);
    res.json({ user, token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Events endpoints
app.get('/api/events', authenticateJWT, (req, res) => {
  const rows = db.prepare(`
    SELECT e.id, e.event_date, e.start_time, e.end_time, e.type, e.notes,
           u.id_number as id_number, u.full_name as full_name, u.color as color
    FROM Events e JOIN Users u ON e.user_id = u.id
  `).all();
  res.json(rows);
});

app.get('/api/events/mine', authenticateJWT, (req, res) => {
  const user = db.prepare('SELECT id FROM Users WHERE id_number = ?').get(req.user.id_number);
  if (!user) return res.status(404).json({ message: 'User not found' });
  const rows = db.prepare(`
    SELECT e.id, e.event_date, e.start_time, e.end_time, e.type, e.notes, u.color as color
    FROM Events e JOIN Users u ON e.user_id = u.id
    WHERE e.user_id = ?
    ORDER BY e.event_date DESC
  `).all(user.id);
  res.json(rows);
});

app.post('/api/events', authenticateJWT, (req, res) => {
  try {
    const { event_date, start_time, end_time, type, notes, id_number_target } = req.body;
    const targetId = id_number_target || req.user.id_number;
    const target = db.prepare('SELECT id, id_number FROM Users WHERE id_number = ?').get(targetId);
    if (!target) return res.status(404).json({ message: 'Target user not found' });
    // role check
    if (req.user.role !== 'staff' && targetId !== req.user.id_number) return res.status(403).json({ message: 'Forbidden' });
    const info = db.prepare('INSERT INTO Events (user_id, event_date, start_time, end_time, type, notes) VALUES (?, ?, ?, ?, ?, ?)').run(target.id, event_date, start_time || null, end_time || null, type, notes || null);
    const ev = db.prepare('SELECT e.id, e.event_date, e.start_time, e.end_time, e.type, e.notes, u.id_number, u.full_name FROM Events e JOIN Users u ON e.user_id = u.id WHERE e.id = ?').get(info.lastInsertRowid);
    res.json(ev);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

app.put('/api/events/:id', authenticateJWT, (req, res) => {
  try {
    const id = parseInt(req.params.id,10);
    const evOwner = db.prepare('SELECT u.id_number FROM Events e JOIN Users u ON e.user_id = u.id WHERE e.id = ?').get(id);
    if (!evOwner) return res.status(404).json({ message: 'Event not found' });
    if (req.user.role !== 'staff' && req.user.id_number !== evOwner.id_number) return res.status(403).json({ message: 'Forbidden' });
    const { event_date, start_time, end_time, type, notes } = req.body;
    db.prepare('UPDATE Events SET event_date=?, start_time=?, end_time=?, type=?, notes=? WHERE id=?').run(event_date, start_time || null, end_time || null, type, notes || null, id);
    const updated = db.prepare('SELECT * FROM Events WHERE id = ?').get(id);
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

app.delete('/api/events/:id', authenticateJWT, (req, res) => {
  try {
    const id = parseInt(req.params.id,10);
    const evOwner = db.prepare('SELECT u.id_number FROM Events e JOIN Users u ON e.user_id = u.id WHERE e.id = ?').get(id);
    if (!evOwner) return res.status(404).json({ message: 'Event not found' });
    if (req.user.role !== 'staff' && req.user.id_number !== evOwner.id_number) return res.status(403).json({ message: 'Forbidden' });
    db.prepare('DELETE FROM Events WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Color management
app.put('/api/users/me/color', authenticateJWT, (req, res) => {
  try {
    const { color } = req.body;
    if (!color) return res.status(400).json({ message: 'Missing color' });
    db.prepare('UPDATE Users SET color = ? WHERE id_number = ?').run(color, req.user.id_number);
    const user = db.prepare('SELECT id, id_number, full_name, role, color FROM Users WHERE id_number = ?').get(req.user.id_number);
    const token = generateToken(user);
    res.json({ user, token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

app.put('/api/users/:id/color', authenticateJWT, requireRole('staff'), (req, res) => {
  try {
    const id = parseInt(req.params.id,10);
    const { color } = req.body;
    if (!color) return res.status(400).json({ message: 'Missing color' });
    db.prepare('UPDATE Users SET color = ? WHERE id = ?').run(color, id);
    const user = db.prepare('SELECT id, id_number, full_name, role, color FROM Users WHERE id = ?').get(id);
    res.json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Users endpoints (staff only)
app.get('/api/users', authenticateJWT, requireRole('staff'), (req, res) => {
  const rows = db.prepare('SELECT id, id_number, full_name, email, phone, role, color, created_at FROM Users').all();
  res.json(rows);
});

app.put('/api/users/:id/role', authenticateJWT, requireRole('staff'), (req, res) => {
  const id = parseInt(req.params.id,10);
  const { role } = req.body;
  if (!['developer','staff'].includes(role)) return res.status(400).json({ message: 'Invalid role' });
app.delete('/api/users/:id', authenticateJWT, requireRole('staff'), (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ message: 'Invalid user id' });
    }
    // prevent deleting current logged-in user
    if (req.user && req.user.id === id) {
      return res.status(400).json({ message: 'לא ניתן למחוק את המשתמש שמחובר כרגע' });
    }
    // delete events of user
    db.prepare('DELETE FROM Events WHERE user_id = ?').run(id);
    const info = db.prepare('DELETE FROM Users WHERE id = ?').run(id);
    if (info.changes === 0) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});


  db.prepare('UPDATE Users SET role = ? WHERE id = ?').run(role, id);
  const u = db.prepare('SELECT id, id_number, full_name, role FROM Users WHERE id = ?').get(id);
  res.json(u);
});

// health

app.get('/api/events/export', authenticateJWT, requireRole('staff'), (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT
        e.id           AS event_id,
        u.id_number    AS id_number,
        u.full_name    AS full_name,
        e.event_date   AS event_date,
        e.start_time   AS start_time,
        e.end_time     AS end_time,
        e.type         AS type,
        e.notes        AS notes
      FROM Events e
      JOIN Users u ON e.user_id = u.id
      ORDER BY e.event_date, u.full_name
    `).all();

    const headers = [
      'event_id',
      'id_number',
      'full_name',
      'event_date',
      'start_time',
      'end_time',
      'type',
      'notes'
    ];

    const escapeCsv = (value) => {
      if (value === null || value === undefined) return '';
      const s = String(value).replace(/"/g, '""');
      return '"' + s + '"';
    };

    const lines = [];
    lines.push(headers.map(escapeCsv).join(','));

    for (const row of rows) {
      const line = headers.map(h => escapeCsv(row[h])).join(',');
      lines.push(line);
    }

    const csv = lines.join('\r\n');
    const today = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="team-calendar-' + today + '.csv"');
    res.send(csv);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error while exporting events' });
  }
});

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.listen(PORT, () => console.log('Server running on port', PORT));
