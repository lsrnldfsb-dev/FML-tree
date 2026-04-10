const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const app = express();
const PORT = process.env.PORT || 3000;

// Create required directories
const dbDir = path.join(__dirname, 'db');
const uploadsDir = path.join(__dirname, 'public', 'uploads');
[dbDir, uploadsDir].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Database setup
const db = new Database(path.join(dbDir, 'family.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS members (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT    NOT NULL,
    birth_date TEXT,
    death_date TEXT,
    gender     TEXT    DEFAULT 'unknown',
    bio        TEXT,
    photo      TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS relationships (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    person1_id  INTEGER NOT NULL,
    person2_id  INTEGER NOT NULL,
    type        TEXT    NOT NULL CHECK(type IN ('parent-child','spouse')),
    UNIQUE(person1_id, person2_id, type),
    FOREIGN KEY (person1_id) REFERENCES members(id) ON DELETE CASCADE,
    FOREIGN KEY (person2_id) REFERENCES members(id) ON DELETE CASCADE
  );
`);

// File upload config
const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `member-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpeg|png|gif|webp)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only JPEG, PNG, GIF, or WebP images are allowed'));
  }
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Members ────────────────────────────────────────────────────────────────

app.get('/api/members', (_req, res) => {
  res.json(db.prepare('SELECT * FROM members ORDER BY name COLLATE NOCASE').all());
});

app.get('/api/members/:id', (req, res) => {
  const member = db.prepare('SELECT * FROM members WHERE id = ?').get(req.params.id);
  if (!member) return res.status(404).json({ error: 'Member not found' });
  res.json(member);
});

app.post('/api/members', upload.single('photo'), (req, res) => {
  try {
    const { name, birth_date, death_date, gender, bio } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });
    const photo = req.file ? `/uploads/${req.file.filename}` : null;
    const result = db.prepare(
      `INSERT INTO members (name, birth_date, death_date, gender, bio, photo)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(name.trim(), birth_date || null, death_date || null, gender || 'unknown', bio?.trim() || null, photo);
    res.status(201).json(db.prepare('SELECT * FROM members WHERE id = ?').get(result.lastInsertRowid));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/members/:id', upload.single('photo'), (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM members WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Member not found' });
    const { name, birth_date, death_date, gender, bio, remove_photo } = req.body;
    let photo = existing.photo;
    if (req.file) photo = `/uploads/${req.file.filename}`;
    else if (remove_photo === 'true') photo = null;
    db.prepare(
      `UPDATE members
       SET name=?, birth_date=?, death_date=?, gender=?, bio=?, photo=?,
           updated_at=CURRENT_TIMESTAMP
       WHERE id=?`
    ).run(
      name?.trim() || existing.name,
      birth_date !== undefined ? (birth_date || null) : existing.birth_date,
      death_date !== undefined ? (death_date || null) : existing.death_date,
      gender || existing.gender,
      bio !== undefined ? (bio?.trim() || null) : existing.bio,
      photo,
      req.params.id
    );
    res.json(db.prepare('SELECT * FROM members WHERE id = ?').get(req.params.id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/members/:id', (req, res) => {
  const member = db.prepare('SELECT * FROM members WHERE id = ?').get(req.params.id);
  if (!member) return res.status(404).json({ error: 'Member not found' });
  db.prepare('DELETE FROM members WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ── Relationships ──────────────────────────────────────────────────────────

app.get('/api/relationships', (_req, res) => {
  res.json(db.prepare('SELECT * FROM relationships').all());
});

app.post('/api/relationships', (req, res) => {
  try {
    const { person1_id, person2_id, type } = req.body;
    if (!person1_id || !person2_id || !type)
      return res.status(400).json({ error: 'person1_id, person2_id, and type are required' });
    if (!['parent-child', 'spouse'].includes(type))
      return res.status(400).json({ error: 'type must be "parent-child" or "spouse"' });
    if (person1_id === person2_id)
      return res.status(400).json({ error: 'Cannot relate a person to themselves' });
    if (!db.prepare('SELECT id FROM members WHERE id = ?').get(person1_id))
      return res.status(404).json({ error: 'Person 1 not found' });
    if (!db.prepare('SELECT id FROM members WHERE id = ?').get(person2_id))
      return res.status(404).json({ error: 'Person 2 not found' });

    const result = db.prepare(
      'INSERT INTO relationships (person1_id, person2_id, type) VALUES (?, ?, ?)'
    ).run(person1_id, person2_id, type);
    res.status(201).json({ id: result.lastInsertRowid, person1_id, person2_id, type });
  } catch (err) {
    if (err.message.includes('UNIQUE'))
      return res.status(409).json({ error: 'This relationship already exists' });
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/relationships/:id', (req, res) => {
  db.prepare('DELETE FROM relationships WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ── Tree snapshot (members + relationships in one request) ─────────────────

app.get('/api/tree', (_req, res) => {
  const members = db.prepare('SELECT * FROM members').all();
  const relationships = db.prepare('SELECT * FROM relationships').all();
  res.json({ members, relationships });
});

app.listen(PORT, () => {
  console.log(`Family Tree running at http://localhost:${PORT}`);
});
