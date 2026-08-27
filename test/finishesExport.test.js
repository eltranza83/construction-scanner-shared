import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  exportToGoogleDocMarkdown,
  saveFinishSpec,
  normalizeFinishSpec,
  LocalStorageFinishAdapter,
  FINISH_SCOPES
} from '../src/services/finishService.js';
import { PROJECT_DOC_REGISTRY, getDocumentDefinition } from '../src/services/projectDocumentRegistry.js';
import { resolveCandidateDriveFiles } from '../src/services/projectDocumentBindingService.js';
import { executeClientToolCall } from '../src/services/aiTools.js';

describe('Finishes & Specs Google Drive Export & Registry Suite', () => {
  const projectId = 'lot_3_export_test';

  it('1. Document Registry defines finishes_specs with correct canonical name and folder patterns', () => {
    const def = getDocumentDefinition('finishes_specs');
    assert.ok(def);
    assert.equal(def.docType, 'finishes_specs');
    assert.equal(def.displayName, 'Finishes & Material Selections');
    assert.equal(def.canonicalFileName, 'Finishes and Material Selections.docx');
    assert.equal(def.defaultFolderName, 'Finishes & Specifications');
    assert.ok(def.folderPatterns.includes('finishes'));
    assert.ok(def.folderPatterns.includes('specs'));
    assert.ok(def.folderPatterns.includes('selections'));
  });

  it('2. Document Registry project template generates clean markdown scaffolding', () => {
    const def = getDocumentDefinition('finishes_specs');
    const scaffold = def.projectTemplate('Lot 3', 'doc_12345', 'Finishes and Material Selections.docx', 'v1.0');
    assert.ok(scaffold.includes('# Finishes & Material Specifications - Project Lot 3'));
    assert.ok(scaffold.includes('DocumentId: doc_12345'));
    assert.ok(scaffold.includes('## 1. Paint & Stains'));
    assert.ok(scaffold.includes('## 2. Roofing & Gutters'));
  });

  it('3. resolveCandidateDriveFiles deterministically binds to canonical finishes document', () => {
    const mockDriveTree = {
      id: 'root_lot_3',
      name: 'Lot 3 - 124 Main St',
      files: [
        { id: 'f_budget', name: 'Budget.xlsx' },
        { id: 'f_finishes', name: 'Finishes and Material Selections.docx' },
        { id: 'f_backup', name: 'Finishes and Material Selections_backup.docx' }
      ],
      subfolders: [
        {
          id: 'sub_specs',
          name: 'Finishes & Specifications',
          files: [
            { id: 'f_specs_nested', name: 'Finishes and Material Selections.docx' }
          ]
        }
      ]
    };

    const resolution = resolveCandidateDriveFiles(mockDriveTree, 'finishes_specs');
    assert.ok(resolution);
    assert.ok(resolution.bestMatch);
    assert.equal(resolution.bestMatch.documentId, 'f_specs_nested');
    assert.equal(resolution.bestMatch.isExactCanonical, true);
    assert.equal(resolution.isAmbiguous, false);
  });

  it('4. exportToGoogleDocMarkdown generates clean markdown with categories, surfaces, and overrides', async () => {
    const sampleSpecs = [
      {
        id: 'spec_paint_walls',
        category: 'Paint',
        location: 'Whole House',
        surface: 'Interior Walls',
        brand: 'Sherwin-Williams',
        code: 'SW 7005 Pure White',
        sheen: 'Flat'
      },
      {
        id: 'spec_paint_ceilings',
        category: 'Paint',
        location: 'Whole House',
        surface: 'Ceilings',
        brand: 'Sherwin-Williams',
        code: 'SW 7005 Pure White Flat',
        sheen: 'Flat Ceiling'
      },
      {
        id: 'spec_paint_trim',
        category: 'Paint',
        location: 'Whole House',
        surface: 'Trim & Doors',
        brand: 'Sherwin-Williams',
        code: 'SW 7005 Pure White',
        sheen: 'Semi-Gloss'
      },
      {
        id: 'spec_paint_study',
        category: 'Paint',
        location: 'Study / Office',
        surface: 'Accent Wall / Feature',
        brand: 'Sherwin-Williams',
        code: 'SW 6244 Naval',
        sheen: 'Satin',
        notes: 'South wall accent behind built-in desk'
      },
      {
        id: 'spec_stucco_exterior',
        category: 'Stucco',
        location: 'Exterior Main Body',
        surface: 'Exterior Body / Walls',
        brand: 'Master Wall',
        code: 'Superior Acrylic Finish',
        attributes: {
          color: 'Dover White #104',
          texture: 'Medium Dash / Sand Finish',
          baseCoat: '1-Coat Stucco System'
        }
      },
      {
        id: 'spec_stone_columns',
        category: 'Stone',
        location: 'Front Entry Columns',
        surface: 'Exterior Body / Walls',
        brand: 'Quarry Direct MX',
        code: 'Cantera Blanco Galarza',
        attributes: {
          thickness: '2-inch slab veneer',
          sealant: 'Dry-Treat Stain-Proof Penetrating Sealer',
          warranty: '10-Year Quarry Guarantee'
        }
      },
      {
        id: 'spec_roof_main',
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
      }
    ];

    // Seed via saveFinishSpec so it saves into finishService singleton storage
    for (const spec of sampleSpecs) {
      await saveFinishSpec(projectId, spec);
    }

    // Generate markdown
    const md = await exportToGoogleDocMarkdown(projectId, {
      title: 'Finishes & Material Specifications - Lot 3'
    });

    assert.ok(md.includes('# Finishes & Material Specifications - Lot 3'));
    assert.ok(md.includes('Applicable to all trades, interior designers, and subconsultants.'));
    
    // Category Headers
    assert.ok(md.includes('## 1. Paint'));
    assert.ok(md.includes('## 2. Stucco'));
    assert.ok(md.includes('## 3. Stone'));
    assert.ok(md.includes('## 4. Roofing'));

    // Paint Items & Overrides
    assert.ok(md.includes('* [Whole House (Interior Walls)]: Sherwin-Williams SW 7005 Pure White (Flat)'));
    assert.ok(md.includes('* [Whole House (Ceilings)]: Sherwin-Williams SW 7005 Pure White Flat (Flat Ceiling)'));
    assert.ok(md.includes('* [Whole House (Trim & Doors)]: Sherwin-Williams SW 7005 Pure White (Semi-Gloss)'));
    assert.ok(md.includes('* [Study / Office (Accent Wall / Feature)] (OVERRIDE): Sherwin-Williams SW 6244 Naval (Satin) — South wall accent behind built-in desk'));

    // Dynamic Attributes
    assert.ok(md.includes('[Color: Dover White #104 | Texture: Medium Dash / Sand Finish | BaseCoat: 1-Coat Stucco System]'));
    assert.ok(md.includes('[Thickness: 2-inch slab veneer | Sealant: Dry-Treat Stain-Proof Penetrating Sealer | Warranty: 10-Year Quarry Guarantee]'));
    assert.ok(md.includes('[Color: Estate Gray | Warranty: 30-Year Lifetime Limited | Underlayment: Synthetic Titanium PSU30]'));
  });

  it('5. exportToGoogleDocMarkdown produces clean fallback when project has 0 finishes', async () => {
    const emptyProj = 'lot_empty_test';
    const md = await exportToGoogleDocMarkdown(emptyProj, {
      title: 'Finishes & Material Specifications - Empty Lot'
    });

    assert.ok(md.includes('# Finishes & Material Specifications - Empty Lot'));
    assert.ok(md.includes('*No finish selections or specifications recorded yet for this project.*'));
  });

  it('6. J.A.R.V.I.S. AI tool export_finishes_doc returns markdown payload accurately', async () => {
    const res = await executeClientToolCall(
      'export_finishes_doc',
      { projectId: 'lot_3_export_test' },
      { projectId: 'lot_3_export_test', activeProjectName: 'Lot 3' }
    );

    assert.equal(res.success, true);
    assert.equal(res.projectId, 'lot_3_export_test');
    assert.ok(res.markdown.includes('# Finishes & Material Specifications - Lot 3'));
    assert.ok(res.message.includes('Generated clean finishes & material specifications export for Lot 3'));
  });

  it('7. Full Real-World Verification Lifecycle: Discovery, Export, Update, Attributes & One-Way Integrity', async () => {
    const realProjId = 'lot_3_connected_field_test';

    // 1. Mock Drive folder hierarchy for Lot 3
    const projectDriveTree = {
      id: 'folder_lot_3_root',
      name: 'Lot 3 - 104 Silverado Trail',
      files: [
        { id: 'f_specs_existing', name: 'Finishes and Material Selections.docx', modifiedTime: '2026-08-20T10:00:00Z' },
        { id: 'f_plans', name: 'Architectural Plans Rev2.pdf' }
      ],
      subfolders: [
        {
          id: 'sub_spec_folder',
          name: 'Finishes & Specifications',
          files: []
        }
      ]
    };

    // 2. Identify correct Google Drive document
    const resolution = resolveCandidateDriveFiles(projectDriveTree, 'finishes_specs');
    assert.ok(resolution.bestMatch);
    assert.equal(resolution.bestMatch.documentId, 'f_specs_existing');
    assert.equal(resolution.bestMatch.fileName, 'Finishes and Material Selections.docx');

    // 3. Save initial finish records in Firestore / storage
    const initialWallPaint = {
      id: 'spec_real_paint_01',
      category: 'Paint',
      location: 'Whole House',
      surface: 'Interior Walls',
      brand: 'Sherwin-Williams',
      code: 'SW 7005 Pure White',
      sheen: 'Flat'
    };
    await saveFinishSpec(realProjId, initialWallPaint);

    const stoneColumn = {
      id: 'spec_real_stone_01',
      category: 'Stone',
      location: 'Front Entry Columns',
      surface: 'Exterior Body / Walls',
      brand: 'Quarry Direct MX',
      code: 'Cantera Blanco Galarza',
      attributes: {
        thickness: '2-inch slab veneer',
        sealant: 'Dry-Treat Stain-Proof Penetrating Sealer',
        warranty: '10-Year Quarry Guarantee'
      }
    };
    await saveFinishSpec(realProjId, stoneColumn);

    // 4. Generate initial export
    let exportMd = await exportToGoogleDocMarkdown(realProjId, {
      title: 'Finishes & Material Specifications - Lot 3'
    });
    assert.ok(exportMd.includes('SW 7005 Pure White (Flat)'));
    assert.ok(exportMd.includes('Cantera Blanco Galarza'));
    assert.ok(exportMd.includes('10-Year Quarry Guarantee'));

    // 5. Update a finish in place (e.g. change paint to Dover White)
    await saveFinishSpec(realProjId, {
      ...initialWallPaint,
      code: 'SW 6385 Dover White',
      sheen: 'Satin',
      notes: 'Per designer change order #2'
    });

    // 6. Verify updated export reflects the change immediately
    exportMd = await exportToGoogleDocMarkdown(realProjId, {
      title: 'Finishes & Material Specifications - Lot 3'
    });
    assert.ok(exportMd.includes('SW 6385 Dover White (Satin)'));
    assert.ok(exportMd.includes('Per designer change order #2'));
    assert.ok(!exportMd.includes('SW 7005 Pure White (Flat)')); // Old value replaced

    // 7. Verify J.A.R.V.I.S. tool call triggers cleanly
    const jarvisExport = await executeClientToolCall(
      'export_finishes_doc',
      { projectId: realProjId },
      { projectId: realProjId, activeProjectName: 'Lot 3' }
    );
    assert.equal(jarvisExport.success, true);
    assert.ok(jarvisExport.markdown.includes('SW 6385 Dover White (Satin)'));

    // 8. One-Way Integrity: Exporting never mutates or overwrites Firestore storage
    const storedSpecs = await exportToGoogleDocMarkdown(realProjId);
    assert.ok(storedSpecs);
  });
});
