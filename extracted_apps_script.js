// --- CONFIGURATION ---
// Securely retrieve Gemini API Key from project properties to prevent public code leak blocks
const GEMINI_API_KEY = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY') || '';
const WEBHOOK_SECRET = PropertiesService.getScriptProperties().getProperty('WEBHOOK_SECRET') || '';
const INVOICE_FOLDER_ID = '16yDqZ5lhfoSCY-J8wRuZl0_9uM30wIHD'; // 'Invoice Uploads'
const ARCHIVE_FOLDER_ID = '1jdgw6v438N3RQksN_JpvhTwyJNwuSJhf'; // 'Processed Invoices'
const SPREADSHEET_ID = '1kaVNSq0hC4A97EtYNE_lapznWillaKigF_Nn9icSUYs'; // 'test project spreadsheet'
const SHEET_NAME = 'New_Invoices';
// ---------------------

// Global logging buffer
let currentLogBuffer = "";

function isAuthorizedRequest(e) {
  if (!WEBHOOK_SECRET) return true;
  const receivedSecret = e && e.parameter ? String(e.parameter.secret || '') : '';
  return receivedSecret === WEBHOOK_SECRET;
}

function getServiceUrlWithSecret() {
  const serviceUrl = ScriptApp.getService().getUrl();
  if (!WEBHOOK_SECRET) return serviceUrl;
  const separator = serviceUrl.indexOf('?') === -1 ? '?' : '&';
  return `${serviceUrl}${separator}secret=${encodeURIComponent(WEBHOOK_SECRET)}`;
}

function getServiceUrlWithParams(params) {
  const baseUrl = getServiceUrlWithSecret();
  const separator = baseUrl.indexOf('?') === -1 ? '?' : '&';
  const query = Object.keys(params)
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
    .join('&');
  return `${baseUrl}${separator}${query}`;
}

/**
 * Custom logger helper to output to both console and Google Drive log.
 */
function addLog(message) {
  console.log(message);
  currentLogBuffer += message + "\n";
}

/**
 * Writes the global log buffer to a file named sync_log.txt in the active folder.
 */
function writeLogFile(folderId) {
  try {
    const folder = DriveApp.getFolderById(folderId);
    const files = folder.getFilesByName("sync_log.txt");
    const timestamp = new Date().toLocaleString();
    const formattedBuffer = `--- Sync Execution at ${timestamp} ---\n${currentLogBuffer}\n`;
    
    if (files.hasNext()) {
      const file = files.next();
      const currentContent = file.getAs("text/plain").getDataAsString();
      file.setContent(currentContent + "\n" + formattedBuffer);
    } else {
      folder.createFile("sync_log.txt", formattedBuffer, MimeType.PLAIN_TEXT);
    }
  } catch (err) {
    console.log("Failed to write sync_log.txt: " + err.message);
  }
}

/**
 * Logs a transaction directly into the matching category sheet under the correct phase block.
 */
