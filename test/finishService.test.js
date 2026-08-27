import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeFinishSpec,
  findMatchingFinish,
  formatFinishesForAI,
  FINISH_SCOPES
} from '../src/services/finishService.js';

describe('Finishes & Specs Engine (finishService.js)', () => {
  it('1. Correctly normalizes whole-house and exterior specifications with default scopes', () => {
    // Whole house paint
    const paintSpec = normalizeFinishSpec({
      category: 'Paint',
      location: '', // empty defaults to whole house
      brand: 'Sherwin-Williams',
      code: 'SW 7005 Pure White',
      sheen: 'Flat'
    });

    assert.equal(paintSpec.category, 'Paint');
    assert.equal(paintSpec.scope, FINISH_SCOPES.WHOLE_HOUSE);
    assert.equal(paintSpec.location, 'Whole House');
    assert.equal(paintSpec.code, 'SW 7005 Pure White');
    assert.equal(paintSpec.sheen, 'Flat');

    // Whole house roofing
    const roofSpec = normalizeFinishSpec({
      category: 'Roofing',
      location: 'Whole House',
      brand: 'Owens Corning',
      code: 'Duration Architectural Shingle',
      attributes: {
        color: 'Estate Gray',
        warranty: '30-Year Lifetime'
      }
    });

    assert.equal(roofSpec.category, 'Roofing');
    assert.equal(roofSpec.scope, FINISH_SCOPES.WHOLE_HOUSE);
    assert.equal(roofSpec.attributes.color, 'Estate Gray');
    assert.equal(roofSpec.attributes.warranty, '30-Year Lifetime');
  });

  it('2. Correctly assigns room_override scope for location-specific exceptions', () => {
    const studyPaint = normalizeFinishSpec({
      category: 'Paint',
      location: 'Study / Office Accent Wall',
      brand: 'Sherwin-Williams',
      code: 'SW 6244 Naval',
      sheen: 'Satin',
      notes: 'South wall only'
    });

    assert.equal(studyPaint.category, 'Paint');
    assert.equal(studyPaint.scope, FINISH_SCOPES.ROOM_OVERRIDE);
    assert.equal(studyPaint.location, 'Study / Office Accent Wall');
    assert.equal(studyPaint.code, 'SW 6244 Naval');
    assert.equal(studyPaint.sheen, 'Satin');
  });

  it('3. Supports open-ended dynamic attributes for any construction trade (Stucco, Stone, Tile, etc.)', () => {
    // Stucco with custom attributes
    const stuccoSpec = normalizeFinishSpec({
      category: 'Stucco',
      location: 'Exterior Main Body',
      brand: 'Master Wall',
      code: 'Superior Acrylic Finish Coat',
      attributes: {
        color: 'Dover White #104',
        texture: 'Medium Dash / Sand',
        baseCoat: '1-Coat Stucco over Metal Lath',
        warranty: '10-Year Acrylic'
      }
    });

    assert.equal(stuccoSpec.category, 'Stucco');
    assert.equal(stuccoSpec.attributes.texture, 'Medium Dash / Sand');
    assert.equal(stuccoSpec.attributes.baseCoat, '1-Coat Stucco over Metal Lath');

    // Cantera Stone with thickness, finish, and sealant
    const stoneSpec = normalizeFinishSpec({
      category: 'Stone',
      location: 'Front Entry Columns & Portico',
      brand: 'Quarry Direct MX',
      code: 'Cantera Architectural Columns',
      attributes: {
        stoneType: 'Blanco Galarza',
        stoneFinish: 'Honed Smooth',
        thickness: '2-inch slab veneer',
        sealant: 'Dry-Treat Stain-Proof Penetrating Sealer'
      }
    });

    assert.equal(stoneSpec.attributes.stoneType, 'Blanco Galarza');
    assert.equal(stoneSpec.attributes.thickness, '2-inch slab veneer');
    assert.equal(stoneSpec.attributes.sealant, 'Dry-Treat Stain-Proof Penetrating Sealer');
  });

  it('4. Explicitly separates Whole House Defaults from Location Overrides in AI formatting', () => {
    const specs = [
      normalizeFinishSpec({
        id: 'spec_1',
        category: 'Paint',
        location: 'Whole House Interior Walls',
        brand: 'Sherwin-Williams',
        code: 'SW 7005 Pure White',
        sheen: 'Flat'
      }),
      normalizeFinishSpec({
        id: 'spec_2',
        category: 'Paint',
        location: 'Study Accent Wall',
        brand: 'Sherwin-Williams',
        code: 'SW 6244 Naval',
        sheen: 'Satin'
      }),
      normalizeFinishSpec({
        id: 'spec_3',
        category: 'Stucco',
        location: 'Exterior',
        brand: 'Master Wall',
        code: 'Acrylic Finish',
        attributes: {
          color: 'Dover White #104',
          texture: 'Medium Dash'
        }
      })
    ];

    const aiData = formatFinishesForAI(specs);
    assert.equal(aiData.found, true);
    assert.equal(aiData.count, 3);
    assert.equal(aiData.wholeHouseDefaults.length, 2); // Paint Whole House + Stucco Exterior
    assert.equal(aiData.locationOverrides.length, 1); // Study Accent Wall
    assert.equal(aiData.locationOverrides[0].location, 'Study Accent Wall');

    // Verify structured text output
    assert.ok(aiData.summaryText.includes('--- WHOLE-HOUSE & GENERAL SPECIFICATIONS ---'));
    assert.ok(aiData.summaryText.includes('--- ROOM & LOCATION-SPECIFIC OVERRIDES / ACCENTS ---'));
    assert.ok(aiData.summaryText.includes('[Paint - Study Accent Wall (Surface: Accent Wall / Feature)] (OVERRIDE): Sherwin-Williams SW 6244 Naval'));
    assert.ok(aiData.summaryText.includes('texture: Medium Dash'));
  });

  it('5. Conservative matching correctly identifies exact single target vs. ambiguous multi-record targets', () => {
    const specs = [
      normalizeFinishSpec({
        id: 'roof_main',
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
      }),
      normalizeFinishSpec({
        id: 'paint_main',
        category: 'Paint',
        location: 'Whole House',
        brand: 'Sherwin-Williams',
        code: 'SW 7005 Pure White'
      })
    ];

    // Query for Paint (only 1 paint record exists) -> confident single match
    const paintMatch = findMatchingFinish(specs, { category: 'Paint' });
    assert.equal(paintMatch.ambiguous, false);
    assert.equal(paintMatch.match.id, 'paint_main');

    // Query for "Roofing on Detached Garage" -> matches location specifically
    const garageRoofMatch = findMatchingFinish(specs, { category: 'Roofing', location: 'Detached Garage' });
    assert.equal(garageRoofMatch.ambiguous, false);
    assert.equal(garageRoofMatch.match.id, 'roof_garage');

    // Query for "Change roofing color" without location when 2 roofing records exist -> flags as AMBIGUOUS!
    const ambiguousRoofMatch = findMatchingFinish(specs, { category: 'Roofing' });
    assert.equal(ambiguousRoofMatch.ambiguous, true);
    assert.equal(ambiguousRoofMatch.match, null);
    assert.equal(ambiguousRoofMatch.candidates.length, 2);
  });

  it('6. Preserves existing ID and updates in place when editing to avoid duplicates', () => {
    const existing = normalizeFinishSpec({
      id: 'spec_paint_123',
      category: 'Paint',
      location: 'Whole House',
      brand: 'Sherwin-Williams',
      code: 'SW 7005 Pure White',
      sheen: 'Flat',
      createdAt: '2026-08-01T10:00:00.000Z'
    });

    const updated = normalizeFinishSpec({
      ...existing,
      code: 'SW 7005 Pure White Extra Tint',
      sheen: 'Eggshell'
    }, existing.id);

    assert.equal(updated.id, 'spec_paint_123'); // ID preserved
    assert.equal(updated.code, 'SW 7005 Pure White Extra Tint');
    assert.equal(updated.sheen, 'Eggshell');
    assert.equal(updated.createdAt, '2026-08-01T10:00:00.000Z'); // Original createdAt kept
  });
});

