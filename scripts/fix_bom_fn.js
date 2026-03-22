const { createClient } = require("@supabase/supabase-js");
const sb = createClient(
  "https://emeznqaweezgsqavxkuu.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVtZXpucWF3ZWV6Z3NxYXZ4a3V1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjgyODgxMiwiZXhwIjoyMDg4NDA0ODEyfQ.SfyDDaOCjLMMDHSDjyaqi4bIbzcTPsmznOmT5IK1LlY"
);

async function run() {
  // Fix: update the SQL function to not insert into panels_with_waste (generated column)
  const sql = `
    CREATE OR REPLACE FUNCTION generate_project_bom(p_project_id UUID)
    RETURNS JSONB AS $$
    DECLARE
      v_panel_count INT := 0;
      v_mat_count INT := 0;
    BEGIN
      DELETE FROM project_material_requirements_bom WHERE project_id = p_project_id;

      INSERT INTO project_material_requirements_bom (
        project_id, material_type, panel_width_mm, panel_height_mm,
        net_area_m2, panels_required, waste_factor,
        edge_banding_ml, unit_cost, total_cost, status
      )
      SELECT
        p_project_id,
        pp.material_type,
        MAX(pp.width_mm),
        MAX(pp.height_mm),
        ROUND(SUM(pp.width_mm * pp.height_mm * pp.quantity / 1000000.0)::numeric, 3),
        SUM(pp.quantity),
        COALESCE(m.waste_factor, 0.15),
        ROUND(SUM(
          pp.quantity * (
            CASE WHEN pp.edge_top THEN pp.width_mm ELSE 0 END +
            CASE WHEN pp.edge_bottom THEN pp.width_mm ELSE 0 END +
            CASE WHEN pp.edge_left THEN pp.height_mm ELSE 0 END +
            CASE WHEN pp.edge_right THEN pp.height_mm ELSE 0 END
          )
        )::numeric, 0),
        COALESCE(m.cost_per_unit, 0),
        ROUND((
          SUM(pp.width_mm * pp.height_mm * pp.quantity / 1000000.0) *
          (1 + COALESCE(m.waste_factor, 0.15)) *
          COALESCE(m.cost_per_unit, 0)
        )::numeric, 2),
        'planned'
      FROM project_parts pp
      LEFT JOIN materials m ON m.code = pp.material_type OR m.name = pp.material_type
      WHERE pp.project_id = p_project_id
      GROUP BY pp.material_type, m.waste_factor, m.cost_per_unit;

      GET DIAGNOSTICS v_mat_count = ROW_COUNT;

      SELECT COALESCE(SUM(quantity), 0) INTO v_panel_count
      FROM project_parts WHERE project_id = p_project_id;

      RETURN jsonb_build_object(
        'materials', v_mat_count,
        'panels', v_panel_count,
        'project_id', p_project_id
      );
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;
  `;

  const { error } = await sb.rpc("run_migration_ddl", { sql_text: sql });
  if (error) {
    console.log("Error fixing function:", error.message);
  } else {
    console.log("Fixed generate_project_bom() — removed panels_with_waste from INSERT");
  }

  // Test with a dummy project
  const { data, error: testErr } = await sb.rpc("generate_project_bom", {
    p_project_id: "00000000-0000-0000-0000-000000000000"
  });
  console.log("Test result:", data, testErr ? "ERR: " + testErr.message : "OK");
}

run().catch(e => { console.error(e); process.exit(1); });