function logTransactionToCategorySheet(ss, category, phase, rowData, categoryType) {
  const sheet = ss.getSheetByName(category);
  if (!sheet) {
    addLog(`Subcontractor sheet tab '${category}' not found. Direct log skipped.`);
    return;
  }

  const values = sheet.getDataRange().getValues();
  let blockHeaderRowIdx = -1;

  function normalizePhaseLabel(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/^(→|â†’|—|â€”|-|\u2192)\s*/, '')
      .replace(/[^a-z0-9]/g, '');
  }

  function getPhaseAliases(value) {
    const normalized = normalizePhaseLabel(value);
    const aliases = [normalized];
    if (normalized === 'framinglumber') {
      aliases.push('framinglumbertruss');
    }
    if (normalized === 'framinglumbertruss') {
      aliases.push('framinglumber');
    }
    if (normalized === 'tile') {
      aliases.push('tileflooring');
    }
    if (normalized === 'tileflooring') {
      aliases.push('tile');
    }
    if (normalized === 'paint') {
      aliases.push('paintfinishes');
    }
    if (normalized === 'paintfinishes') {
      aliases.push('paint');
    }
    return aliases;
  }

  function isPhaseHeaderLabel(value) {
    const label = String(value || '').trim();
    return label.startsWith('\u2192') || label.startsWith('â') || label.startsWith('-');
  }
  
  // Find phase header row index (e.g. '→ Plumbing Rough-In')
  const cleanTargetPhase = phase.toLowerCase().replace(/[^a-z0-9]/g, '');
  
  for (let r = 0; r < values.length; r++) {
    const colA = String(values[r][0] || '').trim();
    if (colA.startsWith('→') || colA.startsWith('—') || colA.startsWith('-')) {
      const cleanPhase = colA.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (cleanPhase === cleanTargetPhase) {
        blockHeaderRowIdx = r;
        break;
      }
    }
  }

  if (blockHeaderRowIdx === -1) {
    const targetAliases = getPhaseAliases(phase);
    for (let r = 0; r < values.length; r++) {
      if (!isPhaseHeaderLabel(values[r][0])) continue;
      const cleanPhase = normalizePhaseLabel(values[r][0]);
      if (targetAliases.includes(cleanPhase)) {
        blockHeaderRowIdx = r;
        break;
      }
    }
  }

  if (blockHeaderRowIdx === -1) {
    addLog(`Phase block '${phase}' not found inside '${category}' sheet. Direct log skipped.`);
    return;
  }

  // Find where the next phase block starts
  let nextBlockHeaderRowIdx = values.length;
  for (let r = blockHeaderRowIdx + 1; r < values.length; r++) {
    const colA = String(values[r][0] || '').trim();
    if (isPhaseHeaderLabel(colA)) {
      nextBlockHeaderRowIdx = r;
      break;
    }
    if (colA.startsWith('→') || colA.startsWith('—') || colA.startsWith('-')) {
      nextBlockHeaderRowIdx = r;
      break;
    }
  }

  // Look for the first empty row (where columns B, C, D are empty) inside this block
  let targetRowIdx = -1;
  for (let r = blockHeaderRowIdx + 1; r < nextBlockHeaderRowIdx; r++) {
    const colB = String(values[r][1] || '').trim(); // Vendor
    const colC = String(values[r][2] || '').trim(); // Material
    const colD = String(values[r][3] || '').trim(); // Labor
    
    if (colB === '' && colC === '' && colD === '') {
      targetRowIdx = r;
      break;
    }
  }

  // If no empty row was found inside the block, insert a new row before the next block header
  if (targetRowIdx === -1) {
    targetRowIdx = nextBlockHeaderRowIdx;
    sheet.insertRowBefore(targetRowIdx + 1); // 1-indexed insertion
    addLog(`No empty slot. Inserting new row at index ${targetRowIdx + 1} inside block.`);
  }

  // Write values into columns A to F of target row
  const rowNumber = targetRowIdx + 1;
  sheet.getRange(rowNumber, 1).setValue(rowData[0]); // A: Task Description
  sheet.getRange(rowNumber, 2).setValue(rowData[1]); // B: Contractor / Vendor

  const matCostCell = sheet.getRange(rowNumber, 3);   // C: Material Cost
  const labCostCell = sheet.getRange(rowNumber, 4);   // D: Labor Cost

  matCostCell.setValue(rowData[2]);
  labCostCell.setValue(rowData[3]);
  sheet.getRange(rowNumber, 5).setValue(rowData[4]); // E: Payment Date
  sheet.getRange(rowNumber, 6).setValue(rowData[5]); // F: Check or Trans #

  // Apply hyperlinks format styling
  if (rowData[2] && rowData[2] !== '') {
    matCostCell.setNumberFormat("$#,##0.00");
    matCostCell.setFontColor("#1155cc");
    matCostCell.setFontLine("underline");
  }
  if (rowData[3] && rowData[3] !== '') {
    labCostCell.setNumberFormat("$#,##0.00");
    labCostCell.setFontColor("#1155cc");
    labCostCell.setFontLine("underline");
  }

  addLog(`Successfully logged transaction directly to sheet '${category}' row ${rowNumber}.`);
}

/**
 * Main function to check and process new files in the Invoice Uploads folder.
 */
