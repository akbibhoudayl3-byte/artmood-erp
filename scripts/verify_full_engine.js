/**
 * FULL ENGINE VERIFICATION — Real Data, Real Output
 *
 * Tests ALL 3 engine functions end-to-end:
 *   1. generateKitchen() logic (parts generation from module templates)
 *   2. generate_project_bom() SQL RPC (material aggregation)
 *   3. calculate_project_cost() SQL RPC (costing from BOM + settings)
 *
 * Run: node scripts/verify_full_engine.js
 * Requires: @supabase/supabase-js
 */

const { createClient } = require("@supabase/supabase-js");
const sb = createClient(
  "https://emeznqaweezgsqavxkuu.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVtZXpucWF3ZWV6Z3NxYXZ4a3V1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjgyODgxMiwiZXhwIjoyMDg4NDA0ODEyfQ.SfyDDaOCjLMMDHSDjyaqi4bIbzcTPsmznOmT5IK1LlY"
);

let passed = 0, failed = 0, warnings = 0;

function ok(name, detail) {
  console.log("  ✅ " + name + (detail ? " — " + detail : ""));
  passed++;
}
function fail(name, detail) {
  console.log("  ❌ " + name + (detail ? " — " + detail : ""));
  failed++;
}
function warn(name, detail) {
  console.log("  ⚠️  " + name + (detail ? " — " + detail : ""));
  warnings++;
}
function section(n, title) {
  console.log("\n" + "─".repeat(50));
  console.log("  " + n + ". " + title);
  console.log("─".repeat(50));
}

