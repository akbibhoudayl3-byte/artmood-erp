// Debug: list all triggers on projects table
const { createClient } = require('@supabase/supabase-js');
const s = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://emeznqaweezgsqavxkuu.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

(async () => {
  // Try calling the list function
  const { data, error } = await s.rpc('list_project_triggers');
  if (error) {
    console.log('RPC error:', error.message);
    console.log('\nNeed to create the function via Supabase SQL Editor first.');
    console.log('Run this SQL in Supabase Dashboard > SQL Editor:');
    console.log(`
CREATE OR REPLACE FUNCTION list_project_triggers()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_agg(jsonb_build_object(
    'trigger_name', t.tgname,
    'function_name', p.proname,
    'trigger_type', t.tgtype::text,
    'enabled', t.tgenabled::text
  ))
  INTO result
  FROM pg_trigger t
  JOIN pg_class c ON t.tgrelid = c.oid
  JOIN pg_proc p ON t.tgfoid = p.oid
  WHERE c.relname = 'projects'
    AND t.tgisinternal = false;

  RETURN COALESCE(result, '[]'::jsonb);
END;
$fn$;
`);
  } else {
    console.log('Triggers on projects table:');
    console.log(JSON.stringify(data, null, 2));
  }
})();
