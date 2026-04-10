-- ══════════════════════════════════════════════════════════════
--  FAMILY TREE  ──  Supabase Schema
--  Run this once in: supabase.com → Your Project → SQL Editor
-- ══════════════════════════════════════════════════════════════

-- Members
CREATE TABLE IF NOT EXISTS members (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  gender      TEXT        DEFAULT 'unknown' CHECK (gender IN ('male','female','other','unknown')),
  birth_date  TEXT,
  death_date  TEXT,
  birth_place TEXT,
  bio         TEXT,
  photo       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Relationships
CREATE TABLE IF NOT EXISTS relationships (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  person1_id  UUID        NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  person2_id  UUID        NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  type        TEXT        NOT NULL CHECK (type IN ('parent-child','spouse')),
  UNIQUE (person1_id, person2_id, type),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── Row Level Security (allow public read/write — no login required) ──

ALTER TABLE members       ENABLE ROW LEVEL SECURITY;
ALTER TABLE relationships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_read"   ON members FOR SELECT USING (true);
CREATE POLICY "public_insert" ON members FOR INSERT WITH CHECK (true);
CREATE POLICY "public_update" ON members FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "public_delete" ON members FOR DELETE USING (true);

CREATE POLICY "public_read"   ON relationships FOR SELECT USING (true);
CREATE POLICY "public_insert" ON relationships FOR INSERT WITH CHECK (true);
CREATE POLICY "public_delete" ON relationships FOR DELETE USING (true);

-- ── Storage bucket for member photos ──

INSERT INTO storage.buckets (id, name, public)
VALUES ('photos', 'photos', true)
ON CONFLICT DO NOTHING;

CREATE POLICY "public_photo_all" ON storage.objects
  FOR ALL USING (bucket_id = 'photos') WITH CHECK (bucket_id = 'photos');