async function run() {
  console.log("\n" + "═".repeat(55));
  console.log("  FULL ENGINE VERIFICATION — REAL DATA TEST");
  console.log("  Date: " + new Date().toISOString());
  console.log("═".repeat(55));

  // ════════════════════════════════════════════════════════════════════
  // STEP 1: CHECK PREREQUISITES (tables, presets, modules, parts)
  // ════════════════════════════════════════════════════════════════════
  section(1, "PREREQUISITES — Data that the engine needs");

  // 1a. Material presets
  const { data: matPresets, error: mpErr } = await sb
    .from("cabinet_material_presets")
    .select("*")
    .eq("is_active", true)
    .order("sort_order");
  if (mpErr || !matPresets || matPresets.length === 0) {
    fail("Material presets", mpErr ? mpErr.message : "0 presets found");
    console.log("\n⛔ Cannot continue — no material presets. Run the kitchen configurator migration first.");
    return;
  }
  ok("Material presets", matPresets.length + " active");
  for (const p of matPresets) {
    console.log("      " + p.name + ": carcass=" + p.carcass_material + "/" + p.carcass_thickness_mm + "mm, facade=" + p.facade_material + "/" + p.facade_thickness_mm + "mm, back=" + p.back_panel_material + "/" + p.back_panel_thickness_mm + "mm");
  }

  // 1b. Hardware presets
  const { data: hwPresets, error: hwErr } = await sb
    .from("cabinet_hardware_presets")
    .select("*")
    .eq("is_active", true)
    .order("sort_order");
  if (hwErr || !hwPresets || hwPresets.length === 0) {
    fail("Hardware presets", hwErr ? hwErr.message : "0 presets found");
    return;
  }
  ok("Hardware presets", hwPresets.length + " active");
  for (const p of hwPresets) {
    console.log("      " + p.name + " [" + p.tier + "]: hinge=" + p.hinge_unit_price + " MAD, slide=" + p.drawer_slide_unit_price + " MAD, handle=" + p.handle_unit_price + " MAD, shelf=" + p.shelf_support_unit_price + " MAD");
  }

  // 1c. Product modules (kitchen catalog)
  const kitchenCodes = ['BASE-400', 'BASE-600', 'BASE-800', 'SINK-BASE', 'DRAWER-600', 'CORNER-BASE',
    'WALL-400', 'WALL-600', 'WALL-800', 'CORNER-WALL', 'OVEN-TALL', 'FRIDGE-TALL', 'PANTRY-TALL'];
  const { data: modules, error: modErr } = await sb
    .from("product_modules")
    .select("id, code, name, category, width_mm, height_mm, depth_mm")
    .in("code", kitchenCodes);
  if (modErr || !modules || modules.length === 0) {
    fail("Kitchen modules in catalog", modErr ? modErr.message : "0 found");
    return;
  }
  ok("Kitchen modules", modules.length + "/" + kitchenCodes.length + " found");
  for (const m of modules) {
    console.log("      " + m.code + " — " + m.name + " [" + m.category + "] " + m.width_mm + "×" + m.height_mm + "×" + m.depth_mm + "mm");
  }

  // 1d. Module parts (templates per module)
  const moduleIds = modules.map(m => m.id);
  const { data: allParts, error: partErr } = await sb
    .from("module_parts")
    .select("*")
    .in("module_id", moduleIds);
  if (partErr || !allParts || allParts.length === 0) {
    fail("Module part templates", partErr ? partErr.message : "0 found");
    return;
  }

  const partsPerModule = {};
  for (const p of allParts) {
    if (!partsPerModule[p.module_id]) partsPerModule[p.module_id] = [];
    partsPerModule[p.module_id].push(p);
  }
  ok("Module part templates", allParts.length + " total across " + Object.keys(partsPerModule).length + " modules");
  for (const m of modules) {
    const parts = partsPerModule[m.id] || [];
    const panels = parts.filter(p => p.part_type === 'panel');
    const others = parts.filter(p => p.part_type !== 'panel');
    console.log("      " + m.code + ": " + panels.length + " panels, " + others.length + " other parts");
    for (const p of parts) {
      console.log("         " + p.code + " | " + p.name + " | type=" + p.part_type + " | material=" + p.material_type + " | W=" + (p.width_formula || "—") + " H=" + (p.height_formula || "—") + " Q=" + (p.quantity_formula || "1") + " | edges: T=" + (p.edge_top ? "Y" : "N") + " B=" + (p.edge_bottom ? "Y" : "N") + " L=" + (p.edge_left ? "Y" : "N") + " R=" + (p.edge_right ? "Y" : "N"));
    }
  }

  // 1e. Materials catalog
  const { data: materials } = await sb.from("materials").select("code, name, category, thickness_mm, cost_per_unit, waste_factor");
  ok("Materials catalog", materials ? materials.length + " materials" : "missing");

  // 1f. Cost settings
  const { data: costSettings, error: csErr } = await sb.from("cost_settings").select("*").limit(1).single();
  if (csErr || !costSettings) {
    fail("Cost settings", csErr ? csErr.message : "missing");
    return;
  }
  ok("Cost settings",
    "labor=" + costSettings.labor_rate_per_hour + " MAD/h, " +
    "hrs/panel=" + costSettings.avg_hours_per_panel + ", " +
    "machine=" + costSettings.machine_rate_per_hour + " MAD/h, " +
    "machine_hrs/panel=" + costSettings.avg_machine_hours_per_panel + ", " +
    "transport=" + costSettings.default_transport_cost + " MAD, " +
    "min_margin=" + costSettings.min_margin_percent + "%, " +
    "recommended_margin=" + costSettings.recommended_margin_percent + "%"
  );

  // ════════════════════════════════════════════════════════════════════
  // STEP 2: SIMULATE generateKitchen() — Part Generation (client-side logic)
  // ════════════════════════════════════════════════════════════════════
  section(2, "SIMULATE generateKitchen() — Parts from Modules");

  // Pick first material preset + hardware preset
  const testMatPreset = matPresets[0];
  const testHwPreset = hwPresets[0];
  console.log("  Using material preset: " + testMatPreset.name);
  console.log("  Using hardware preset: " + testHwPreset.name);

  // Simulate 3 modules: BASE-600, WALL-600, DRAWER-600
  const testModuleCodes = ['BASE-600', 'WALL-600', 'DRAWER-600'];
  const testModules = modules.filter(m => testModuleCodes.includes(m.code));

  if (testModules.length < 3) {
    warn("Only found " + testModules.length + "/3 test modules", testModules.map(m => m.code).join(", "));
  }

  // safeEval implementation (copy from engine)
  function safeEval(expr, W, H, D) {
    try {
      const e = expr.replace(/\{W\}/g, String(W)).replace(/\{H\}/g, String(H)).replace(/\{D\}/g, String(D)).trim();
      let pos = 0;
      function skipSpaces() { while (pos < e.length && e[pos] === ' ') pos++; }
      function parseExpr() {
        let result = parseTerm();
        while (pos < e.length) { skipSpaces(); if (e[pos] === '+') { pos++; result += parseTerm(); } else if (e[pos] === '-') { pos++; result -= parseTerm(); } else break; }
        return result;
      }
      function parseTerm() {
        let result = parseFactor();
        while (pos < e.length) { skipSpaces(); if (e[pos] === '*') { pos++; result *= parseFactor(); } else if (e[pos] === '/') { pos++; const d = parseFactor(); result = d !== 0 ? result / d : 0; } else break; }
        return result;
      }
      function parseFactor() {
        skipSpaces();
        if (e.substring(pos, pos + 5) === 'Math.') {
          const fnStart = pos + 5; let fnName = '';
          while (pos < e.length && e[fnStart + fnName.length] !== '(') { fnName += e[fnStart + fnName.length]; if (fnName.length > 10) break; }
          pos = fnStart + fnName.length;
          if (e[pos] === '(') { pos++; const inner = parseExpr(); skipSpaces(); if (pos < e.length && e[pos] === ')') pos++;
            switch (fnName) { case 'round': return Math.round(inner); case 'floor': return Math.floor(inner); case 'ceil': return Math.ceil(inner); case 'abs': return Math.abs(inner); default: return inner; }
          }
        }
        if (e.substring(pos, pos + 7) === 'String(') { pos += 7; const inner = parseExpr(); skipSpaces(); if (pos < e.length && e[pos] === ')') pos++; return inner; }
        if (e[pos] === '(') { pos++; const r = parseExpr(); skipSpaces(); if (pos < e.length && e[pos] === ')') pos++; return r; }
        if (e[pos] === '-') { pos++; return -parseFactor(); }
        let numStr = '';
        while (pos < e.length && ((e[pos] >= '0' && e[pos] <= '9') || e[pos] === '.')) { numStr += e[pos]; pos++; }
        skipSpaces();
        return numStr ? parseFloat(numStr) : 0;
      }
      const result = parseExpr();
      return Math.round(isNaN(result) ? 0 : result);
    } catch { return 0; }
  }

  // Material type resolver (copy from engine)
  const MATERIAL_THICKNESS_MAP = {
    mdf_18: 18, mdf_16: 16, mdf_22: 22, mdf_10: 10,
    back_hdf_5: 5, back_hdf_3: 3, back_mdf_8: 8,
    stratifie_18: 18, stratifie_16: 16,
    melamine_anthracite: 18, melamine_blanc: 18,
    melamine_chene: 18, melamine_noyer: 18,
  };

  function resolveMaterialType(partMaterialType, preset) {
    let result;
    switch (partMaterialType) {
      case 'carcass': result = { material: preset.carcass_material, thickness: preset.carcass_thickness_mm }; break;
      case 'facade': result = { material: preset.facade_material, thickness: preset.facade_thickness_mm }; break;
      case 'back_panel': result = { material: preset.back_panel_material, thickness: preset.back_panel_thickness_mm }; break;
      default: result = { material: partMaterialType || 'mdf_18', thickness: 18 };
    }
    const canonical = MATERIAL_THICKNESS_MAP[result.material];
    if (canonical !== undefined && canonical !== result.thickness) {
      console.log("      ⚠️ Thickness override: " + result.material + " " + result.thickness + "mm → " + canonical + "mm");
      result.thickness = canonical;
    }
    return result;
  }

  const generatedParts = [];
  let hwCount = 0;
  let partIdx = 0;

  for (const mod of testModules) {
    const W = mod.width_mm || 600;
    const H = mod.height_mm || 720;
    const D = mod.depth_mm || 560;
    const qty = 1;
    const templates = partsPerModule[mod.id] || [];

    console.log("\n  Module: " + mod.code + " (" + W + "×" + H + "×" + D + "mm) — " + templates.length + " templates");

    // Generate panels
    for (const tpl of templates) {
      if (tpl.part_type !== 'panel') continue;
      const resolved = resolveMaterialType(tpl.material_type, testMatPreset);
      const partW = tpl.width_formula ? safeEval(tpl.width_formula, W, H, D) : W;
      const partH = tpl.height_formula ? safeEval(tpl.height_formula, W, H, D) : H;
      const partQty = tpl.quantity_formula ? safeEval(tpl.quantity_formula, W, H, D) : 1;
      const totalQty = partQty * qty;

      const edgeLen =
        (tpl.edge_top ? partW : 0) +
        (tpl.edge_bottom ? partW : 0) +
        (tpl.edge_left ? partH : 0) +
        (tpl.edge_right ? partH : 0);

      for (let i = 0; i < totalQty; i++) {
        partIdx++;
        const part = {
          part_code: 'KC-' + String(partIdx).padStart(4, '0'),
          part_name: tpl.name + ' (' + mod.code + ')',
          material_type: resolved.material,
          thickness_mm: resolved.thickness,
          width_mm: partW,
          height_mm: partH,
          quantity: 1,
          edge_length_mm: edgeLen,
          area_m2: Math.round(partW * partH / 1000000 * 1000) / 1000,
        };
        generatedParts.push(part);
        console.log("    PANEL: " + part.part_code + " | " + part.part_name + " | " + part.material_type + " " + part.thickness_mm + "mm | " + part.width_mm + "×" + part.height_mm + "mm = " + part.area_m2 + " m² | edge=" + edgeLen + "mm");
      }
    }

    // Count doors/drawers/shelves for hardware
    const doorParts = templates.filter(p => p.code.includes('DOOR'));
    const drawerParts = templates.filter(p => p.code.includes('DRW-FRONT'));
    const shelfParts = templates.filter(p => p.code.includes('SHELF'));

    let doorCount = 0;
    for (const dp of doorParts) doorCount += (dp.quantity_formula ? safeEval(dp.quantity_formula, W, H, D) : 1) * qty;
    let drawerCount = 0;
    for (const dp of drawerParts) drawerCount += (dp.quantity_formula ? safeEval(dp.quantity_formula, W, H, D) : 1) * qty;
    let shelfCount = 0;
    for (const sp of shelfParts) shelfCount += (sp.quantity_formula ? safeEval(sp.quantity_formula, W, H, D) : 1) * qty;

    console.log("    COUNTS: doors=" + doorCount + ", drawers=" + drawerCount + ", shelves=" + shelfCount);

    // Hardware items
    if (doorCount > 0) {
      const hingeQty = doorCount * 2;
      const hingeCost = hingeQty * testHwPreset.hinge_unit_price;
      console.log("    HW: " + hingeQty + "× Charnière " + testHwPreset.hinge_type + " @ " + testHwPreset.hinge_unit_price + " = " + hingeCost + " MAD");
      hwCount += hingeQty;
    }
    if (drawerCount > 0) {
      const slideCost = drawerCount * testHwPreset.drawer_slide_unit_price;
      console.log("    HW: " + drawerCount + "× Coulisse " + testHwPreset.drawer_slide_type + " @ " + testHwPreset.drawer_slide_unit_price + " = " + slideCost + " MAD");
      hwCount += drawerCount;
    }
    if (shelfCount > 0) {
      const supportQty = shelfCount * 4;
      const supportCost = supportQty * testHwPreset.shelf_support_unit_price;
      console.log("    HW: " + supportQty + "× Support étagère @ " + testHwPreset.shelf_support_unit_price + " = " + supportCost + " MAD");
      hwCount += supportQty;
    }
  }

  const panelCount = generatedParts.length;
  const totalArea = Math.round(generatedParts.reduce((s, p) => s + p.area_m2, 0) * 1000) / 1000;
  const totalEdge = generatedParts.reduce((s, p) => s + (p.edge_length_mm || 0), 0);

  console.log("\n  ── GENERATION SUMMARY ──");
  console.log("  Panels: " + panelCount);
  console.log("  Hardware items: " + hwCount);
  console.log("  Total area: " + totalArea + " m²");
  console.log("  Total edge banding: " + totalEdge + " mm (" + Math.round(totalEdge / 1000 * 10) / 10 + " ml)");

  if (panelCount > 0) ok("generateKitchen produces panels", panelCount + " panels from " + testModules.length + " modules");
  else fail("generateKitchen produces panels", "0 panels");

  if (hwCount > 0) ok("generateKitchen produces hardware", hwCount + " hardware items");
  else warn("generateKitchen produces no hardware", "check door/drawer/shelf counts");

  // Check for formula issues
  const zeroParts = generatedParts.filter(p => p.width_mm === 0 || p.height_mm === 0);
  if (zeroParts.length > 0) {
    fail("No zero-dimension parts", zeroParts.length + " parts have 0 width or height");
    for (const z of zeroParts) console.log("    ⚠️ " + z.part_code + " " + z.part_name + " = " + z.width_mm + "×" + z.height_mm);
  } else {
    ok("All parts have valid dimensions", "no zero-width/height");
  }

  // Material grouping (what BOM will aggregate)
  const matGroups = {};
  for (const p of generatedParts) {
    const key = p.material_type + "_" + p.thickness_mm;
    if (!matGroups[key]) matGroups[key] = { count: 0, area: 0, edge: 0 };
    matGroups[key].count += 1;
    matGroups[key].area += p.area_m2;
    matGroups[key].edge += p.edge_length_mm || 0;
  }
  console.log("\n  ── MATERIAL GROUPS (expected BOM output) ──");
  for (const [key, g] of Object.entries(matGroups)) {
    console.log("    " + key + ": " + g.count + " panels, " + Math.round(g.area * 1000) / 1000 + " m², edge=" + g.edge + " mm");
  }

  // ════════════════════════════════════════════════════════════════════
  // STEP 3: TEST generate_project_bom() SQL RPC — against a real project
  // ════════════════════════════════════════════════════════════════════
  section(3, "generate_project_bom() — SQL RPC");

  // Find a project that has project_parts
  const { data: projWithParts } = await sb
    .from("project_parts")
    .select("project_id")
    .limit(1);

  if (projWithParts && projWithParts.length > 0) {
    const pid = projWithParts[0].project_id;
    console.log("  Testing with project: " + pid);

    // Count parts before
    const { data: partsBefore } = await sb.from("project_parts").select("id, part_code, material_type, width_mm, height_mm, quantity, edge_top, edge_bottom, edge_left, edge_right").eq("project_id", pid);
    console.log("  Parts in project: " + (partsBefore ? partsBefore.length : 0));
    if (partsBefore && partsBefore.length > 0) {
      for (const p of partsBefore.slice(0, 10)) {
        console.log("    " + p.part_code + " | " + p.material_type + " | " + p.width_mm + "×" + p.height_mm + " × " + p.quantity);
      }
      if (partsBefore.length > 10) console.log("    ... and " + (partsBefore.length - 10) + " more");
    }

    // Run BOM RPC
    const { data: bomResult, error: bomErr } = await sb.rpc("generate_project_bom", { p_project_id: pid });
    if (bomErr) {
      fail("generate_project_bom RPC", bomErr.message);
    } else {
      ok("generate_project_bom RPC", JSON.stringify(bomResult));
    }

    // Read BOM rows
    const { data: bomRows, error: brErr } = await sb
      .from("project_material_requirements_bom")
      .select("*")
      .eq("project_id", pid);

    if (brErr) {
      fail("BOM rows query", brErr.message);
    } else if (!bomRows || bomRows.length === 0) {
      fail("BOM rows created", "0 rows — generate_project_bom produced nothing");
    } else {
      ok("BOM rows created", bomRows.length + " material requirement(s)");
      console.log("\n  ── BOM DETAIL ──");
      for (const r of bomRows) {
        console.log("    material=" + r.material_type + " | panels=" + r.panels_required + " | area=" + r.net_area_m2 + " m² | waste=" + (r.waste_factor * 100) + "% | edge=" + r.edge_banding_ml + " ml | unit_cost=" + r.unit_cost + " MAD/m² | total=" + r.total_cost + " MAD");
      }

      // Validation: total_cost should use formula = area * (1 + waste) * unit_cost
      let bomValid = true;
      for (const r of bomRows) {
        const expected = Math.round(r.net_area_m2 * (1 + r.waste_factor) * r.unit_cost * 100) / 100;
        const actual = parseFloat(r.total_cost);
        if (Math.abs(expected - actual) > 1) {
          fail("BOM cost formula for " + r.material_type, "expected " + expected + " but got " + actual);
          bomValid = false;
        }
      }
      if (bomValid) ok("BOM cost formula correct", "area × (1 + waste) × unit_cost matches total_cost");
    }
  } else {
    warn("No project with parts found", "skipping BOM RPC test — need to run generateKitchen first");
  }

  // ════════════════════════════════════════════════════════════════════
  // STEP 4: TEST calculate_project_cost() SQL RPC
  // ════════════════════════════════════════════════════════════════════
  section(4, "calculate_project_cost() — SQL RPC");

  // Find a project that has BOM
  const { data: bomProjects } = await sb
    .from("project_material_requirements_bom")
    .select("project_id")
    .limit(1);

  if (bomProjects && bomProjects.length > 0) {
    const pid = bomProjects[0].project_id;
    console.log("  Testing with project: " + pid);

    const { data: cost, error: costErr } = await sb.rpc("calculate_project_cost", { p_project_id: pid });
    if (costErr) {
      fail("calculate_project_cost RPC", costErr.message);
    } else {
      ok("calculate_project_cost RPC", "returned data");

      console.log("\n  ── COST BREAKDOWN ──");
      console.log("    Material cost:    " + cost.material_cost + " MAD");
      console.log("    Hardware cost:    " + cost.hardware_cost + " MAD");
      console.log("    Labor cost:       " + cost.labor_cost + " MAD");
      console.log("    Machine cost:     " + cost.machine_cost + " MAD");
      console.log("    Transport cost:   " + cost.transport_cost + " MAD");
      console.log("    ─────────────────────────");
      console.log("    TOTAL COST:       " + cost.total_cost + " MAD");
      console.log("    Total panels:     " + cost.total_panels);
      console.log("    Min margin:       " + cost.min_margin_percent + "%");
      console.log("    Recommended:      " + cost.recommended_margin_percent + "%");

      // Validate fields exist
      const requiredFields = ['material_cost', 'hardware_cost', 'labor_cost', 'machine_cost', 'transport_cost', 'total_cost', 'total_panels', 'min_margin_percent', 'recommended_margin_percent'];
      const missingFields = requiredFields.filter(f => !(f in cost));
      if (missingFields.length > 0) {
        fail("Cost breakdown has all fields", "missing: " + missingFields.join(", "));
      } else {
        ok("Cost breakdown has all required fields");
      }

      // Validate total = sum of components
      const expectedTotal = parseFloat(cost.material_cost) + parseFloat(cost.hardware_cost) + parseFloat(cost.labor_cost) + parseFloat(cost.machine_cost) + parseFloat(cost.transport_cost);
      const actualTotal = parseFloat(cost.total_cost);
      if (Math.abs(expectedTotal - actualTotal) > 1) {
        fail("Total = sum of costs", "expected " + expectedTotal.toFixed(2) + " but got " + actualTotal.toFixed(2));
      } else {
        ok("Total = sum of costs", expectedTotal.toFixed(2) + " ≈ " + actualTotal.toFixed(2));
      }

      // Validate labor = panels * hrs * rate
      const expectedLabor = Math.round(cost.total_panels * costSettings.avg_hours_per_panel * costSettings.labor_rate_per_hour * 100) / 100;
      if (Math.abs(expectedLabor - parseFloat(cost.labor_cost)) > 1) {
        fail("Labor formula", "panels(" + cost.total_panels + ") × hrs(" + costSettings.avg_hours_per_panel + ") × rate(" + costSettings.labor_rate_per_hour + ") = " + expectedLabor + " but got " + cost.labor_cost);
      } else {
        ok("Labor formula correct", cost.total_panels + " × " + costSettings.avg_hours_per_panel + " × " + costSettings.labor_rate_per_hour + " = " + expectedLabor);
      }

      // Validate machine = panels * hrs * rate
      const expectedMachine = Math.round(cost.total_panels * costSettings.avg_machine_hours_per_panel * costSettings.machine_rate_per_hour * 100) / 100;
      if (Math.abs(expectedMachine - parseFloat(cost.machine_cost)) > 1) {
        fail("Machine formula", "expected " + expectedMachine + " but got " + cost.machine_cost);
      } else {
        ok("Machine formula correct", cost.total_panels + " × " + costSettings.avg_machine_hours_per_panel + " × " + costSettings.machine_rate_per_hour + " = " + expectedMachine);
      }

      // Quote price simulation
      const margin = cost.recommended_margin_percent;
      const quotePrice = Math.round(actualTotal / (1 - margin / 100) * 100) / 100;
      const profit = Math.round((quotePrice - actualTotal) * 100) / 100;
      console.log("\n  ── QUOTE SIMULATION (@ " + margin + "% margin) ──");
      console.log("    Selling price:    " + quotePrice + " MAD");
      console.log("    Profit:           " + profit + " MAD");
      console.log("    Actual margin:    " + Math.round((profit / quotePrice) * 1000) / 10 + "%");

      // v_project_real_cost check
      const { data: rc } = await sb.from("v_project_real_cost").select("*").eq("project_id", pid).maybeSingle();
      if (rc) {
        ok("v_project_real_cost", "revenue=" + rc.revenue + " cost=" + rc.real_cost + " profit=" + rc.profit + " margin=" + rc.margin_percent + "% health=" + rc.margin_health);
      } else {
        warn("v_project_real_cost", "no data for this project");
      }
    }
  } else {
    warn("No project with BOM found", "skipping cost RPC test");
  }

  // ════════════════════════════════════════════════════════════════════
  // STEP 5: CROSS-ENGINE MATERIAL CODE ALIGNMENT
  // ════════════════════════════════════════════════════════════════════
  section(5, "MATERIAL CODE ALIGNMENT — Engine ↔ Materials Catalog");

  // Check: do material codes from module_parts match anything in materials table?
  const partMaterialCodes = [...new Set(allParts.map(p => p.material_type).filter(Boolean))];
  console.log("  Material types used in module_parts: " + partMaterialCodes.join(", "));

  // After resolution via preset, what codes appear?
  const resolvedCodes = new Set();
  for (const code of partMaterialCodes) {
    const resolved = resolveMaterialType(code, testMatPreset);
    resolvedCodes.add(resolved.material);
  }
  console.log("  After preset resolution: " + [...resolvedCodes].join(", "));

  if (materials) {
    const matCodes = materials.map(m => m.code.toLowerCase());
    const missingFromCatalog = [...resolvedCodes].filter(c => !matCodes.includes(c.toLowerCase()) && !matCodes.includes(c.toUpperCase()));
    if (missingFromCatalog.length > 0) {
      warn("Material code mismatch", "These codes from engine are NOT in materials catalog: " + missingFromCatalog.join(", "));
      console.log("    This means BOM total_cost will be 0 for these materials (unit_cost defaults to 0)");
      console.log("    Materials catalog codes: " + materials.map(m => m.code).join(", "));
    } else {
      ok("All engine material codes exist in catalog");
    }
  }

  // ════════════════════════════════════════════════════════════════════
  // SUMMARY
  // ════════════════════════════════════════════════════════════════════
  console.log("\n" + "═".repeat(55));
  console.log("  RESULT: " + passed + " passed, " + failed + " failed, " + warnings + " warnings");
  if (failed === 0 && warnings === 0) console.log("  🎉 ALL ENGINES VERIFIED — READY FOR PRODUCTION");
  else if (failed === 0) console.log("  ⚠️  ENGINES WORK — but check warnings");
  else console.log("  ⛔ FAILURES DETECTED — fix before using");
  console.log("═".repeat(55) + "\n");

  if (failed > 0) process.exit(1);
}

run().catch(e => { console.error(e); process.exit(1); });
