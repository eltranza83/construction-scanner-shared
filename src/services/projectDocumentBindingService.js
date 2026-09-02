/**
 * Reusable Google Drive Document Discovery & Binding Engine
 * 
 * Flow:
 * Document Type Configuration
 *   -> Generic Discovery
 *   -> Deterministic Candidate Scoring
 *   -> Dual-Persistence Binding
 *   -> Dynamic Provenance
 *   -> Read/Write
 */

import { getDocumentDefinition } from './projectDocumentRegistry.js';
import { resolvePurchasingAdapter } from './googleDocsPurchasingService.js';

export function buildDocumentProvenance(projectNameOrId = 'Project', docTypeKey = 'purchasing_checklist', isMaster = false) {
  const def = getDocumentDefinition(docTypeKey);
  const cleanId = String(projectNameOrId || 'Project').trim();
  if (isMaster || cleanId.toLowerCase() === 'master' || cleanId.toLowerCase() === 'purchasing_master') {
    return 'Google Docs (Master ' + def.displayName + ')';
  }
  return 'Google Docs (' + cleanId + ' ' + def.displayName + ')';
}

export function extractBoundDocumentMetadata(rawContent = '') {
  if (!rawContent || typeof rawContent !== 'string') {
    return { documentId: null, fileName: null, masterVersion: null };
  }
  const idMatch = rawContent.match(/DocumentId:\s*([^\s\n]+)/i);
  const nameMatch = rawContent.match(/DocumentName:\s*([^\n]+)/i);
  const verMatch = rawContent.match(/<!--\s*(?:version|initial_master_version):\s*([^\s>]+)\s*-->/i);
  return {
    documentId: idMatch ? idMatch[1].trim() : null,
    fileName: nameMatch ? nameMatch[1].trim() : null,
    masterVersion: verMatch ? verMatch[1].trim() : null
  };
}

export function resolveCandidateDriveFiles(driveTree, docTypeKey = 'purchasing_checklist') {
  const def = getDocumentDefinition(docTypeKey);
  if (!driveTree) return { candidates: [], bestMatch: null, isAmbiguous: false, ambiguityReason: null };

  const rawCandidates = [];

  function evaluateCandidate(file, folderName = 'Google Drive') {
    const fileName = String(file.name || file.title || '').trim();
    const lowerName = fileName.toLowerCase();
    const lowerFolder = String(folderName || '').toLowerCase();
    const canonicalLower = (def.canonicalFileName || '').toLowerCase();
    const cleanLowerName = lowerName.replace(/\.(docx|gdoc)$/i, '');

    const isExactCanonical = lowerName === canonicalLower || cleanLowerName === canonicalLower;
    const folderMatch = def.folderPatterns.some(fp => lowerFolder.includes(fp));
    const fileMatch = def.filePatterns.some(fp => fp.test(lowerName) || lowerName.includes(String(fp).replace(/[^a-z0-9]/gi, '')));

    if (!isExactCanonical && !folderMatch && !fileMatch) return null;

    let score = 0;
    const scoreBreakdown = [];

    if (isExactCanonical) {
      score += 100;
      scoreBreakdown.push('exact_canonical_name (+100)');
    }
    if (folderMatch) {
      score += 50;
      scoreBreakdown.push('designated_folder (+50)');
    }
    if (fileMatch && !isExactCanonical) {
      score += 40;
      scoreBreakdown.push('file_pattern_match (+40)');
    }

    const isCopyOrBackup = /\b(copy|backup|old|draft|temp|bak)\b/i.test(lowerName) || /\(\d+\)/.test(lowerName) || /_copy|_old|-copy|-old/i.test(lowerName);
    if (isCopyOrBackup) {
      score -= 80;
      scoreBreakdown.push('copy_or_backup_penalty (-80)');
    }

    const modTime = file.modifiedTime || file.updatedAt || file.lastModified || null;
    let tieBreaker = 0;
    if (modTime) {
      const ms = new Date(modTime).getTime();
      if (!isNaN(ms)) {
        tieBreaker = (ms % 1000000000) / 1000000000;
      }
    }

    const totalScore = score + tieBreaker;

    return {
      file,
      documentId: file.id || file.fileId,
      fileName,
      folderName,
      baseScore: score,
      totalScore,
      isExactCanonical,
      isCopyOrBackup,
      modifiedTime: modTime,
      scoreBreakdown
    };
  }

  const folderList = Array.isArray(driveTree.subfolders) ? driveTree.subfolders : (Array.isArray(driveTree.folders) ? driveTree.folders : []);
  for (const sub of folderList) {
    const folderName = sub.folderName || sub.name || 'Google Drive';
    if (Array.isArray(sub.files)) {
      for (const file of sub.files) {
        const res = evaluateCandidate(file, folderName);
        if (res && res.baseScore > 0) rawCandidates.push(res);
      }
    }
  }

  const directList = Array.isArray(driveTree.directFiles) ? driveTree.directFiles : (Array.isArray(driveTree.files) ? driveTree.files : []);
  for (const file of directList) {
    const res = evaluateCandidate(file, 'Google Drive');
    if (res && res.baseScore > 0) rawCandidates.push(res);
  }

  rawCandidates.sort((a, b) => b.totalScore - a.totalScore);

  if (rawCandidates.length === 0) {
    return { candidates: [], bestMatch: null, isAmbiguous: false, ambiguityReason: null };
  }

  if (rawCandidates.length === 1) {
    return { candidates: rawCandidates, bestMatch: rawCandidates[0], isAmbiguous: false, ambiguityReason: null };
  }

  const top1 = rawCandidates[0];
  const top2 = rawCandidates[1];

  const scoreDiff = Math.abs(top1.baseScore - top2.baseScore);
  const isAmbiguous = scoreDiff < 5 && !top1.isExactCanonical && !top2.isExactCanonical;

  return {
    candidates: rawCandidates,
    bestMatch: isAmbiguous ? null : top1,
    isAmbiguous,
    ambiguityReason: isAmbiguous
      ? 'Found multiple competing candidates with equal match confidence (' + top1.fileName + ' vs ' + top2.fileName + '). Manual selection required.'
      : null
  };
}