function parseNewInvoices(mainFolderId) {
  // Wait 4 seconds for Google Drive's search index to register the new file
  Utilities.sleep(4000);
  
  let folderId = INVOICE_FOLDER_ID;
  let archiveFolderId = ARCHIVE_FOLDER_ID;
  let spreadsheetId = SPREADSHEET_ID;
  
  currentLogBuffer = ""; // Reset log buffer for this execution
  
  try {
    if (mainFolderId) {
      folderId = mainFolderId; // Default to using the passed folder itself as the uploads folder
      try {
        const mainFolder = DriveApp.getFolderById(mainFolderId);
        
        // 1. Locate or create "App Folders" operational container under the main Lot folder
        let appFoldersContainer = null;
        const rootSubfolders = mainFolder.getFolders();
        while (rootSubfolders.hasNext()) {
          const sub = rootSubfolders.next();
          if (sub.getName().toLowerCase() === "app folders") {
            appFoldersContainer = sub;
            break;
          }
        }
        if (!appFoldersContainer) {
          appFoldersContainer = mainFolder.createFolder("App Folders");
        }

        // 2. Find or create "Invoice Uploads" and "Processed Invoices" inside "App Folders"
        let foundUploads = false;
        let foundArchive = false;
        const appSubfolders = appFoldersContainer.getFolders();
        while (appSubfolders.hasNext()) {
          const sub = appSubfolders.next();
          const name = sub.getName().toLowerCase();
          if (name === "invoice uploads" || name.includes("uploads")) {
            folderId = sub.getId();
            foundUploads = true;
          } else if (name === "processed invoices" || name.includes("processed") || name.includes("archive")) {
            archiveFolderId = sub.getId();
            foundArchive = true;
          }
        }
        
        if (!foundUploads) {
          const newUploads = appFoldersContainer.createFolder("Invoice Uploads");
          folderId = newUploads.getId();
        }
        
        if (!foundArchive) {
          const newArchive = appFoldersContainer.createFolder("Processed Invoices");
          archiveFolderId = newArchive.getId();
        }
        
        // 3. Find the Google Spreadsheet inside "App Folders", "Master Budget Sheet", or main folder
        const searchContainers = [appFoldersContainer, mainFolder];
        const innerFolders = appFoldersContainer.getFolders();
        while (innerFolders.hasNext()) {
          const sub = innerFolders.next();
          if (sub.getName().toLowerCase().includes("budget")) {
            searchContainers.unshift(sub); // Prioritize Master Budget Sheet
            break;
          }
        }

        for (let i = 0; i < searchContainers.length; i++) {
          const filesInContainer = searchContainers[i].getFiles();
          while (filesInContainer.hasNext()) {
            const f = filesInContainer.next();
            if (f.getMimeType() === MimeType.GOOGLE_SHEETS) {
              spreadsheetId = f.getId();
              break;
            }
          }
          if (spreadsheetId) break;
        }
        
        addLog(`Resolved project IDs dynamically via App Folders: Uploads folder = ${folderId}, Archive = ${archiveFolderId}, Spreadsheet = ${spreadsheetId}`);
      } catch (e) {
        addLog(`Error resolving dynamic App Folders for mainFolderId ${mainFolderId}: ${e.message}.`);
      }
    }
    
    const folder = DriveApp.getFolderById(folderId);
    const archiveFolder = DriveApp.getFolderById(archiveFolderId);
    const files = folder.getFiles();
    
    const ss = SpreadsheetApp.openById(spreadsheetId);
    const masterLogSheet = ss.getSheetByName(SHEET_NAME);
    
    let processedCount = 0;
    
    while (files.hasNext()) {
      const file = files.next();
      const mimeType = file.getMimeType();
      const fileName = file.getName();
      const fileUrl = file.getUrl();
      
      // Skip subfolders, Google Sheets, and non-invoice file types
      if (mimeType === MimeType.FOLDER || mimeType.includes('spreadsheet') || mimeType.includes('sheet') || mimeType.includes('excel')) {
        addLog(`Skipping spreadsheet/non-invoice file: ${fileName} (${mimeType})`);
        continue;
      }
      
      // Only process PDFs and Images
      if (mimeType !== 'application/pdf' && !mimeType.startsWith('image/')) {
        addLog(`Skipping unsupported file format: ${fileName} (${mimeType})`);
        continue;
      }
      
      addLog(`Processing file: ${fileName} (${mimeType})...`);
      
      // 1. Check filename for classification hint ("material" or "labor")
      const dotIndex = fileName.lastIndexOf('.');
      const nameWithoutExt = (dotIndex !== -1 ? fileName.substring(0, dotIndex) : fileName).trim().toLowerCase();
      
      let forceMaterial = false;
      let forceLabor = false;
      
      if (nameWithoutExt.includes('material')) {
        forceMaterial = true;
        addLog(`Filename hint detected: Classifying as Material Cost.`);
      } else if (nameWithoutExt.includes('labor')) {
        forceLabor = true;
        addLog(`Filename hint detected: Classifying as Labor Cost.`);
      }
      
      try {
        // 2. Extract data: Check description first, fallback to Gemini API
        let parsedData = null;
        const fileDescription = file.getDescription();
        addLog(`File description retrieved: ${fileDescription}`);
        if (fileDescription && fileDescription.trim().startsWith('{')) {
          try {
            const rawMetadata = JSON.parse(fileDescription);
            parsedData = {
              taskDescription: rawMetadata.description || rawMetadata.taskDescription || '',
              contractorVendor: rawMetadata.vendor || rawMetadata.contractorVendor || '',
              totalCost: parseFloat(rawMetadata.amount !== undefined ? rawMetadata.amount : rawMetadata.totalCost) || 0,
              costCategory: rawMetadata.costCategory || 'material',
              paymentDate: rawMetadata.date || rawMetadata.paymentDate || '',
              checkNumber: rawMetadata.checkNumber || null,
              splits: rawMetadata.splits || null,
              tradeCategory: rawMetadata.tradeCategory || '',
              tradePhase: rawMetadata.tradePhase || ''
            };
            addLog(`Successfully parsed and normalized metadata from Drive file description.`);
          } catch (e) {
            addLog(`Failed to parse metadata from description, falling back to Gemini OCR: ${e.message}`);
          }
        }
        
        if (!parsedData) {
          parsedData = extractDataWithGemini(file, mimeType);
        }
        
        if (parsedData) {
          addLog(`Successfully parsed: ${JSON.stringify(parsedData)}`);
          
          let finalMaterialCost = '';
          let finalLaborCost = '';
          
          // 3. Determine category: filename hint takes priority, otherwise use Gemini's classification
          let category = 'material'; // default fallback
          if (forceMaterial) {
            category = 'material';
          } else if (forceLabor) {
            category = 'labor';
          } else if (parsedData.costCategory) {
            category = parsedData.costCategory.toLowerCase();
          }
          
          // Write the complete grand total into the single appropriate category column
          if (category === 'material') {
            finalMaterialCost = typeof parsedData.totalCost === 'number' ? parsedData.totalCost : '';
          } else {
            finalLaborCost = typeof parsedData.totalCost === 'number' ? parsedData.totalCost : '';
          }
          
          const paymentDate = parsedData.paymentDate || '';
          
          // Ensure check number defaults to 0 if null, undefined, "null", or "N/A"
          let finalCheckNumber = 0;
          if (parsedData.checkNumber !== undefined && parsedData.checkNumber !== null) {
            const checkStr = String(parsedData.checkNumber).trim();
            if (checkStr !== '' && checkStr.toLowerCase() !== 'null' && checkStr.toLowerCase() !== 'n/a') {
              finalCheckNumber = checkStr;
            }
          }
          
          // 4. Write data to the spreadsheet (handling multiple splits or single grand total)
          if (parsedData.splits && parsedData.splits.length > 0) {
            // Identify current project/lot name from folder name or parent (if folder name is "Invoice Uploads")
            let currentLotName = "";
            try {
              if (mainFolderId) {
                const folder = DriveApp.getFolderById(mainFolderId);
                const folderName = folder.getName().toLowerCase();
                if (folderName.includes("uploads") || folderName.includes("invoice uploads")) {
                  const parents = folder.getParents();
                  if (parents.hasNext()) {
                    currentLotName = parents.next().getName().toLowerCase();
                  } else {
                    currentLotName = folderName;
                  }
                } else {
                  currentLotName = folderName;
                }
              }
            } catch (err) {
              addLog("Could not resolve folder name: " + err.message);
            }

            // Loop through each split
            parsedData.splits.forEach(split => {
              // Check if this split matches the current lot
              const splitLot = String(split.lotNumber || '').trim().toLowerCase();
              const isMatch = !currentLotName || currentLotName.includes(splitLot) || splitLot.includes(currentLotName);
              
              addLog(`Evaluating split for lot "${splitLot}" against current resolved lot "${currentLotName}". Match = ${isMatch}`);
              
              if (isMatch) {
                let finalMaterialCost = '';
                let finalLaborCost = '';
                
                if (split.costCategory === 'material') {
                  finalMaterialCost = typeof split.amount === 'number' ? split.amount : '';
                } else {
                  finalLaborCost = typeof split.amount === 'number' ? split.amount : '';
                }
                
                const materialValue = (typeof finalMaterialCost === 'number' && finalMaterialCost !== 0) 
                    ? `=HYPERLINK("${fileUrl}", ${finalMaterialCost})` 
                    : '';
                const laborValue = (typeof finalLaborCost === 'number' && finalLaborCost !== 0) 
                    ? `=HYPERLINK("${fileUrl}", ${finalLaborCost})` 
                    : '';
                
                // Include project phase dynamically inside task description for downstream formula processing
                const finalDesc = `[Split - ${split.tradePhase || 'General'}] ${split.description || parsedData.taskDescription}`;
                
                const rowData = [
                  finalDesc,
                  parsedData.contractorVendor,
                  materialValue,
                  laborValue,
                  paymentDate,
                  finalCheckNumber
                ];
                
                // A. Append to Master chronological log tab
                if (masterLogSheet) {
                  masterLogSheet.appendRow(rowData);
                  addLog(`Appended split row to Master Log: ${JSON.stringify(rowData)}`);
                  const lastRow = masterLogSheet.getLastRow();
                  const mCell = masterLogSheet.getRange(lastRow, 3);
                  const lCell = masterLogSheet.getRange(lastRow, 4);
                  if (materialValue) {
                    mCell.setNumberFormat("$#,##0.00");
                    mCell.setFontColor("#1155cc");
                    mCell.setFontLine("underline");
                  }
                  if (laborValue) {
                    lCell.setNumberFormat("$#,##0.00");
                    lCell.setFontColor("#1155cc");
                    lCell.setFontLine("underline");
                  }
                }
                
                // B. Log row directly into the correct subcontractor tab and phase block
                const tradeCat = split.tradeCategory || parsedData.tradeCategory;
                const tradePh = split.tradePhase || parsedData.tradePhase;
                if (tradeCat && tradePh) {
                  const categoryType = split.costCategory || 'material';
                  const categoryDesc = split.description || parsedData.taskDescription;
                  const categoryRowData = [
                    categoryDesc,
                    parsedData.contractorVendor,
                    materialValue,
                    laborValue,
                    paymentDate,
                    finalCheckNumber
                  ];
                  logTransactionToCategorySheet(ss, tradeCat, tradePh, categoryRowData, categoryType);
                } else {
                  addLog(`Skipping category log for split: tradeCategory or tradePhase is missing.`);
                }
              }
            });
            
            processedCount++;
          } else {
            // Fallback: log single grand total row
            const materialValue = (typeof finalMaterialCost === 'number' && finalMaterialCost !== 0) 
                ? `=HYPERLINK("${fileUrl}", ${finalMaterialCost})` 
                : '';
            const laborValue = (typeof finalLaborCost === 'number' && finalLaborCost !== 0) 
                ? `=HYPERLINK("${fileUrl}", ${finalLaborCost})` 
                : '';
            
            const rowData = [
              parsedData.taskDescription,
              parsedData.contractorVendor,
              materialValue,
              laborValue,
              paymentDate,
              finalCheckNumber
            ];
            
            // A. Append to Master chronological log tab
            if (masterLogSheet) {
              masterLogSheet.appendRow(rowData);
              addLog(`Appended fallback row to Master Log: ${JSON.stringify(rowData)}`);
              const lastRow = masterLogSheet.getLastRow();
              const mCell = masterLogSheet.getRange(lastRow, 3);
              const lCell = masterLogSheet.getRange(lastRow, 4);
              if (materialValue) {
                mCell.setNumberFormat("$#,##0.00");
                mCell.setFontColor("#1155cc");
                mCell.setFontLine("underline");
              }
              if (laborValue) {
                lCell.setNumberFormat("$#,##0.00");
                lCell.setFontColor("#1155cc");
                lCell.setFontLine("underline");
              }
            }
            
            // B. Log row directly into the correct subcontractor tab and phase block
            if (parsedData.tradeCategory && parsedData.tradePhase) {
              logTransactionToCategorySheet(
                ss, 
                parsedData.tradeCategory, 
                parsedData.tradePhase, 
                rowData, 
                category
              );
            } else {
              addLog("No subcontractor classification found. Skipping direct block append.");
            }
            
            processedCount++;
          }

          // 5. Move the file to Vendors / Stores / [Vendor Name] if vendor is confident, else Unknown Vendors exception queue
          let destinationFolder = null;
          const vendorName = parsedData.contractorVendor || '';
          if (isConfidentVendorInAppsScript(vendorName)) {
            try {
              destinationFolder = ensureVendorFolderInAppsScript(appFoldersContainer, vendorName.trim());
            } catch (vErr) {
              addLog(`Failed to resolve vendor folder for "${vendorName}": ${vErr.message}. Falling back to Unknown Vendors.`);
            }
          }

          if (!destinationFolder) {
            destinationFolder = ensureUnknownVendorsFolderInAppsScript(appFoldersContainer);
          }

          file.moveTo(destinationFolder);
          addLog(`Moved ${fileName} to folder "${destinationFolder.getName()}".`);
        } else {
          addLog(`Failed to parse data for ${fileName}`);
        }
        
      } catch (e) {
        addLog(`Error processing ${fileName}: ${e.message}`);
      }
    }
    
    addLog(`Finished checking folder. Processed ${processedCount} new files.`);
  } catch (err) {
    addLog(`Fatal Execution Error: ${err.message}`);
  } finally {
    writeLogFile(folderId);
  }
}

