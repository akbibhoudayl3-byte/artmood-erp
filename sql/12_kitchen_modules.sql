-- ============================================================
-- Kitchen Module System — ArtMood ERP
-- ============================================================

-- 1. Product Modules
CREATE TABLE IF NOT EXISTS product_modules (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT NOT NULL UNIQUE,
  label       TEXT NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('base','wall','tall','sink','drawer','hotte','corner')),
  default_width  INT NOT NULL,
  default_height INT NOT NULL,
  default_depth  INT NOT NULL,
  sort_order  INT NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- 2. Module Rules
CREATE TABLE IF NOT EXISTS module_rules (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id        UUID NOT NULL REFERENCES product_modules(id) ON DELETE CASCADE,
  has_top          BOOLEAN NOT NULL DEFAULT true,
  has_bottom       BOOLEAN NOT NULL DEFAULT true,
  has_back         BOOLEAN NOT NULL DEFAULT true,
  has_shelf        BOOLEAN NOT NULL DEFAULT false,
  shelf_count      INT NOT NULL DEFAULT 0,
  construction_type TEXT NOT NULL DEFAULT 'standard'
    CHECK (construction_type IN ('standard','sink','column','hotte','drawer','corner')),
  UNIQUE(module_id)
);

-- 3. Module Parts Formulas
CREATE TABLE IF NOT EXISTS module_parts_formulas (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id   UUID NOT NULL REFERENCES product_modules(id) ON DELETE CASCADE,
  part_name   TEXT NOT NULL CHECK (part_name IN ('side','bottom','top','shelf','back','facade','drawer_facade','drawer_bottom')),
  qty         INT NOT NULL DEFAULT 1,
  width_formula  TEXT NOT NULL,
  height_formula TEXT NOT NULL,
  material_type  TEXT NOT NULL DEFAULT 'structure'
    CHECK (material_type IN ('structure','back','facade','aluminium')),
  edge_top    BOOLEAN NOT NULL DEFAULT false,
  edge_bottom BOOLEAN NOT NULL DEFAULT false,
  edge_left   BOOLEAN NOT NULL DEFAULT false,
  edge_right  BOOLEAN NOT NULL DEFAULT false,
  UNIQUE(module_id, part_name)
);

-- 4. Module Hardware Rules
CREATE TABLE IF NOT EXISTS module_hardware_rules (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id              UUID NOT NULL REFERENCES product_modules(id) ON DELETE CASCADE,
  hinges_count           INT NOT NULL DEFAULT 2,
  drawer_system          TEXT DEFAULT NULL,
  spider_required        BOOLEAN NOT NULL DEFAULT false,
  spider_count           INT NOT NULL DEFAULT 0,
  rail_shared            BOOLEAN NOT NULL DEFAULT false,
  UNIQUE(module_id)
);

-- 5. Module Options
CREATE TABLE IF NOT EXISTS module_options (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id        UUID NOT NULL REFERENCES product_modules(id) ON DELETE CASCADE,
  allow_glass      BOOLEAN NOT NULL DEFAULT false,
  allow_semi_glass BOOLEAN NOT NULL DEFAULT false,
  allow_gola       BOOLEAN NOT NULL DEFAULT true,
  allow_push       BOOLEAN NOT NULL DEFAULT true,
  UNIQUE(module_id)
);

