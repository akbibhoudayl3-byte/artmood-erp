const { createClient } = require("@supabase/supabase-js");
const sb = createClient(
  "https://emeznqaweezgsqavxkuu.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVtZXpucWF3ZWV6Z3NxYXZ4a3V1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjgyODgxMiwiZXhwIjoyMDg4NDA0ODEyfQ.SfyDDaOCjLMMDHSDjyaqi4bIbzcTPsmznOmT5IK1LlY"
);

async function run() {
  // Material presets
  const { data: m1 } = await sb.from("cabinet_material_presets").select("id").limit(1);
  console.log("Material presets existing:", m1 ? m1.length : 0);

  if (!m1 || m1.length === 0) {
    console.log("Seeding material presets...");
    const presets = [
      { name: "MDF Blanc 18mm", description: "MDF blanc standard", carcass_material: "mdf_18", carcass_thickness_mm: 18, facade_material: "mdf_18", facade_thickness_mm: 18, back_panel_material: "back_hdf_5", back_panel_thickness_mm: 5, edge_band_type: "1mm_pvc", sort_order: 1 },
      { name: "Stratifie Chene", description: "Stratifie chene facade, MDF caisson", carcass_material: "mdf_18", carcass_thickness_mm: 18, facade_material: "stratifie_18", facade_thickness_mm: 18, back_panel_material: "back_hdf_5", back_panel_thickness_mm: 5, edge_band_type: "2mm_pvc", sort_order: 2 },
      { name: "Stratifie Noyer", description: "Stratifie noyer facade, MDF caisson", carcass_material: "mdf_18", carcass_thickness_mm: 18, facade_material: "stratifie_18", facade_thickness_mm: 18, back_panel_material: "back_hdf_5", back_panel_thickness_mm: 5, edge_band_type: "2mm_pvc", sort_order: 3 },
      { name: "MDF Laque", description: "MDF a laquer haut de gamme", carcass_material: "mdf_18", carcass_thickness_mm: 18, facade_material: "mdf_18", facade_thickness_mm: 22, back_panel_material: "back_mdf_8", back_panel_thickness_mm: 8, edge_band_type: "2mm_abs", sort_order: 4 },
      { name: "Melamine Anthracite", description: "Melamine anthracite biface", carcass_material: "melamine_anthracite", carcass_thickness_mm: 18, facade_material: "melamine_anthracite", facade_thickness_mm: 18, back_panel_material: "back_hdf_5", back_panel_thickness_mm: 5, edge_band_type: "1mm_pvc", sort_order: 5 },
    ];
    for (const p of presets) {
      const { error } = await sb.from("cabinet_material_presets").insert(p);
      if (error) console.log("  ERR:", p.name, error.message);
      else console.log("  OK:", p.name);
    }
  }

  // Hardware presets
  const { data: h1 } = await sb.from("cabinet_hardware_presets").select("id").limit(1);
  console.log("Hardware presets existing:", h1 ? h1.length : 0);

  if (!h1 || h1.length === 0) {
    console.log("Seeding hardware presets...");
    const hw = [
      { name: "Premium", tier: "premium", description: "Blum/Hettich haut de gamme", hinge_type: "blum_clip_top", hinge_unit_price: 55, drawer_slide_type: "blum_tandem_full", drawer_slide_unit_price: 180, handle_type: "gola_profile", handle_unit_price: 85, shelf_support_unit_price: 4, sort_order: 1 },
      { name: "Standard", tier: "standard", description: "Quincaillerie standard", hinge_type: "soft_close_110", hinge_unit_price: 25, drawer_slide_type: "ball_bearing_full", drawer_slide_unit_price: 80, handle_type: "bar_160mm", handle_unit_price: 35, shelf_support_unit_price: 2, sort_order: 2 },
      { name: "Budget", tier: "budget", description: "Economique", hinge_type: "basic_110", hinge_unit_price: 12, drawer_slide_type: "roller_partial", drawer_slide_unit_price: 35, handle_type: "knob_basic", handle_unit_price: 15, shelf_support_unit_price: 1, sort_order: 3 },
    ];
    for (const p of hw) {
      const { error } = await sb.from("cabinet_hardware_presets").insert(p);
      if (error) console.log("  ERR:", p.name, error.message);
      else console.log("  OK:", p.name);
    }
  }

  // Layout templates
  const { data: l1 } = await sb.from("kitchen_layout_templates").select("id").limit(1);
  console.log("Layout templates existing:", l1 ? l1.length : 0);

  if (!l1 || l1.length === 0) {
    console.log("Seeding layout templates...");
    const layouts = [
      { name: "Cuisine en I", layout_type: "I", description: "Lineaire - un seul mur", default_module_slots: [
        {position:1,category:"base_cabinet",label:"Bas gauche"},{position:2,category:"base_cabinet",label:"Evier"},{position:3,category:"base_cabinet",label:"Bas centre"},{position:4,category:"base_cabinet",label:"Bas droite"},{position:5,category:"wall_cabinet",label:"Haut gauche"},{position:6,category:"wall_cabinet",label:"Haut centre"},{position:7,category:"wall_cabinet",label:"Haut droite"}
      ], sort_order: 1 },
      { name: "Cuisine en L", layout_type: "L", description: "Deux murs perpendiculaires", default_module_slots: [
        {position:1,category:"base_cabinet",label:"Mur A Bas 1"},{position:2,category:"base_cabinet",label:"Mur A Evier"},{position:3,category:"base_cabinet",label:"Mur A Bas 3"},{position:4,category:"base_cabinet",label:"Angle bas"},{position:5,category:"base_cabinet",label:"Mur B Bas 1"},{position:6,category:"base_cabinet",label:"Mur B Bas 2"},{position:7,category:"wall_cabinet",label:"Mur A Haut 1"},{position:8,category:"wall_cabinet",label:"Mur A Haut 2"},{position:9,category:"wall_cabinet",label:"Angle haut"},{position:10,category:"wall_cabinet",label:"Mur B Haut 1"}
      ], sort_order: 2 },
      { name: "Cuisine en U", layout_type: "U", description: "Trois murs", default_module_slots: [
        {position:1,category:"base_cabinet",label:"Mur A Bas 1"},{position:2,category:"base_cabinet",label:"Mur A Bas 2"},{position:3,category:"base_cabinet",label:"Angle A-B"},{position:4,category:"base_cabinet",label:"Mur B Bas 1"},{position:5,category:"base_cabinet",label:"Mur B Evier"},{position:6,category:"base_cabinet",label:"Mur B Bas 3"},{position:7,category:"base_cabinet",label:"Angle B-C"},{position:8,category:"base_cabinet",label:"Mur C Bas 1"},{position:9,category:"base_cabinet",label:"Mur C Bas 2"},{position:10,category:"wall_cabinet",label:"Mur A Haut"},{position:11,category:"wall_cabinet",label:"Mur B Haut 1"},{position:12,category:"wall_cabinet",label:"Mur B Haut 2"},{position:13,category:"wall_cabinet",label:"Mur C Haut"}
      ], sort_order: 3 },
      { name: "Cuisine Parallele", layout_type: "parallel", description: "Deux murs face a face", default_module_slots: [
        {position:1,category:"base_cabinet",label:"Mur A Bas 1"},{position:2,category:"base_cabinet",label:"Mur A Evier"},{position:3,category:"base_cabinet",label:"Mur A Bas 3"},{position:4,category:"base_cabinet",label:"Mur B Bas 1"},{position:5,category:"base_cabinet",label:"Mur B Bas 2"},{position:6,category:"base_cabinet",label:"Mur B Bas 3"},{position:7,category:"wall_cabinet",label:"Mur A Haut"},{position:8,category:"wall_cabinet",label:"Mur B Haut"}
      ], sort_order: 4 },
      { name: "Cuisine avec Ilot", layout_type: "island", description: "Mur + ilot central", default_module_slots: [
        {position:1,category:"base_cabinet",label:"Mur Bas 1"},{position:2,category:"base_cabinet",label:"Mur Evier"},{position:3,category:"base_cabinet",label:"Mur Bas 3"},{position:4,category:"tall_cabinet",label:"Colonne four"},{position:5,category:"tall_cabinet",label:"Colonne frigo"},{position:6,category:"wall_cabinet",label:"Mur Haut 1"},{position:7,category:"wall_cabinet",label:"Mur Haut 2"},{position:8,category:"base_cabinet",label:"Ilot Bas 1"},{position:9,category:"base_cabinet",label:"Ilot Bas 2"},{position:10,category:"base_cabinet",label:"Ilot Bas 3"}
      ], sort_order: 5 },
    ];
    for (const l of layouts) {
      const { error } = await sb.from("kitchen_layout_templates").insert(l);
      if (error) console.log("  ERR:", l.name, error.message);
      else console.log("  OK:", l.name);
    }
  }

  console.log("Seed complete.");
}

run().catch(e => { console.error(e); process.exit(1); });
