import {
  findOrCreateFolder,
  findSpreadsheetInFolder,
  listFilesWithDescriptionInFolder,
  moveFileInDrive
} from './googleDrive.js';
import { normalizeKey } from './sheetsDataService.js';

const GOOGLE_SHEETS_API_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

function getPhaseAliases(value) {
  const normalized = normalizeKey(value);
  const aliases = [normalized];
  if (normalized === 'framinglumber') aliases.push('framinglumbertruss');
  if (normalized === 'framinglumbertruss') aliases.push('framinglumber');
  if (normalized === 'tile') aliases.push('tileflooring');
  if (normalized === 'tileflooring') aliases.push('tile');
  if (normalized === 'paint') aliases.push('paintfinishes');
  if (normalized === 'paintfinishes') aliases.push('paint');
  return aliases;
}

function isPhaseHeaderLabel(value) {
  const label = String(value || '').trim();
  return label.startsWith('→') || label.startsWith('—') || label.startsWith('-') || label.startsWith('â');
}

/**
 * Synchronizes uploaded invoice PDFs directly to the Google Spreadsheet using the active Google access token.
 */
export async function syncUploadedInvoicesDirectly(accessToken, projectFolderId) {
  if (!accessToken) {
    throw new Error('Google authentication token is required for direct spreadsheet sync.');
  }
  if (!projectFolderId) {
    throw new Error('No project folder selected.');
  }

  // 1. Resolve Uploads and Archive folders
  const uploadsFolderId = await findOrCreateFolder(accessToken, 'Invoice Uploads', projectFolderId);
  const archiveFolderId = await findOrCreateFolder(accessToken, 'Processed Invoices', projectFolderId);

  // 2. Resolve Google Spreadsheet in the project folder
  const spreadsheet = await findSpreadsheetInFolder(accessToken, projectFolderId);
  if (!spreadsheet) {
    throw new Error('Could not find Google Spreadsheet in the selected project folder.');
  }
  const spreadsheetId = spreadsheet.id;

  // 3. List all files inside "Invoice Uploads"
  const pendingFiles = await listFilesWithDescriptionInFolder(accessToken, uploadsFolderId);
  const processableFiles = pendingFiles.filter((f) => {
    const mime = f.mimeType || '';
    return (mime === 'application/pdf' || mime.startsWith('image/')) && !mime.includes('spreadsheet');
  });

  if (processableFiles.length === 0) {
    return { ok: true, processedCount: 0, message: 'No new uploaded files found to sync.' };
  }

  // 4. Fetch full spreadsheet metadata to inspect sheet tab names
  const metaUrl = `${GOOGLE_SHEETS_API_BASE}/${spreadsheetId}?fields=sheets(properties(sheetId,title))`;
  const metaRes = await fetch(metaUrl, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!metaRes.ok) {
    throw new Error(`Failed to fetch spreadsheet metadata: ${await metaRes.text()}`);
  }
  const metaData = await metaRes.json();
  const sheetsList = metaData.sheets || [];

  let processedCount = 0;

  for (const file of processableFiles) {
    let metadata = null;
    if (file.description && file.description.trim().startsWith('{')) {
      try {
        metadata = JSON.parse(file.description);
      } catch (err) {
        console.warn('Failed to parse JSON description for file:', file.name, err);
      }
    }

    if (!metadata) {
      console.warn('Skipping file without JSON metadata:', file.name);
      continue;
    }

    const tradeCat = metadata.tradeCategory || '';
    const tradePh = metadata.tradePhase || '';

    if (!tradeCat || !tradePh) {
      console.warn('Missing category/phase in metadata:', metadata);
      continue;
    }

    // Resolve matching sheet tab
    const cleanTargetCat = normalizeKey(tradeCat);
    let matchedSheetProp = null;

    for (const sheetObj of sheetsList) {
      const title = sheetObj.properties?.title || '';
      if (normalizeKey(title) === cleanTargetCat) {
        matchedSheetProp = sheetObj.properties;
        break;
      }
    }

    if (!matchedSheetProp) {
      console.warn(`Sheet tab for category "${tradeCat}" not found in spreadsheet.`);
      continue;
    }

    const sheetTitle = matchedSheetProp.title;

    // Check for master log tab ("New_Invoices")
    let newInvoicesSheetTitle = null;
    for (const sheetObj of sheetsList) {
      const title = sheetObj.properties?.title || '';
      const cleanTitle = normalizeKey(title);
      if (cleanTitle === 'newinvoices' || cleanTitle === 'masterlog' || cleanTitle === 'invoicelog') {
        newInvoicesSheetTitle = title;
        break;
      }
    }

    const fileUrl = file.webViewLink || `https://drive.google.com/file/d/${file.id}/view`;
    const costCat = String(metadata.costCategory || 'material').toLowerCase();
    const rawCost = typeof metadata.amount === 'number' 
      ? metadata.amount 
      : (typeof metadata.totalCost === 'number' 
        ? metadata.totalCost 
        : parseFloat(metadata.amount || metadata.totalCost || metadata.cost || metadata.price || metadata.total) || 0);

    const vendor = metadata.vendor || metadata.contractorVendor || metadata.payee || metadata.contractor || '';
    const paymentDate = metadata.date || metadata.paymentDate || metadata.transactionDate || '';
    const checkNumber = metadata.checkNumber || metadata.checkNo || metadata.checkOrTrans || metadata.check || '';
    const taskDesc = metadata.description || metadata.desc || metadata.item || 'Scanned Invoice';

    if (newInvoicesSheetTitle) {
      try {
        const isLabor = costCat.includes('labor');
        const displayVal = rawCost > 0 ? rawCost : `"PDF"`;
        const masterMatVal = !isLabor ? `=HYPERLINK("${fileUrl}", ${displayVal})` : '';
        const masterLabVal = isLabor ? `=HYPERLINK("${fileUrl}", ${displayVal})` : '';

        const masterRow = [
          taskDesc,
          vendor,
          masterMatVal,
          masterLabVal,
          paymentDate,
          checkNumber
        ];
        const masterAppendUrl = `${GOOGLE_SHEETS_API_BASE}/${spreadsheetId}/values/'${encodeURIComponent(newInvoicesSheetTitle)}'!A1:F100:append?valueInputOption=USER_ENTERED`;
        await fetch(masterAppendUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ values: [masterRow] })
        });
      } catch (err) {
        console.warn('Failed to append to New_Invoices tab:', err);
      }
    }

    // Fetch tab values to find target phase row
    const rangeUrl = `${GOOGLE_SHEETS_API_BASE}/${spreadsheetId}/values/'${encodeURIComponent(sheetTitle)}'!A1:Z100`;
    const rangeRes = await fetch(rangeUrl, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (!rangeRes.ok) {
      console.warn(`Failed to read sheet tab "${sheetTitle}":`, await rangeRes.text());
      continue;
    }

    const rangeData = await rangeRes.json();
    const rows = rangeData.values || [];

    // Find target phase block row
    const targetAliases = getPhaseAliases(tradePh);
    let blockHeaderRowIdx = -1;

    for (let r = 0; r < rows.length; r++) {
      const colA = String(rows[r]?.[0] || '').trim();
      if (isPhaseHeaderLabel(colA)) {
        const cleanCol = normalizeKey(colA);
        if (targetAliases.some((alias) => cleanCol.includes(alias) || alias.includes(cleanCol))) {
          blockHeaderRowIdx = r;
          break;
        }
      }
    }

    if (blockHeaderRowIdx === -1) {
      console.warn(`Phase header "${tradePh}" not found in sheet tab "${sheetTitle}".`);
      continue;
    }

    // Find next block header
    let nextBlockHeaderRowIdx = rows.length;
    for (let r = blockHeaderRowIdx + 1; r < rows.length; r++) {
      const colA = String(rows[r]?.[0] || '').trim();
      if (isPhaseHeaderLabel(colA)) {
        nextBlockHeaderRowIdx = r;
        break;
      }
    }

    // Find empty row
    let targetRowIdx = -1;
    for (let r = blockHeaderRowIdx + 1; r < nextBlockHeaderRowIdx; r++) {
      const colB = String(rows[r]?.[1] || '').trim();
      const colC = String(rows[r]?.[2] || '').trim();
      const colD = String(rows[r]?.[3] || '').trim();
      if (!colB && !colC && !colD) {
        targetRowIdx = r;
        break;
      }
    }

    const isLabor = costCat.includes('labor');
    const displayVal = rawCost > 0 ? rawCost : `"PDF"`;
    const materialValue = !isLabor ? `=HYPERLINK("${fileUrl}", ${displayVal})` : '';
    const laborValue = isLabor ? `=HYPERLINK("${fileUrl}", ${displayVal})` : '';

    const rowValues = [
      taskDesc,
      vendor,
      materialValue,
      laborValue,
      paymentDate,
      checkNumber
    ];

    if (targetRowIdx !== -1) {
      // Update existing empty row (1-indexed)
      const targetRowNumber = targetRowIdx + 1;
      const updateUrl = `${GOOGLE_SHEETS_API_BASE}/${spreadsheetId}/values/'${encodeURIComponent(sheetTitle)}'!A${targetRowNumber}:F${targetRowNumber}?valueInputOption=USER_ENTERED`;
      await fetch(updateUrl, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ values: [rowValues] })
      });
    } else {
      // Append row below block
      const appendUrl = `${GOOGLE_SHEETS_API_BASE}/${spreadsheetId}/values/'${encodeURIComponent(sheetTitle)}'!A1:F100:append?valueInputOption=USER_ENTERED`;
      await fetch(appendUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ values: [rowValues] })
      });
    }

    // Move file to Processed Invoices
    await moveFileInDrive(accessToken, file.id, uploadsFolderId, archiveFolderId);
    processedCount++;
  }

  return { ok: true, processedCount };
}