-- 6. Kitchen Projects
CREATE TABLE IF NOT EXISTS kitchen_projects (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID REFERENCES projects(id) ON DELETE SET NULL,
  client_name     TEXT NOT NULL,
  client_type     TEXT NOT NULL DEFAULT 'standard'
    CHECK (client_type IN ('standard','promoteur','revendeur','architecte','urgent')),
  kitchen_type    TEXT NOT NULL DEFAULT 'modern'
    CHECK (kitchen_type IN ('modern','classic','semi_classic')),
  layout_type     TEXT NOT NULL DEFAULT 'I'
    CHECK (layout_type IN ('I','L','U')),
  full_height     BOOLEAN NOT NULL DEFAULT false,
  opening_system  TEXT NOT NULL DEFAULT 'handles'
    CHECK (opening_system IN ('handles','gola','push')),
  structure_material TEXT NOT NULL DEFAULT 'stratifie',
  facade_material    TEXT NOT NULL DEFAULT 'mdf_18_uv',
  back_thickness     INT NOT NULL DEFAULT 5,
  edge_caisson_mm    NUMERIC(3,1) NOT NULL DEFAULT 0.8,
  edge_facade_mm     NUMERIC(3,1) NOT NULL DEFAULT 1.0,
  status          TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','validated','quoted','production','completed')),
  notes           TEXT,
  created_by      UUID,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- 7. Kitchen Walls
CREATE TABLE IF NOT EXISTS kitchen_walls (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kitchen_id        UUID NOT NULL REFERENCES kitchen_projects(id) ON DELETE CASCADE,
  wall_name         TEXT NOT NULL DEFAULT 'A',
  wall_length_mm    INT NOT NULL,
  sort_order        INT NOT NULL DEFAULT 0,
  UNIQUE(kitchen_id, wall_name)
);

-- 8. Kitchen Modules (placed modules)
CREATE TABLE IF NOT EXISTS kitchen_modules (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kitchen_id        UUID NOT NULL REFERENCES kitchen_projects(id) ON DELETE CASCADE,
  wall_id           UUID NOT NULL REFERENCES kitchen_walls(id) ON DELETE CASCADE,
  module_id         UUID NOT NULL REFERENCES product_modules(id),
  position_x_mm     INT NOT NULL DEFAULT 0,
  width_mm          INT NOT NULL,
  height_mm         INT NOT NULL,
  depth_mm          INT NOT NULL,
  facade_override   TEXT DEFAULT NULL
    CHECK (facade_override IS NULL OR facade_override IN ('mdf','glass','semi_glass')),
  sort_order        INT NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ DEFAULT now()
);

-- 9. Kitchen Fillers
CREATE TABLE IF NOT EXISTS kitchen_fillers (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kitchen_id        UUID NOT NULL REFERENCES kitchen_projects(id) ON DELETE CASCADE,
  wall_id           UUID NOT NULL REFERENCES kitchen_walls(id) ON DELETE CASCADE,
  side              TEXT NOT NULL CHECK (side IN ('left','right')),
  width_mm          INT NOT NULL,
  height_mm         INT NOT NULL,
  depth_mm          INT NOT NULL,
  created_at        TIMESTAMPTZ DEFAULT now()
);

-- 10. Kitchen BOM (generated)
CREATE TABLE IF NOT EXISTS kitchen_bom (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kitchen_id        UUID NOT NULL REFERENCES kitchen_projects(id) ON DELETE CASCADE,
  module_instance_id UUID REFERENCES kitchen_modules(id) ON DELETE SET NULL,
  category          TEXT NOT NULL CHECK (category IN ('panel','edge_banding','hardware','accessory','filler')),
  description       TEXT NOT NULL,
  material          TEXT,
  width_mm          INT,
  height_mm         INT,
  thickness_mm      NUMERIC(4,1),
  qty               INT NOT NULL DEFAULT 1,
  length_m          NUMERIC(8,3),
  unit_cost         NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_cost        NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_kitchen_modules_kitchen ON kitchen_modules(kitchen_id);
CREATE INDEX IF NOT EXISTS idx_kitchen_bom_kitchen ON kitchen_bom(kitchen_id);
CREATE INDEX IF NOT EXISTS idx_kitchen_walls_kitchen ON kitchen_walls(kitchen_id);

-- Seed default product modules
INSERT INTO product_modules (code, label, type, default_width, default_height, default_depth, sort_order) VALUES
  ('BASE_300', 'Bas 30cm',        'base',   300, 700, 560, 1),
  ('BASE_400', 'Bas 40cm',        'base',   400, 700, 560, 2),
  ('BASE_500', 'Bas 50cm',        'base',   500, 700, 560, 3),
  ('BASE_600', 'Bas 60cm',        'base',   600, 700, 560, 4),
  ('BASE_800', 'Bas 80cm',        'base',   800, 700, 560, 5),
  ('BASE_900', 'Bas 90cm',        'base',   900, 700, 560, 6),
  ('SINK_600', 'Évier 60cm',      'sink',   600, 700, 560, 10),
  ('SINK_800', 'Évier 80cm',      'sink',   800, 700, 560, 11),
  ('DRAWER_300','Tiroir 30cm',    'drawer', 300, 700, 560, 20),
  ('DRAWER_400','Tiroir 40cm',    'drawer', 400, 700, 560, 21),
  ('DRAWER_600','Tiroir 60cm',    'drawer', 600, 700, 560, 22),
  ('WALL_300', 'Haut 30cm',       'wall',   300, 700, 320, 30),
  ('WALL_400', 'Haut 40cm',       'wall',   400, 700, 320, 31),
  ('WALL_500', 'Haut 50cm',       'wall',   500, 700, 320, 32),
  ('WALL_600', 'Haut 60cm',       'wall',   600, 700, 320, 33),
  ('WALL_800', 'Haut 80cm',       'wall',   800, 700, 320, 34),
  ('WALL_900', 'Haut 90cm',       'wall',   900, 700, 320, 35),
  ('COL_600',  'Colonne 60cm',    'tall',   600, 2100, 560, 40),
  ('COL_FRIDGE','Colonne Frigo',  'tall',   600, 2100, 560, 41),
  ('COL_OVEN', 'Colonne Four',    'tall',   600, 2100, 560, 42),
  ('HOTTE_600','Hotte 60cm',      'hotte',  600, 400, 320, 50),
  ('HOTTE_900','Hotte 90cm',      'hotte',  900, 400, 320, 51),
  ('CORNER_BASE','Angle Bas',     'corner', 900, 700, 560, 60),
  ('CORNER_WALL','Angle Haut',    'corner', 600, 700, 320, 61)
ON CONFLICT (code) DO NOTHING;

-- Seed module rules
INSERT INTO module_rules (module_id, has_top, has_bottom, has_back, has_shelf, shelf_count, construction_type)
SELECT id, true, true, true, true, 1, 'standard' FROM product_modules WHERE type = 'base'
ON CONFLICT (module_id) DO NOTHING;

INSERT INTO module_rules (module_id, has_top, has_bottom, has_back, has_shelf, shelf_count, construction_type)
SELECT id, true, false, true, false, 0, 'sink' FROM product_modules WHERE type = 'sink'
ON CONFLICT (module_id) DO NOTHING;

INSERT INTO module_rules (module_id, has_top, has_bottom, has_back, has_shelf, shelf_count, construction_type)
SELECT id, false, false, false, false, 0, 'drawer' FROM product_modules WHERE type = 'drawer'
ON CONFLICT (module_id) DO NOTHING;

INSERT INTO module_rules (module_id, has_top, has_bottom, has_back, has_shelf, shelf_count, construction_type)
SELECT id, true, true, true, true, 1, 'standard' FROM product_modules WHERE type = 'wall'
ON CONFLICT (module_id) DO NOTHING;

INSERT INTO module_rules (module_id, has_top, has_bottom, has_back, has_shelf, shelf_count, construction_type)
SELECT id, true, true, true, true, 3, 'column' FROM product_modules WHERE type = 'tall'
ON CONFLICT (module_id) DO NOTHING;

INSERT INTO module_rules (module_id, has_top, has_bottom, has_back, has_shelf, shelf_count, construction_type)
SELECT id, false, false, true, false, 0, 'hotte' FROM product_modules WHERE type = 'hotte'
ON CONFLICT (module_id) DO NOTHING;

INSERT INTO module_rules (module_id, has_top, has_bottom, has_back, has_shelf, shelf_count, construction_type)
SELECT id, true, true, true, true, 1, 'corner' FROM product_modules WHERE type = 'corner'
ON CONFLICT (module_id) DO NOTHING;

-- Seed hardware rules
INSERT INTO module_hardware_rules (module_id, hinges_count, drawer_system, spider_required, spider_count, rail_shared)
SELECT id, 2, NULL, false, 0, false FROM product_modules WHERE type = 'base'
ON CONFLICT (module_id) DO NOTHING;

INSERT INTO module_hardware_rules (module_id, hinges_count, drawer_system, spider_required, spider_count, rail_shared)
SELECT id, 2, NULL, false, 0, false FROM product_modules WHERE type = 'sink'
ON CONFLICT (module_id) DO NOTHING;

INSERT INTO module_hardware_rules (module_id, hinges_count, drawer_system, spider_required, spider_count, rail_shared)
SELECT id, 0, 'aluminium', false, 0, false FROM product_modules WHERE type = 'drawer'
ON CONFLICT (module_id) DO NOTHING;

INSERT INTO module_hardware_rules (module_id, hinges_count, drawer_system, spider_required, spider_count, rail_shared)
SELECT id, 2, NULL, true, 2, true FROM product_modules WHERE type = 'wall'
ON CONFLICT (module_id) DO NOTHING;

INSERT INTO module_hardware_rules (module_id, hinges_count, drawer_system, spider_required, spider_count, rail_shared)
SELECT id, 4, NULL, false, 0, false FROM product_modules WHERE type = 'tall'
ON CONFLICT (module_id) DO NOTHING;

INSERT INTO module_hardware_rules (module_id, hinges_count, drawer_system, spider_required, spider_count, rail_shared)
SELECT id, 0, NULL, false, 0, false FROM product_modules WHERE type = 'hotte'
ON CONFLICT (module_id) DO NOTHING;

INSERT INTO module_hardware_rules (module_id, hinges_count, drawer_system, spider_required, spider_count, rail_shared)
SELECT id, 2, NULL, false, 0, false FROM product_modules WHERE type = 'corner'
ON CONFLICT (module_id) DO NOTHING;

-- Seed module options
INSERT INTO module_options (module_id, allow_glass, allow_semi_glass, allow_gola, allow_push)
SELECT id, false, false, true, true FROM product_modules WHERE type IN ('base','sink','drawer','corner')
ON CONFLICT (module_id) DO NOTHING;

INSERT INTO module_options (module_id, allow_glass, allow_semi_glass, allow_gola, allow_push)
SELECT id, true, true, true, true FROM product_modules WHERE type IN ('wall','tall')
ON CONFLICT (module_id) DO NOTHING;

INSERT INTO module_options (module_id, allow_glass, allow_semi_glass, allow_gola, allow_push)
SELECT id, false, false, false, false FROM product_modules WHERE type = 'hotte'
ON CONFLICT (module_id) DO NOTHING;
