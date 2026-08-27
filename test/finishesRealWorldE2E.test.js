import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeFinishSpec,
  findMatchingFinish,
  formatFinishesForAI,
  saveFinishSpec,
  fetchProjectFinishes,
  deleteFinishSpec,
  finishService,
  LocalStorageFinishAdapter,
  FirestoreFinishAdapter,
  FINISH_SCOPES,
  SURFACE_TYPES
} from '../src/services/finishService.js';
import { executeClientToolCall } from '../src/services/aiTools.js';

describe('SiteTactix Real-World Builder Finishes & Specs E2E Suite', () => {
  const projectId = 'lot_3_real_world';

  // 1. Whole-house interior wall paint
  it('1. Correctly registers Whole House Interior Wall paint', () => {
    const wallPaint = normalizeFinishSpec({
      category: 'Paint',
      location: 'Whole House',
      surface: 'Interior Walls',
      brand: 'Sherwin-Williams',
      code: 'SW 7005 Pure White',
      sheen: 'Flat'
    });

    assert.equal(wallPaint.category, 'Paint');
    assert.equal(wallPaint.surface, 'Interior Walls');
    assert.equal(wallPaint.location, 'Whole House');
    assert.equal(wallPaint.scope, FINISH_SCOPES.WHOLE_HOUSE);
    assert.equal(wallPaint.code, 'SW 7005 Pure White');
    assert.equal(wallPaint.sheen, 'Flat');
  });

  // 2. Whole-house ceiling paint (distinct from walls)
  it('2. Correctly registers Whole House Ceiling paint as a distinct specification', () => {
    const ceilingPaint = normalizeFinishSpec({
      category: 'Paint',
      location: 'Whole House',
      surface: 'Ceilings',
      brand: 'Sherwin-Williams',
      code: 'SW 7005 Pure White (Ceiling Formulation)',
      sheen: 'Flat'
    });

    assert.equal(ceilingPaint.category, 'Paint');
    assert.equal(ceilingPaint.surface, 'Ceilings');
    assert.equal(ceilingPaint.location, 'Whole House');
    assert.notEqual(ceilingPaint.surface, 'Interior Walls');
  });

  // 3. Interior trim & door paint
  it('3. Correctly registers Interior Trim & Doors paint', () => {
    const trimPaint = normalizeFinishSpec({
      category: 'Paint',
      location: 'Whole House',
      surface: 'Trim & Doors',
      brand: 'Sherwin-Williams',
      code: 'SW 7005 Pure White',
      sheen: 'Semi-Gloss'
    });

    assert.equal(trimPaint.surface, 'Trim & Doors');
    assert.equal(trimPaint.sheen, 'Semi-Gloss');
  });

  // 4. Kitchen cabinet paint (location-specific and surface-specific)
  it('4. Correctly registers Kitchen Cabinet paint as an accent/override', () => {
    const cabinetPaint = normalizeFinishSpec({
      category: 'Paint',
      location: 'Kitchen & Island',
      surface: 'Cabinets',
      brand: 'Sherwin-Williams',
      code: 'SW 7006 Extra White',
      sheen: 'Satin',
      notes: 'Catalyzed lacquer finish by cabinet shop'
    });

    assert.equal(cabinetPaint.surface, 'Cabinets');
    assert.equal(cabinetPaint.location, 'Kitchen & Island');
    assert.equal(cabinetPaint.code, 'SW 7006 Extra White');
    assert.equal(cabinetPaint.sheen, 'Satin');
    assert.equal(cabinetPaint.scope, FINISH_SCOPES.ROOM_OVERRIDE);
  });

  // 5. Room-specific paint override (Study accent wall)
  it('5. Correctly registers Study Accent Wall paint override', () => {
    const studyPaint = normalizeFinishSpec({
      category: 'Paint',
      location: 'Study / Office',
      surface: 'Accent Wall / Feature',
      brand: 'Sherwin-Williams',
      code: 'SW 6244 Naval',
      sheen: 'Satin',
      notes: 'South wall accent behind built-in desk'
    });

    assert.equal(studyPaint.surface, 'Accent Wall / Feature');
    assert.equal(studyPaint.location, 'Study / Office');
    assert.equal(studyPaint.code, 'SW 6244 Naval');
    assert.equal(studyPaint.scope, FINISH_SCOPES.ROOM_OVERRIDE);
  });

  // 6. Roofing specification
  it('6. Correctly registers Whole House Roofing specification', () => {
    const roof = normalizeFinishSpec({
      category: 'Roofing',
      location: 'Whole House Main Roof',
      surface: 'General / Structure',
      brand: 'Owens Corning',
      code: 'Duration Architectural Shingle',
      attributes: {
        color: 'Estate Gray',
        warranty: '30-Year Lifetime Limited',
        underlayment: 'Synthetic Titanium PSU30'
      }
    });

    assert.equal(roof.category, 'Roofing');
    assert.equal(roof.attributes.color, 'Estate Gray');
    assert.equal(roof.attributes.warranty, '30-Year Lifetime Limited');
  });

  // 7. Stucco specification
  it('7. Correctly registers Exterior Stucco with custom attributes', () => {
    const stucco = normalizeFinishSpec({
      category: 'Stucco',
      location: 'Exterior Main Body & Parapets',
      surface: 'Exterior Body / Walls',
      brand: 'Master Wall',
      code: 'Superior Acrylic Finish',
      attributes: {
        color: 'Dover White #104',
        texture: 'Medium Dash / Sand Finish',
        baseCoat: '1-Coat Stucco System over Metal Lath'
      }
    });

    assert.equal(stucco.category, 'Stucco');
    assert.equal(stucco.surface, 'Exterior Body / Walls');
    assert.equal(stucco.attributes.color, 'Dover White #104');
    assert.equal(stucco.attributes.texture, 'Medium Dash / Sand Finish');
  });

  // 8. Cantera / Stone with multiple custom attributes
  it('8. Correctly registers Cantera Stone with Sealant, Thickness, and Warranty', () => {
    const stone = normalizeFinishSpec({
      category: 'Stone',
      location: 'Front Entry Columns & Portico',
      surface: 'Exterior Body / Walls',
      brand: 'Quarry Direct MX',
      code: 'Cantera Architectural Columns',
      attributes: {
        stoneType: 'Blanco Galarza',
        finish: 'Honed Smooth',
        thickness: '2-inch slab veneer',
        sealant: 'Dry-Treat Stain-Proof Penetrating Sealer',
        warranty: '10-Year Quarry Guarantee'
      }
    });

    assert.equal(stone.category, 'Stone');
    assert.equal(stone.attributes.stoneType, 'Blanco Galarza');
    assert.equal(stone.attributes.thickness, '2-inch slab veneer');
    assert.equal(stone.attributes.sealant, 'Dry-Treat Stain-Proof Penetrating Sealer');
    assert.equal(stone.attributes.warranty, '10-Year Quarry Guarantee');
  });

  // 9. Editing an existing finish preserves ID and prevents duplicates
  it('9. Editing an existing finish in place updates attributes and preserves ID', () => {
    const original = normalizeFinishSpec({
      id: 'spec_stucco_001',
      category: 'Stucco',
      location: 'Exterior',
      surface: 'Exterior Body / Walls',
      brand: 'Master Wall',
      code: 'Superior Acrylic Finish',
      attributes: { color: 'Dover White #104', texture: 'Fine Sand' },
      createdAt: '2026-08-01T10:00:00.000Z'
    });

    const updated = normalizeFinishSpec({
      ...original,
      attributes: { color: 'Dover White #104', texture: 'Medium Dash' },
      notes: 'Texture updated per homeowner sample board approval'
    }, original.id);

    assert.equal(updated.id, 'spec_stucco_001');
    assert.equal(updated.attributes.texture, 'Medium Dash');
    assert.equal(updated.createdAt, '2026-08-01T10:00:00.000Z');
  });

  // 10. J.A.R.V.I.S. tool execution (save_finish_spec) creates new record
  it('10. J.A.R.V.I.S. AI tool save_finish_spec creates a new finish cleanly', async () => {
    const result = await executeClientToolCall(
      'save_finish_spec',
      {
        projectId: 'test_lot_3',
        category: 'Tile & Grout',
        location: 'Master Bath Shower',
        surface: 'Flooring / Countertop',
        brand: 'Daltile',
        codeOrProduct: 'Calacatta Gold 12x24 Porcelain',
        sheen: 'Polished',
        attributes: { grout: 'Mapei Frost #77' }
      },
      { projectId: 'test_lot_3' }
    );

    assert.equal(result.success, true);
    assert.equal(result.spec.category, 'Tile & Grout');
    assert.equal(result.spec.location, 'Master Bath Shower');
    assert.equal(result.spec.attributes.grout, 'Mapei Frost #77');
  });

  // 11. Conservative matching detects ambiguity when multiple records exist
  it('11. Conservative matching stops and asks for clarification on ambiguous update', () => {
    const specs = [
      normalizeFinishSpec({
        id: 'paint_walls',
        category: 'Paint',
        location: 'Whole House',
        surface: 'Interior Walls',
        code: 'SW 7005 Pure White'
      }),
      normalizeFinishSpec({
        id: 'paint_ceilings',
        category: 'Paint',
        location: 'Whole House',
        surface: 'Ceilings',
        code: 'SW 7005 Pure White Flat'
      }),
      normalizeFinishSpec({
        id: 'paint_study',
        category: 'Paint',
        location: 'Study / Office',
        surface: 'Accent Wall / Feature',
        code: 'SW 6244 Naval'
      })
    ];

    // Generic command: "Update the paint to Repose Gray" -> Ambiguous (3 paint records exist)
    const match = findMatchingFinish(specs, { category: 'Paint' });
    assert.equal(match.ambiguous, true);
    assert.equal(match.match, null);
    assert.equal(match.candidates.length, 3);

    // Specific command: "Update the study paint to Naval" -> Exact single match
    const studyMatch = findMatchingFinish(specs, { category: 'Paint', location: 'Study' });
    assert.equal(studyMatch.ambiguous, false);
    assert.equal(studyMatch.match.id, 'paint_study');

    // Specific surface command: "Update the ceiling paint" -> Exact single match
    const ceilingMatch = findMatchingFinish(specs, { category: 'Paint', surface: 'Ceilings' });
    assert.equal(ceilingMatch.ambiguous, false);
    assert.equal(ceilingMatch.match.id, 'paint_ceilings');
  });

  // 12. J.A.R.V.I.S. AI Retrieval resolves Whole House vs. Override hierarchy with Surfaces
  it('12. J.A.R.V.I.S. AI formatting cleanly separates Whole House Defaults from Overrides with Surfaces', () => {
    const allSpecs = [
      normalizeFinishSpec({
        category: 'Paint',
        location: 'Whole House',
        surface: 'Interior Walls',
        brand: 'Sherwin-Williams',
        code: 'SW 7005 Pure White',
        sheen: 'Flat'
      }),
      normalizeFinishSpec({
        category: 'Paint',
        location: 'Whole House',
        surface: 'Ceilings',
        brand: 'Sherwin-Williams',
        code: 'SW 7005 Pure White',
        sheen: 'Flat Ceiling'
      }),
      normalizeFinishSpec({
        category: 'Paint',
        location: 'Kitchen & Island',
        surface: 'Cabinets',
        brand: 'Sherwin-Williams',
        code: 'SW 7006 Extra White',
        sheen: 'Satin'
      }),
      normalizeFinishSpec({
        category: 'Paint',
        location: 'Study / Office',
        surface: 'Accent Wall / Feature',
        brand: 'Sherwin-Williams',
        code: 'SW 6244 Naval',
        sheen: 'Satin'
      }),
      normalizeFinishSpec({
        category: 'Stone',
        location: 'Front Entry Columns',
        surface: 'Exterior Body / Walls',
        brand: 'Quarry Direct MX',
        code: 'Cantera Blanco Galarza',
        attributes: {
          thickness: '2-inch slab veneer',
          sealant: 'Dry-Treat Stain-Proof Penetrating Sealer'
        }
      })
    ];

    const aiData = formatFinishesForAI(allSpecs);
    assert.equal(aiData.found, true);
    assert.equal(aiData.wholeHouseDefaults.length, 2); // Walls & Ceilings
    assert.equal(aiData.locationOverrides.length, 3); // Cabinets, Study Accent, Front Entry Columns

    // Verify AI prompt contains explicit structured headers
    assert.ok(aiData.summaryText.includes('--- WHOLE-HOUSE & GENERAL SPECIFICATIONS ---'));
    assert.ok(aiData.summaryText.includes('--- ROOM & LOCATION-SPECIFIC OVERRIDES / ACCENTS ---'));
    assert.ok(aiData.summaryText.includes('(Surface: Interior Walls)'));
    assert.ok(aiData.summaryText.includes('(Surface: Ceilings)'));
    assert.ok(aiData.summaryText.includes('(Surface: Cabinets)'));
    assert.ok(aiData.summaryText.includes('(Surface: Accent Wall / Feature)'));
    assert.ok(aiData.summaryText.includes('sealant: Dry-Treat Stain-Proof Penetrating Sealer'));
  });

  // 13. Dual-Layer Storage Adapter lifecycle (Mirroring purchasingService)
  it('13. Dual-layer finish storage adapter saves and retrieves offline cache reliably', async () => {
    const localAdapter = new LocalStorageFinishAdapter();
    const testDoc = normalizeFinishSpec({
      category: 'Roofing',
      location: 'Whole House',
      surface: 'General / Structure',
      brand: 'Owens Corning',
      code: 'Duration Architectural Shingle',
      attributes: { warranty: '30-Year Lifetime' }
    });

    await localAdapter.saveSpec('lot_3_adapter_test', testDoc);
    const retrieved = await localAdapter.getSpecs('lot_3_adapter_test');
    assert.equal(retrieved.length, 1);
    assert.equal(retrieved[0].category, 'Roofing');
    assert.equal(retrieved[0].attributes.warranty, '30-Year Lifetime');

    // Delete
    await localAdapter.deleteSpec('lot_3_adapter_test', testDoc.id);
    const afterDelete = await localAdapter.getSpecs('lot_3_adapter_test');
    assert.equal(afterDelete.length, 0);
  });
});