export function discoverAndBindProjectDocument(storageOrAdapter, projectId = 'default', docTypeKey = 'purchasing_checklist', projectContext = {}, options = {}) {
  const def = getDocumentDefinition(docTypeKey);
  const cleanId = String(projectId || 'default').trim();
  const isMaster = cleanId === 'master' || cleanId === 'purchasing_master' || options.isMaster;

  if (!cleanId || isMaster) {
    return {
      found: true,
      isMaster: true,
      isAmbiguous: false,
      documentId: 'master_doc',
      fileName: 'Master ' + def.displayName,
      folderName: 'Parent Folder',
      sourceLabel: buildDocumentProvenance('Master', docTypeKey, true),
      resourceType: def.masterResourceType,
      isBound: true,
      isBoundDurable: true,
      content: null
    };
  }

  const adapter = resolvePurchasingAdapter(storageOrAdapter);
  const currentDoc = adapter.getProjectDocument(cleanId, '', def.docType);
  const existingMeta = extractBoundDocumentMetadata(currentDoc);

  const bindingKey = 'sitetactix_doc_binding_' + cleanId + '_' + def.docType;
  let durableBinding = null;
  if (typeof storageOrAdapter?.getItem === 'function') {
    try {
      const raw = storageOrAdapter.getItem(bindingKey);
      if (raw) durableBinding = JSON.parse(raw);
    } catch {}
  }

  // 1. Authoritative Binding Reuse
  if (durableBinding && durableBinding.documentId) {
    return {
      found: true,
      isMaster: false,
      isAmbiguous: false,
      documentId: durableBinding.documentId,
      fileName: durableBinding.fileName || def.canonicalFileName,
      folderName: durableBinding.folderName || def.defaultFolderName,
      sourceLabel: buildDocumentProvenance(projectContext?.activeProjectName || cleanId, docTypeKey, false),
      resourceType: def.projectResourceType,
      isBound: true,
      isBoundDurable: true,
      candidateCount: 1,
      content: (currentDoc && (currentDoc.includes('- [ ]') || currentDoc.includes('- [x]'))) ? currentDoc : null
    };
  }

  // 2. Embedded Header Tag Reuse
  if (existingMeta.documentId) {
    if (typeof storageOrAdapter?.setItem === 'function') {
      try {
        storageOrAdapter.setItem(bindingKey, JSON.stringify({
          documentId: existingMeta.documentId,
          fileName: existingMeta.fileName || def.canonicalFileName,
          boundAt: new Date().toISOString()
        }));
      } catch {}
    }

    return {
      found: true,
      isMaster: false,
      isAmbiguous: false,
      documentId: existingMeta.documentId,
      fileName: existingMeta.fileName || def.canonicalFileName,
      folderName: def.defaultFolderName,
      sourceLabel: buildDocumentProvenance(projectContext?.activeProjectName || cleanId, docTypeKey, false),
      resourceType: def.projectResourceType,
      isBound: true,
      isBoundDurable: true,
      candidateCount: 1,
      content: (currentDoc && (currentDoc.includes('- [ ]') || currentDoc.includes('- [x]'))) ? currentDoc : null
    };
  }

  // 3. Scan Google Drive Tree
  const driveTree = projectContext?.driveTree || projectContext?.currentLiveTree || projectContext?.dashboardData?.driveTree || null;
  const resolution = resolveCandidateDriveFiles(driveTree, docTypeKey);

  // 4. Handle Ambiguous Candidates Safely
  if (resolution.isAmbiguous) {
    return {
      found: false,
      isMaster: false,
      isAmbiguous: true,
      ambiguityReason: resolution.ambiguityReason,
      candidates: resolution.candidates.map(c => ({
        documentId: c.documentId,
        fileName: c.fileName,
        folderName: c.folderName,
        score: c.baseScore
      })),
      documentId: null,
      fileName: null,
      folderName: null,
      sourceLabel: buildDocumentProvenance(projectContext?.activeProjectName || cleanId, docTypeKey, false),
      resourceType: def.projectResourceType,
      isBound: false,
      isBoundDurable: false,
      candidateCount: resolution.candidates.length,
      content: currentDoc || null
    };
  }

  // 5. Best Candidate Match Discovered
  if (resolution.bestMatch) {
    const best = resolution.bestMatch;
    const docId = best.documentId;
    const docName = best.fileName;
    const folderName = best.folderName;

    let boundContent = currentDoc;
    if (!boundContent) {
      boundContent = def.projectTemplate(cleanId, docId, docName, 'v1.0');
    } else if (!boundContent.includes('DocumentId: ' + docId)) {
      boundContent = boundContent.replace(/^(# .*?\n)/m, '$1DocumentId: ' + docId + '\nDocumentName: ' + docName + '\n');
    }

    adapter.saveProjectDocument(cleanId, boundContent, def.docType);

    if (typeof storageOrAdapter?.setItem === 'function') {
      try {
        storageOrAdapter.setItem(bindingKey, JSON.stringify({
          documentId: docId,
          fileName: docName,
          folderName,
          boundAt: new Date().toISOString(),
          score: best.baseScore
        }));
      } catch {}
    }

    return {
      found: true,
      isMaster: false,
      isAmbiguous: false,
      documentId: docId,
      fileName: docName,
      folderName,
      sourceLabel: buildDocumentProvenance(projectContext?.activeProjectName || cleanId, docTypeKey, false),
      resourceType: def.projectResourceType,
      isBound: true,
      isBoundDurable: true,
      candidateCount: resolution.candidates.length,
      content: boundContent
    };
  }

  // 6. Genuinely Missing Document in Drive
  return {
    found: false,
    isMaster: false,
    isAmbiguous: false,
    documentId: null,
    fileName: null,
    folderName: null,
    sourceLabel: buildDocumentProvenance(projectContext?.activeProjectName || cleanId, docTypeKey, false),
    resourceType: def.projectResourceType,
    isBound: false,
    isBoundDurable: false,
    candidateCount: 0,
    content: currentDoc || null,
    masterTemplateAvailable: Boolean(def.masterTemplate)
  };
}
