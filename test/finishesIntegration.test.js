import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeFinishSpec,
  findMatchingFinish,
  formatFinishesForAI,
  saveFinishSpec,
  fetchProjectFinishes,
  deleteFinishSpec,
  migrateLegacyLocalStorageSpecs,
  FINISH_SCOPES
} from '../src/services/finishService.js';
import { executeClientToolCall } from '../src/services/aiTools.js';
import { buildGroundingSystemInstruction } from '../src/services/builderBrainService.js';

describe('Finishes & Specs End-to-End Integration & Real-World Scenarios', () => {
  const mockProjectId = 'lot_3_test';

  // Scenario 1: Add a whole-house roofing specification
  it('Scenario 1: Add a whole-house roofing specification', () => {
    const roofingSpec = normalizeFinishSpec({
      category: 'Roofing',
      location: 'Whole House',
      scope: 'whole_house',
      brand: 'Owens Corning',
      code: 'Duration Architectural Shingle',
      attributes: {
        color: 'Estate Gray',
        warranty: '30-Year Lifetime'
      }
    });

    assert.equal(roofingSpec.category, 'Roofing');
    assert.equal(roofingSpec.scope, 'whole_house');
    assert.equal(roofingSpec.brand, 'Owens Corning');
    assert.equal(roofingSpec.code, 'Duration Architectural Shingle');
    assert.equal(roofingSpec.attributes.color, 'Estate Gray');
  });

  // Scenario 2: Add a whole-house paint specification
  it('Scenario 2: Add a whole-house paint specification', () => {
    const paintSpec = normalizeFinishSpec({
      category: 'Paint',
      location: '', // empty location
      brand: 'Sherwin-Williams',
      code: 'SW 7005 Pure White',
      sheen: 'Flat (Walls) / Semi-Gloss (Trim)'
    });

    assert.equal(paintSpec.category, 'Paint');
    assert.equal(paintSpec.scope, 'whole_house');
    assert.equal(paintSpec.location, 'Whole House');
    assert.equal(paintSpec.code, 'SW 7005 Pure White');
  });

  // Scenario 3: Add a location-specific paint override
  it('Scenario 3: Add a location-specific paint override', () => {
    const studyPaint = normalizeFinishSpec({
      category: 'Paint',
      location: 'Study / Office Accent Wall',
      brand: 'Sherwin-Williams',
      code: 'SW 6244 Naval',
      sheen: 'Satin',
      notes: 'South wall accent behind desk'
    });

    assert.equal(studyPaint.category, 'Paint');
    assert.equal(studyPaint.scope, 'room_override');
    assert.equal(studyPaint.location, 'Study / Office Accent Wall');
    assert.equal(studyPaint.code, 'SW 6244 Naval');
    assert.equal(studyPaint.sheen, 'Satin');
  });

  // Scenario 4: Add a completely new category (Stucco)
  it('Scenario 4: Add a completely new category such as Stucco', () => {
    const stuccoSpec = normalizeFinishSpec({
      category: 'Stucco',
      location: 'Exterior Main Body & Parapets',
      brand: 'Master Wall',
      code: 'Superior Acrylic Finish Coat',
      attributes: {
        color: 'Dover White #104',
        texture: 'Medium Dash / Sand',
        baseCoat: '1-Coat Stucco System over Metal Lath'
      }
    });

    assert.equal(stuccoSpec.category, 'Stucco');
    assert.equal(stuccoSpec.attributes.texture, 'Medium Dash / Sand');
    assert.equal(stuccoSpec.attributes.baseCoat, '1-Coat Stucco System over Metal Lath');
  });

  // Scenario 5: Add custom attributes (Texture, Sealant, Thickness, Warranty)
  it('Scenario 5: Add custom attributes such as Texture, Sealant, Thickness, and Warranty', () => {
    const canteraSpec = normalizeFinishSpec({
      category: 'Stone',
      location: 'Front Entry Columns & Portico',
      brand: 'Quarry Direct MX',
      code: 'Cantera Architectural Columns',
      attributes: {
        stoneType: 'Blanco Galarza',
        stoneFinish: 'Honed Smooth',
        thickness: '2-inch slab veneer',
        sealant: 'Dry-Treat Stain-Proof Penetrating Sealer',
        warranty: '10-Year Quarry Guarantee'
      }
    });

    assert.equal(canteraSpec.attributes.stoneType, 'Blanco Galarza');
    assert.equal(canteraSpec.attributes.thickness, '2-inch slab veneer');
    assert.equal(canteraSpec.attributes.sealant, 'Dry-Treat Stain-Proof Penetrating Sealer');
    assert.equal(canteraSpec.attributes.warranty, '10-Year Quarry Guarantee');
  });

  // Scenario 6: Edit an existing finish without creating a duplicate
  it('Scenario 6: Edit an existing finish without creating a duplicate', () => {
    const original = normalizeFinishSpec({
      id: 'spec_roof_001',
      category: 'Roofing',
      location: 'Whole House Main Roof',
      brand: 'Owens Corning',
      code: 'Duration Architectural Shingle',
      attributes: { color: 'Estate Gray' },
      createdAt: '2026-08-01T12:00:00.000Z'
    });

    // Edit color to Onyx Black
    const edited = normalizeFinishSpec({
      ...original,
      attributes: { color: 'Onyx Black' },
      notes: 'Changed color choice per owner email'
    }, original.id);

    assert.equal(edited.id, 'spec_roof_001'); // Same ID
    assert.equal(edited.attributes.color, 'Onyx Black');
    assert.equal(edited.createdAt, '2026-08-01T12:00:00.000Z'); // CreatedAt preserved
  });

  // Scenario 7: Ask J.A.R.V.I.S. about standard fields and custom attributes
  it('Scenario 7: J.A.R.V.I.S. AI formatting includes both standard fields and custom attributes', () => {
    const specs = [
      normalizeFinishSpec({
        category: 'Stucco',
        location: 'Exterior',
        brand: 'Master Wall',
        code: 'Superior Acrylic Finish Coat',
        attributes: {
          color: 'Dover White #104',
          texture: 'Medium Dash'
        }
      }),
      normalizeFinishSpec({
        category: 'Stone',
        location: 'Front Entry Columns',
        brand: 'Quarry Direct MX',
        code: 'Cantera Architectural Columns',
        attributes: {
          sealant: 'Dry-Treat Stain-Proof Penetrating Sealer'
        }
      })
    ];

    const aiData = formatFinishesForAI(specs);
    assert.equal(aiData.found, true);
    assert.ok(aiData.summaryText.includes('texture: Medium Dash'));
    assert.ok(aiData.summaryText.includes('sealant: Dry-Treat Stain-Proof Penetrating Sealer'));
  });

  // Scenario 8: Ask J.A.R.V.I.S. about whole-house default vs location-specific exception
  it('Scenario 8: J.A.R.V.I.S. formatting cleanly segregates whole-house defaults from room overrides', () => {
    const specs = [
      normalizeFinishSpec({
        category: 'Paint',
        location: 'Whole House Interior Walls',
        scope: 'whole_house',
        brand: 'Sherwin-Williams',
        code: 'SW 7005 Pure White',
        sheen: 'Flat'
      }),
      normalizeFinishSpec({
        category: 'Paint',
        location: 'Study Accent Wall',
        scope: 'room_override',
        brand: 'Sherwin-Williams',
        code: 'SW 6244 Naval',
        sheen: 'Satin'
      })
    ];

    const aiData = formatFinishesForAI(specs);
    assert.equal(aiData.wholeHouseDefaults.length, 1);
    assert.equal(aiData.wholeHouseDefaults[0].codeOrProduct, 'SW 7005 Pure White');

    assert.equal(aiData.locationOverrides.length, 1);
    assert.equal(aiData.locationOverrides[0].codeOrProduct, 'SW 6244 Naval');
    assert.equal(aiData.locationOverrides[0].location, 'Study Accent Wall');

    assert.ok(aiData.summaryText.includes('--- WHOLE-HOUSE & GENERAL SPECIFICATIONS ---'));
    assert.ok(aiData.summaryText.includes('--- ROOM & LOCATION-SPECIFIC OVERRIDES / ACCENTS ---'));
  });

  // Scenario 9: Ambiguous multi-record conservative matching check
  it('Scenario 9: Conservative matching prevents accidental overwrites when multiple category records exist', () => {
    const specs = [
      normalizeFinishSpec({
        id: 'roof_house',
        category: 'Roofing',
        location: 'Whole House Main Roof',
        brand: 'Owens Corning',
        code: 'Duration Estate Gray'
      }),
      normalizeFinishSpec({
        id: 'roof_garage',
        category: 'Roofing',
        location: 'Detached Garage',
        brand: 'Owens Corning',
        code: 'Duration Onyx Black'
      })
    ];

    // Generic command "Change roofing" -> flags ambiguous
    const ambiguousCheck = findMatchingFinish(specs, { category: 'Roofing' });
    assert.equal(ambiguousCheck.ambiguous, true);
    assert.equal(ambiguousCheck.match, null);
    assert.equal(ambiguousCheck.candidates.length, 2);

    // Specific command "Change detached garage roofing" -> finds exact single match
    const garageCheck = findMatchingFinish(specs, { category: 'Roofing', location: 'Detached Garage' });
    assert.equal(garageCheck.ambiguous, false);
    assert.equal(garageCheck.match.id, 'roof_garage');
  });

  // Scenario 10: Legacy migration simulation
  it('Scenario 10: Legacy localStorage items map cleanly into normalized Firestore finish specs', () => {
    const legacyRawItems = [
      {
        id: 'spec_1712003300_ab12',
        category: 'Paint',
        location: 'Interior Walls',
        brand: 'Sherwin-Williams',
        code: 'SW 7005 Pure White',
        sheen: 'Flat',
        notes: '2 coats',
        createdAt: '2026-04-01T10:00:00.000Z'
      },
      {
        id: 'spec_1712003350_cd34',
        category: 'Tile & Grout',
        location: 'Master Bath Shower',
        brand: 'Daltile',
        code: 'Calacatta Gold 12x24',
        sheen: 'Polished',
        notes: 'Mapei White grout',
        createdAt: '2026-04-02T10:00:00.000Z'
      }
    ];

    const migrated = legacyRawItems.map((item) => normalizeFinishSpec(item));
    assert.equal(migrated.length, 2);
    assert.equal(migrated[0].id, 'spec_1712003300_ab12');
    assert.equal(migrated[0].category, 'Paint');
    assert.equal(migrated[1].id, 'spec_1712003350_cd34');
    assert.equal(migrated[1].category, 'Tile & Grout');
  });

  // Scenario 11: Real-World Multi-Turn In-Conversation Edit (SW 7055 -> SW 8055)
  it('Scenario 11: Edit from SW 7055 to SW 8055 updates prompt manifest and tool retrieval in same conversation', async () => {
    const liveProjectId = 'lot_3_turn_test';

    // Turn 1: Initial Finish is SW 7055 Pure White
    const initialFinish = await saveFinishSpec(liveProjectId, {
      id: 'spec_paint_turn_test',
      category: 'Paint',
      location: 'Whole House',
      surface: 'Interior Walls',
      brand: 'Sherwin-Williams',
      code: 'SW 7055 Pure White',
      sheen: 'Flat/Eggshell',
      notes: 'Initial selection'
    });

    assert.equal(initialFinish.code, 'SW 7055 Pure White');

    // J.A.R.V.I.S. tool retrieval for Turn 1
    const turn1ToolRes = await executeClientToolCall(
      'get_project_finishes',
      { projectId: liveProjectId, category: 'Paint' },
      { projectId: liveProjectId, activeProjectName: 'Lot 3' }
    );
    assert.ok(turn1ToolRes.summaryText.includes('SW 7055 Pure White'));

    // Turn 2: User edits existing finish to SW 8055 Pure White
    const updatedFinish = await saveFinishSpec(liveProjectId, {
      id: 'spec_paint_turn_test', // Same ID (edit in place)
      category: 'Paint',
      location: 'Whole House',
      surface: 'Interior Walls',
      brand: 'Sherwin-Williams',
      code: 'SW 8055 Pure White',
      sheen: 'Flat/Eggshell',
      notes: 'Updated selection per buyer'
    });

    assert.equal(updatedFinish.id, 'spec_paint_turn_test');
    assert.equal(updatedFinish.code, 'SW 8055 Pure White');

    // Fetch fresh finishes
    const liveSpecs = await fetchProjectFinishes(liveProjectId);
    assert.equal(liveSpecs.length, 1);
    assert.equal(liveSpecs[0].code, 'SW 8055 Pure White');

    // Build prompt manifest for Turn 2
    const promptInstruction = buildGroundingSystemInstruction({
      activeProjectName: 'Lot 3',
      projectSpecs: liveSpecs,
      dashData: null,
      driveData: null,
      siteSetupData: null,
      inspectionsData: [],
      pendingR: [],
      memoriesData: []
    });

    // Verify Module 4 contains the new SW 8055 code and does NOT contain SW 7055
    assert.ok(promptInstruction.includes('[MODULE 4: HOMEOWNER FINISH SPECIFICATIONS]'));
    assert.ok(promptInstruction.includes('SW 8055 Pure White'));
    assert.ok(!promptInstruction.includes('SW 7055 Pure White'));

    // Verify J.A.R.V.I.S. tool call in Turn 2 returns SW 8055
    const turn2ToolRes = await executeClientToolCall(
      'get_project_finishes',
      { projectId: liveProjectId, category: 'Paint' },
      { projectId: liveProjectId, activeProjectName: 'Lot 3', projectSpecs: liveSpecs }
    );
    assert.equal(turn2ToolRes.found, true);
    assert.ok(turn2ToolRes.summaryText.includes('SW 8055 Pure White'));
    assert.ok(!turn2ToolRes.summaryText.includes('SW 7055 Pure White'));
  });
});