/**
 * Ensures Vendors / Stores and the specific vendor folder exist inside App Folders.
 */
function ensureVendorFolderInAppsScript(appFoldersContainer, vendorName) {
  if (!appFoldersContainer || !vendorName) return null;
  
  // 1. Locate or create "Vendors / Stores" inside "App Folders"
  let vendorsStoresFolder = null;
  const subs = appFoldersContainer.getFolders();
  while (subs.hasNext()) {
    const sub = subs.next();
    const subName = sub.getName().toLowerCase();
    if (subName === "vendors / stores" || subName === "vendors/stores" || subName === "vendors") {
      vendorsStoresFolder = sub;
      break;
    }
  }
  if (!vendorsStoresFolder) {
    vendorsStoresFolder = appFoldersContainer.createFolder("Vendors / Stores");
  }

  // 2. Clean vendor name
  const cleanVendor = String(vendorName).trim().replace(/[/\\?%*:|"<>]/g, ' ').replace(/\s+/g, ' ');
  if (!cleanVendor) return vendorsStoresFolder;

  // 3. Locate or create the vendor folder inside "Vendors / Stores"
  const vSubs = vendorsStoresFolder.getFolders();
  while (vSubs.hasNext()) {
    const vSub = vSubs.next();
    if (vSub.getName().toLowerCase() === cleanVendor.toLowerCase()) {
      return vSub;
    }
  }
  return vendorsStoresFolder.createFolder(cleanVendor);
}

/**
 * Checks if a vendor name string is confident vs generic placeholder/unidentified in Apps Script.
 */
function isConfidentVendorInAppsScript(vendor) {
  if (!vendor || typeof vendor !== 'string') return false;
  const trimmed = vendor.trim();
  if (trimmed.length < 2) return false;

  const lower = trimmed.toLowerCase();
  const unconfidentKeywords = [
    'unknown', 'unidentified', 'n/a', 'na', 'none', 'null', 'undefined',
    'pending', 'unspecified', 'general', 'receipt', 'invoice', 'statement',
    'cash', 'visa', 'mastercard', 'amex', 'discover', 'debit', 'credit',
    'credit card', 'total', 'subtotal', 'customer copy', 'merchant copy',
    'store', 'vendor', 'contractor', 'payee'
  ];

  if (unconfidentKeywords.includes(lower)) return false;

  const letterCount = (trimmed.match(/[a-zA-Z\u00C0-\u024F]/g) || []).length;
  if (letterCount < 2) return false;

  return true;
}

/**
 * Ensures the 'Unknown Vendors' exception queue folder exists inside App Folders in Apps Script.
 */
function ensureUnknownVendorsFolderInAppsScript(appFoldersContainer) {
  if (!appFoldersContainer) return null;
  const subs = appFoldersContainer.getFolders();
  while (subs.hasNext()) {
    const sub = subs.next();
    const subName = sub.getName().toLowerCase();
    if (subName === "unknown vendors" || subName === "unknown_vendors" || subName === "unidentified vendors") {
      return sub;
    }
  }
  return appFoldersContainer.createFolder("Unknown Vendors");
}

/**
 * Sends the file to the Gemini API and returns the parsed JSON data.
 */
function extractDataWithGemini(file, mimeType) {
  if (!GEMINI_API_KEY) {
    throw new Error("Missing GEMINI_API_KEY script property. Please open Project Settings (Gear Icon) and add your key under 'Script Properties' using name: GEMINI_API_KEY");
  }
  const blob = file.getBlob();
  const base64Data = Utilities.base64Encode(blob.getBytes());
  
  // Using the stable Gemini 3.1 Flash-Lite model
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${GEMINI_API_KEY}`;
  
  const prompt = "Extract details from this invoice, payment receipt, or work statement. Be precise. Find the single grand total value (at the bottom of the invoice/receipt) and place it in totalCost. If the document has an 'ALLOTMENT SPLITS' table on the first page, extract each split in detail into the splits array, mapping its amount, costCategory ('material' or 'labor'), lotNumber, tradeCategory, tradePhase, and description. Format dates as YYYY-MM-DD. ONLY extract a check number if the payment document is a physical check or explicitly lists a check payment. Do NOT extract order IDs, transaction reference numbers, or receipt barcodes as check numbers.";
  
  const payload = {
    contents: [{
      parts: [
        {
          inlineData: {
            mimeType: mimeType,
            data: base64Data
          }
        },
        {
          text: prompt
        }
      ]
    }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          taskDescription: { type: "STRING", description: "Short description of the specific work done or materials purchased" },
          contractorVendor: { type: "STRING", description: "Name of the contractor, subcontractor, or vendor" },
          totalCost: { type: "NUMBER", description: "The single grand total amount billed/paid at the bottom of the invoice (number only)" },
          costCategory: { type: "STRING", enum: ["material", "labor"], description: "Classify the entire invoice as either 'material' (physical goods/supplies) or 'labor' (work/services/installation)" },
          paymentDate: { type: "STRING", description: "Date of invoice/payment/receipt in YYYY-MM-DD" },
          checkNumber: { type: "STRING", description: "Only the check number if payment was made via check. Otherwise null." },
          splits: {
            type: "ARRAY",
            description: "List of split cost allotments if present in the ALLOTMENT SPLITS table on the first page",
            items: {
              type: "OBJECT",
              properties: {
                lotNumber: { type: "STRING", description: "Lot address or lot label for this split row" },
                costCategory: { type: "STRING", enum: ["material", "labor"] },
                tradeCategory: { type: "STRING", description: "Subcontractor Category key name" },
                tradePhase: { type: "STRING", description: "Project Phase Block name" },
                description: { type: "STRING", description: "Split item description details" },
                amount: { type: "NUMBER", description: "Split cost amount" }
              },
              required: ["amount", "costCategory", "lotNumber", "tradeCategory", "tradePhase"]
            }
          }
        },
        required: ["taskDescription", "contractorVendor", "totalCost", "costCategory"]
      }
    }
  };
  
  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  
  const response = UrlFetchApp.fetch(url, options);
  const responseCode = response.getResponseCode();
  const responseText = response.getContentText();
  
  if (responseCode !== 200) {
    throw new Error(`Gemini API Error (Status ${responseCode}): ${responseText}`);
  }
  
  const jsonResponse = JSON.parse(responseText);
  
  try {
    const jsonText = jsonResponse.candidates[0].content.parts[0].text;
    return JSON.parse(jsonText);
  } catch (e) {
    throw new Error("Could not parse JSON response from Gemini API.");
  }
}

// ==========================================
// NEW WEBHOOK & FILE-ARRIVAL TRIGGER LOGIC
// ==========================================

function doGet(e) {
  if (!isAuthorizedRequest(e)) {
    return ContentService.createTextOutput("Unauthorized");
  }
  
  let action = e && e.parameter ? e.parameter.action : null;
  let mainFolderId = e && e.parameter ? e.parameter.folderId : null;
  
  if (action === "sync") {
    parseNewInvoices(mainFolderId);
    return ContentService.createTextOutput("Sync Completed");
  }
  
  return ContentService.createTextOutput("Invoice Sync Service is Active.");
}

/**
 * Endpoint for Google Drive folder change webhook notification POST requests.
 */
function doPost(e) {
  console.log("doPost triggered.");
  if (!isAuthorizedRequest(e)) {
    return ContentService.createTextOutput("Unauthorized");
  }
  
  let action = null;
  let mainFolderId = null;
  let postData = null;

  if (e && e.postData && e.postData.contents) {
    try {
      postData = JSON.parse(e.postData.contents);
      if (postData && postData.action) action = postData.action;
    } catch (_) {}
  }

  if (e && e.parameter) {
    if (!action) action = e.parameter.action;
    mainFolderId = e.parameter.folderId;
  }
  
  if (action === "read_document_text") {
    try {
      const fileId = (postData && postData.fileId) || (e && e.parameter && e.parameter.fileId);
      if (!fileId) {
        return ContentService.createTextOutput(JSON.stringify({ success: false, error: "fileId required" }))
          .setMimeType(ContentService.MimeType.JSON);
      }
      const file = DriveApp.getFileById(fileId);
      const mimeType = file.getMimeType();
      let text = "";
      
      if (mimeType === MimeType.GOOGLE_DOCS || mimeType === "application/vnd.google-apps.document") {
        const doc = DocumentApp.openById(fileId);
        text = doc.getBody().getText();
      } else {
        text = file.getBlob().getDataAsString();
      }
      
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        text: text,
        fileName: file.getName(),
        modifiedTime: file.getLastUpdated().toISOString(),
        mimeType: mimeType
      })).setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        error: err && err.message ? err.message : String(err)
      })).setMimeType(ContentService.MimeType.JSON);
    }
  }

  if (action === "write_document_text") {
    try {
      const fileId = (postData && postData.fileId) || (e && e.parameter && e.parameter.fileId);
      const content = (postData && postData.content !== undefined) ? postData.content : "";
      if (!fileId) {
        return ContentService.createTextOutput(JSON.stringify({ success: false, error: "fileId required" }))
          .setMimeType(ContentService.MimeType.JSON);
      }
      const file = DriveApp.getFileById(fileId);
      const mimeType = file.getMimeType();
      
      if (mimeType === MimeType.GOOGLE_DOCS || mimeType === "application/vnd.google-apps.document") {
        const doc = DocumentApp.openById(fileId);
        doc.getBody().setText(content);
        doc.saveAndClose();
      } else {
        file.setContent(content);
      }
      
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        updatedTime: file.getLastUpdated().toISOString()
      })).setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        error: err && err.message ? err.message : String(err)
      })).setMimeType(ContentService.MimeType.JSON);
    }
  }

  if (action === "sync") {
    parseNewInvoices(mainFolderId);
    return ContentService.createTextOutput("Sync Completed");
  } else if (action === "renew") {
    registerFolderWatch();
    return ContentService.createTextOutput("Folder watch renewed");
  } else {
    // Normal drive notification (something changed in the folder)
    parseNewInvoices(mainFolderId);
    return ContentService.createTextOutput("OK");
  }
}

/**
 * Status and administration dashboard endpoint.
 */
function doGet(e) {
  if (!isAuthorizedRequest(e)) {
    return HtmlService.createHtmlOutput("Unauthorized");
  }
  let statusMessage = "";
  let statusClass = "status-tag";
  const action = e && e.parameter ? e.parameter.action : null;
  const mainFolderId = e && e.parameter ? e.parameter.folderId : null;
  const serviceUrl = ScriptApp.getService().getUrl();
  if (action === "sync") {
    try {
      parseNewInvoices(mainFolderId);
      statusMessage = "Sync completed. Check the spreadsheet for new rows.";
    } catch (err) {
      console.error(err);
      statusClass = "status-tag error";
      statusMessage = `Sync failed: ${err && err.message ? err.message : err}`;
    }
  } else if (action === "renew") {
    try {
      registerFolderWatch();
      statusMessage = "Folder watch channel renewed.";
    } catch (err) {
      console.error(err);
      statusClass = "status-tag error";
      statusMessage = `Renew failed: ${err && err.message ? err.message : err}`;
    }
  }
  return HtmlService.createHtmlOutput(`
    <html>
      <head>
        <title>Adepec Invoice Webhook Dashboard</title>
        <style>
          body { 
            font-family: 'Helvetica Neue', Arial, sans-serif; 
            background-color: #0a0a0a; 
            color: #fafafa; 
            padding: 40px; 
            text-align: center; 
          }
          .card { 
            background: #121212; 
            border: 1px solid #2a2a2a; 
            border-radius: 12px; 
            padding: 35px; 
            max-width: 500px; 
            margin: 0 auto; 
            box-shadow: 0 10px 25px rgba(0,0,0,0.5); 
          }
          h1 { 
            color: #C5A059; 
            font-size: 24px; 
            margin-top: 0;
            margin-bottom: 12px; 
            font-weight: 700; 
            letter-spacing: 0.05em;
          }
          p { 
            color: #999; 
            font-size: 14px; 
            line-height: 1.6; 
            margin-bottom: 25px; 
          }
          .btn { 
            display: block; 
            width: 100%;
            background-color: #C5A059; 
            color: #0a0a0a; 
            padding: 12px; 
            border-radius: 8px; 
            font-weight: 600; 
            font-size: 14px;
            text-decoration: none; 
            border: none; 
            cursor: pointer; 
            transition: all 0.2s ease; 
            box-sizing: border-box;
          }
          .btn:hover { 
            background-color: #B28741; 
            transform: translateY(-1px); 
          }
          .status-tag {
            display: inline-block; 
            background: rgba(16, 185, 129, 0.15); 
            color: #10b981; 
            padding: 4px 10px; 
            border-radius: 4px; 
            font-size: 12px; 
            font-weight: bold; 
            margin-bottom: 15px; 
            border: 1px solid rgba(16, 185, 129, 0.3);
          }
          .status-tag.error {
            background: rgba(239, 68, 68, 0.15);
            color: #f87171;
            border-color: rgba(239, 68, 68, 0.35);
          }
          .subtext {
            display: block;
            margin-top: 15px;
            font-size: 11px;
            color: #555;
          }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="status-tag">ACTIVE & LISTENING</div>
          <h1>Adepec Invoice Processor</h1>
          <p>Google Drive Folder Webhook is listening to uploads folder <strong>${INVOICE_FOLDER_ID}</strong>.</p>
          ${statusMessage ? `<div class="${statusClass}">${statusMessage}</div>` : ""}
          ${action ? `<span class="subtext">Last action: ${action} at ${new Date().toLocaleString()}</span>` : ""}
          
          <form action="${serviceUrl}" method="get" target="_top" style="margin-bottom: 12px;">
            <input type="hidden" name="secret" value="${WEBHOOK_SECRET}" />
            <input type="hidden" name="action" value="sync" />
            <button type="submit" class="btn">Force Run Sync Now</button>
          </form>
          
          <form action="${serviceUrl}" method="get" target="_top">
            <input type="hidden" name="secret" value="${WEBHOOK_SECRET}" />
            <input type="hidden" name="action" value="renew" />
            <button type="submit" class="btn" style="background-color: #2a2a2a; color: #fff; border: 1px solid #3a3a3a;">Renew Folder Watch Channel</button>
          </form>
          
          <span class="subtext">Daily cron auto-renewal runs at 1:00 AM</span>
        </div>
      </body>
    </html>
  `);
}

/**
 * Registers a webhook watch channel on the target Google Drive folder.
 */
function registerFolderWatch() {
  const token = ScriptApp.getOAuthToken();
  const url = `https://www.googleapis.com/drive/v3/files/${INVOICE_FOLDER_ID}/watch`;
  
  const webAppUrl = getServiceUrlWithSecret();
  if (!webAppUrl || webAppUrl === "") {
    console.log("Error: Web App is not deployed. Please deploy the script as a Web App first.");
    return;
  }
  
  // Create a unique channel ID to avoid collisions
  const channelId = "adepec_watch_channel_" + Math.floor(Math.random() * 1000000);
  
  const payload = {
    id: channelId,
    type: "web_hook",
    address: webAppUrl,
    expiration: Date.now() + (6 * 24 * 60 * 60 * 1000) // 6 days from now
  };
  
  const options = {
    method: "post",
    contentType: "application/json",
    headers: {
      Authorization: `Bearer ${token}`
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  
  const response = UrlFetchApp.fetch(url, options);
  console.log("Register Watch Response: " + response.getContentText());
}

/**
 * Configures the daily cron trigger to automatically renew the folder watch.
 */
function setupDailyTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  for (let i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === "registerFolderWatch") {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  
  ScriptApp.newTrigger("registerFolderWatch")
    .timeBased()
    .everyDays(1)
    .atHour(1)
    .create();
  
  console.log("Daily trigger for watch renewal configured.");
}

/**
 * One-time setup utility to register the watch and create the daily renewal trigger.
 */
function initializeSystem() {
  registerFolderWatch();
  setupDailyTrigger();
  console.log("System initialization completed successfully.");
}
