/**
 * Migration 20260316_026 — Fix audit_project_cost_change() trigger
 *
 * The trigger uses wrong column names (entity_type, entity_id, new_value, old_value, notes)
 * but the actual audit_log table has (table_name, record_id, new_data, old_data, reason).
 * This causes: "null value in column 'table_name' violates not-null constraint"
 */

exports.version = '20260316_026';
exports.name = 'fix_audit_trigger';

exports.up = async function (supabase) {
  async function ddl(sql) {
    const { error } = await supabase.rpc('run_migration_ddl', { sql_text: sql });
    if (error) throw new Error('DDL failed: ' + error.message + ' | SQL: ' + sql.substring(0, 200));
  }

  console.log('Fixing audit_project_cost_change() trigger...');
  await ddl(`
    CREATE OR REPLACE FUNCTION audit_project_cost_change()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    SECURITY DEFINER
    AS $$
    BEGIN
      IF TG_OP = 'INSERT' THEN
        INSERT INTO audit_log (user_id, action, table_name, record_id, new_data, reason)
        VALUES (
          auth.uid(), 'financial_edit', 'project_costs', NEW.id,
          jsonb_build_object(
            'project_id', NEW.project_id, 'cost_type', NEW.cost_type,
            'amount', NEW.amount, 'description', NEW.description
          ),
          'Project cost added: ' || NEW.cost_type || ' — ' || NEW.amount || ' MAD'
        );
      ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO audit_log (user_id, action, table_name, record_id, old_data, new_data, reason)
        VALUES (
          auth.uid(), 'financial_edit', 'project_costs', NEW.id,
          jsonb_build_object('amount', OLD.amount, 'cost_type', OLD.cost_type),
          jsonb_build_object('amount', NEW.amount, 'cost_type', NEW.cost_type),
          'Project cost updated: ' || NEW.cost_type || ' — ' || OLD.amount || ' → ' || NEW.amount || ' MAD'
        );
      ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO audit_log (user_id, action, table_name, record_id, old_data, reason)
        VALUES (
          auth.uid(), 'delete', 'project_costs', OLD.id,
          jsonb_build_object('amount', OLD.amount, 'cost_type', OLD.cost_type),
          'Project cost deleted: ' || OLD.cost_type || ' — ' || OLD.amount || ' MAD'
        );
        RETURN OLD;
      END IF;
      RETURN NEW;
    END;
    $$;
  `);
  console.log('✅ audit_project_cost_change() fixed — uses correct column names');

  console.log('\n🎉 Migration 20260316_026 complete');
};
