/**
 * Migration: SAV (After-Sales Service) Module
 *
 * Creates tables: sav_tickets, sav_interventions, sav_photos
 * Creates view: v_sav_dashboard
 * Creates sequence + trigger for ticket numbering
 */

exports.version = '20260316_002';
exports.name = 'sav_module';

exports.up = async function (supabase) {
  const ddl = async (sql) => {
    const { error } = await supabase.rpc('run_migration_ddl', { sql_text: sql });
    if (error) throw error;
  };

  // ── Sequence for ticket numbering ─────────────────────────────────────
  await ddl(`CREATE SEQUENCE IF NOT EXISTS sav_ticket_seq START 1;`);

  // ── sav_tickets ───────────────────────────────────────────────────────
  await ddl(`
    CREATE TABLE IF NOT EXISTS sav_tickets (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      ticket_number TEXT,
      project_id UUID NOT NULL REFERENCES projects(id),
      issue_type TEXT NOT NULL CHECK (issue_type IN (
        'hinge_problem', 'drawer_problem', 'door_alignment',
        'damaged_panel', 'installation_correction', 'other'
      )),
      issue_description TEXT NOT NULL,
      priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'urgent')),
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN (
        'open', 'planned', 'in_progress', 'resolved', 'closed'
      )),
      assigned_to UUID REFERENCES profiles(id),
      warranty_status TEXT DEFAULT 'unknown' CHECK (warranty_status IN ('under_warranty', 'expired', 'unknown')),
      warranty_expiry_date DATE,
      resolution_report TEXT,
      resolved_at TIMESTAMPTZ,
      closed_at TIMESTAMPTZ,
      created_by UUID REFERENCES profiles(id),
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    );
  `);

  // ── Ticket number trigger ─────────────────────────────────────────────
  await ddl(`
    CREATE OR REPLACE FUNCTION set_sav_ticket_number()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.ticket_number := 'SAV-' || to_char(NEW.created_at, 'YYMM') || '-' || LPAD(nextval('sav_ticket_seq')::text, 4, '0');
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  await ddl(`
    DROP TRIGGER IF EXISTS trg_sav_ticket_number ON sav_tickets;
    CREATE TRIGGER trg_sav_ticket_number
      BEFORE INSERT ON sav_tickets
      FOR EACH ROW EXECUTE FUNCTION set_sav_ticket_number();
  `);

  // ── sav_interventions ─────────────────────────────────────────────────
  await ddl(`
    CREATE TABLE IF NOT EXISTS sav_interventions (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      ticket_id UUID NOT NULL REFERENCES sav_tickets(id) ON DELETE CASCADE,
      technician_id UUID REFERENCES profiles(id),
      planned_date DATE NOT NULL,
      planned_time TIME,
      actual_start TIMESTAMPTZ,
      actual_end TIMESTAMPTZ,
      status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'in_progress', 'completed', 'cancelled')),
      work_description TEXT,
      parts_used TEXT,
      notes TEXT,
      travel_cost NUMERIC(10,2) DEFAULT 0,
      parts_cost NUMERIC(10,2) DEFAULT 0,
      labor_cost NUMERIC(10,2) DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    );
  `);

  // ── sav_photos ────────────────────────────────────────────────────────
  await ddl(`
    CREATE TABLE IF NOT EXISTS sav_photos (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      ticket_id UUID NOT NULL REFERENCES sav_tickets(id) ON DELETE CASCADE,
      intervention_id UUID REFERENCES sav_interventions(id),
      photo_url TEXT NOT NULL,
      photo_type TEXT NOT NULL DEFAULT 'issue' CHECK (photo_type IN ('issue', 'before', 'after', 'evidence')),
      caption TEXT,
      uploaded_by UUID REFERENCES profiles(id),
      created_at TIMESTAMPTZ DEFAULT now()
    );
  `);

  // ── Indexes ───────────────────────────────────────────────────────────
  await ddl(`CREATE INDEX IF NOT EXISTS idx_sav_tickets_status ON sav_tickets(status);`);
  await ddl(`CREATE INDEX IF NOT EXISTS idx_sav_tickets_priority ON sav_tickets(priority);`);
  await ddl(`CREATE INDEX IF NOT EXISTS idx_sav_tickets_project ON sav_tickets(project_id);`);
  await ddl(`CREATE INDEX IF NOT EXISTS idx_sav_tickets_assigned ON sav_tickets(assigned_to);`);
  await ddl(`CREATE INDEX IF NOT EXISTS idx_sav_interventions_ticket ON sav_interventions(ticket_id);`);
  await ddl(`CREATE INDEX IF NOT EXISTS idx_sav_photos_ticket ON sav_photos(ticket_id);`);

  // ── updated_at triggers ───────────────────────────────────────────────
  await ddl(`
    CREATE TRIGGER update_sav_tickets_updated_at
      BEFORE UPDATE ON sav_tickets
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `);

  await ddl(`
    CREATE TRIGGER update_sav_interventions_updated_at
      BEFORE UPDATE ON sav_interventions
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `);

  // ── RLS ───────────────────────────────────────────────────────────────
  await ddl(`ALTER TABLE sav_tickets ENABLE ROW LEVEL SECURITY;`);
  await ddl(`ALTER TABLE sav_interventions ENABLE ROW LEVEL SECURITY;`);
  await ddl(`ALTER TABLE sav_photos ENABLE ROW LEVEL SECURITY;`);

  await ddl(`CREATE POLICY sav_tickets_select ON sav_tickets FOR SELECT TO authenticated USING (true);`);
  await ddl(`CREATE POLICY sav_tickets_insert ON sav_tickets FOR INSERT TO authenticated WITH CHECK (true);`);
  await ddl(`CREATE POLICY sav_tickets_update ON sav_tickets FOR UPDATE TO authenticated USING (true);`);

  await ddl(`CREATE POLICY sav_interventions_select ON sav_interventions FOR SELECT TO authenticated USING (true);`);
  await ddl(`CREATE POLICY sav_interventions_insert ON sav_interventions FOR INSERT TO authenticated WITH CHECK (true);`);
  await ddl(`CREATE POLICY sav_interventions_update ON sav_interventions FOR UPDATE TO authenticated USING (true);`);

  await ddl(`CREATE POLICY sav_photos_select ON sav_photos FOR SELECT TO authenticated USING (true);`);
  await ddl(`CREATE POLICY sav_photos_insert ON sav_photos FOR INSERT TO authenticated WITH CHECK (true);`);

  // ── Dashboard view ────────────────────────────────────────────────────
  await ddl(`
    CREATE OR REPLACE VIEW v_sav_dashboard AS
    SELECT
      count(*) FILTER (WHERE status IN ('open','planned','in_progress')) AS open_tickets,
      count(*) FILTER (WHERE priority = 'urgent' AND status NOT IN ('resolved','closed')) AS urgent_tickets,
      count(*) FILTER (WHERE status = 'resolved') AS resolved_tickets,
      count(*) FILTER (WHERE status = 'closed') AS closed_tickets,
      ROUND(avg(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 3600) FILTER (WHERE resolved_at IS NOT NULL), 1) AS avg_resolution_hours
    FROM sav_tickets;
  `);

  console.log('    ✓ SAV module tables, triggers, RLS, indexes, and view created');
};
