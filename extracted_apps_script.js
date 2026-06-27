// --- CONFIGURATION ---
// Store your Gemini API Key in: File > Project Settings > Script Properties as GEMINI_API_KEY
const GEMINI_API_KEY = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
const INVOICE_FOLDER_ID = '16yDqZ5lhfoSCY-J8wRuZl0_9uM30wIHD'; // 'Invoice Uploads'
const ARCHIVE_FOLDER_ID = '1jdgw6v438N3RQksN_JpvhTwyJNwuSJhf'; // 'Processed Invoices'
const SPREADSHEET_ID = '1kaVNSq0hC4A97EtYNE_lapznWillaKigF_Nn9icSUYs'; // fallback spreadsheet ID
const MASTER_LOG_SHEET = 'New_Invoices';
// ---------------------

/**
 * Main function to check and process new files in the Invoice Uploads folder.
 */
function parseNewInvoices() {
  // Wait 4 seconds for Google Drive's search index to register the new file
  Utilities.sleep(4000);
  
  const folder = DriveApp.getFolderById(INVOICE_FOLDER_ID);
  const archiveFolder = DriveApp.getFolderById(ARCHIVE_FOLDER_ID);
  const files = folder.getFiles();
  
  // Use spreadsheet inside folder if present, fallback to container or ID
  let ss = null;
  const folderSpreadsheets = folder.getFilesByType('application/vnd.google-apps.spreadsheet');
  if (folderSpreadsheets.hasNext()) {
    const ssFile = folderSpreadsheets.next();
    console.log(`Detected project spreadsheet inside folder: ${ssFile.getName()} (${ssFile.getId()})`);
    ss = SpreadsheetApp.openById(ssFile.getId());
  } else {
    try {
      ss = SpreadsheetApp.getActiveSpreadsheet();
    } catch (e) {
      console.log("Not running in container. Falling back to spreadsheet ID.");
    }
    if (!ss) {
      ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    }
  }
  
  const masterLogSheet = ss.getSheetByName(MASTER_LOG_SHEET);
  let processedCount = 0;
  
  while (files.hasNext()) {
    const file = files.next();
    const mimeType = file.getMimeType();
    const fileName = file.getName();
    const fileUrl = file.getUrl();
    
    // Skip subfolders and Google Spreadsheets
    if (mimeType === MimeType.FOLDER || mimeType === 'application/vnd.google-apps.spreadsheet') {
      continue;
    }
    
    console.log(`Processing file: ${fileName} (${mimeType})...`);
    
    // 1. Check filename for classification hint ("material" or "labor")
    const dotIndex = fileName.lastIndexOf('.');
    const nameWithoutExt = (dotIndex !== -1 ? fileName.substring(0, dotIndex) : fileName).trim().toLowerCase();
    
    let forceMaterial = false;
    let forceLabor = false;
    
    if (nameWithoutExt.includes('material')) {
      forceMaterial = true;
      console.log(`Filename hint detected: Classifying as Material Cost.`);
    } else if (nameWithoutExt.includes('labor')) {
      forceLabor = true;
      console.log(`Filename hint detected: Classifying as Labor Cost.`);
    }
    
    try {
      // 2. Extract data using Gemini API
      const parsedData = extractDataWithGemini(file, mimeType);
      
      if (parsedData) {
        console.log(`Successfully parsed: ${JSON.stringify(parsedData)}`);
        
        let finalMaterialCost = '';
        let finalLaborCost = '';
        
        // 3. Determine category: filename hint takes priority, otherwise use Gemini's classification
        let categoryType = 'material'; // default fallback
        if (forceMaterial) {
          categoryType = 'material';
        } else if (forceLabor) {
          categoryType = 'labor';
        } else if (parsedData.costCategory) {
          categoryType = parsedData.costCategory.toLowerCase();
        }
        
        // Write the complete grand total into the single appropriate category column
        if (categoryType === 'material') {
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
        
        // 4. Create Hyperlink formulas for the cost columns
        const materialValue = (typeof finalMaterialCost === 'number' && finalMaterialCost !== 0) 
            ? `=HYPERLINK("${fileUrl}", ${finalMaterialCost})` 
            : '';
        const laborValue = (typeof finalLaborCost === 'number' && finalLaborCost !== 0) 
            ? `=HYPERLINK("${fileUrl}", ${finalLaborCost})` 
            : '';
        
        // Formulate row data
        // Columns: ['Task Description', 'Contractor / Vendor', 'Material Cost', 'Labor Cost', 'Payment Date', 'Check or Trans #']
        const rowData = [
          parsedData.taskDescription,
          parsedData.contractorVendor,
          materialValue,
          laborValue,
          paymentDate,
          finalCheckNumber
        ];
        
        // A. Append row to Master chronological log tab
        if (masterLogSheet) {
          masterLogSheet.appendRow(rowData);
          const lastRow = masterLogSheet.getLastRow();
          const mCell = masterLogSheet.getRange(lastRow, 3);
          const lCell = masterLogSheet.getRange(lastRow, 4);
          
          if (typeof finalMaterialCost === 'number' && finalMaterialCost !== 0) {
            mCell.setNumberFormat("$#,##0.00");
            mCell.setFontColor("#1155cc");
            mCell.setFontLine("underline");
          }
          if (typeof finalLaborCost === 'number' && finalLaborCost !== 0) {
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
            categoryType
          );
        } else {
          console.log("No subcontractor classification found. Skipping direct block append.");
        }
        
        // 5. Move the file to the archive folder
        file.moveTo(archiveFolder);
        console.log(`Archived ${fileName} to Processed Invoices.`);
        processedCount++;
      } else {
        console.log(`Failed to parse data for ${fileName}`);
      }
      
    } catch (e) {
      console.log(`Error processing ${fileName}: ${e.message}`);
    }
  }
  
  console.log(`Finished checking folder. Processed ${processedCount} new files.`);
}

/**
 * Appends the transaction row directly into the correct subcontractor sheet and block.
 */
function logTransactionToCategorySheet(ss, category, phase, rowData, categoryType) {
  const sheet = ss.getSheetByName(category);
  if (!sheet) {
    console.log(`Subcontractor sheet tab '${category}' not found. Direct log skipped.`);
    return;
  }

  const values = sheet.getDataRange().getValues();
  let blockHeaderRowIdx = -1;
  
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
    console.log(`Phase block '${phase}' not found inside '${category}' sheet. Direct log skipped.`);
    return;
  }

  // Find where the next phase block starts
  let nextBlockHeaderRowIdx = values.length;
  for (let r = blockHeaderRowIdx + 1; r < values.length; r++) {
    const colA = String(values[r][0] || '').trim();
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
    console.log(`No empty slot. Inserting new row at index ${targetRowIdx + 1} inside block.`);
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

  console.log(`Successfully logged transaction directly to sheet '${category}' row ${rowNumber}.`);
}

/**
 * Sends the file to the Gemini API and returns the parsed JSON data.
 */
function extractDataWithGemini(file, mimeType) {
  const blob = file.getBlob();
  const base64Data = Utilities.base64Encode(blob.getBytes());
  
  if (!GEMINI_API_KEY) {
    throw new Error("Gemini API key is not configured. Please add GEMINI_API_KEY under Script Properties.");
  }
  
  // Using the stable Gemini 3.1 Flash-Lite model
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${GEMINI_API_KEY}`;
  
  const prompt = `
    Extract details from this invoice, payment receipt, or work statement. Be precise. 
    Find the single grand total value (at the bottom of the invoice/receipt) and place it in totalCost. Do not split it. 
    Classify the entire document as either 'material' (if physical goods/supplies) or 'labor' (if work/services/installation). 
    Format dates as YYYY-MM-DD. 
    ONLY extract a check number if the payment document is a physical check or explicitly lists a check payment.
    
    Choose the most appropriate subcontractor tradeCategory (sheet tab name) and tradePhase (block name) from this exact list:
    
    1. Category: Site_Prep_&_Structure
       Phases: Foundation & Flatwork, Roofing, Windows & Exterior Doors
       
    2. Category: Framing_&_Lumber
       Phases: Framing & Lumber
       
    3. Category: Mechanicals_&_Utilities
       Phases: Plumbing Rough-In, Electrical & Lighting, HVAC / AC Systems, Insulation & Alarms
       
    4. Category: Interior_Finishes
       Phases: Drywall & Sheetrock, Cabinets & Trim Carpentry, Quartz & Countertops, Glass Work
       
    5. Category: Paint_Tile
       Phases: Tile & Flooring, Paint & Finishes
       
    6. Category: House_Exterior_&_Yard
       Phases: Stucco & Masonry, Garage Doors, Driveway & Sidewalks, Cantera Stone Detail, Fencing & Gates, Landscaping & Irrigation
       
    7. Category: Project_Overhead_&_Bills
       Phases: Monthly Utility Bills, Dumpsters & Cleaning, Extra Costs & Misc
  `;
  
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
          tradeCategory: { 
            type: "STRING", 
            enum: [
              "Site_Prep_&_Structure",
              "Framing_&_Lumber",
              "Mechanicals_&_Utilities",
              "Interior_Finishes",
              "Paint_Tile",
              "House_Exterior_&_Yard",
              "Project_Overhead_&_Bills"
            ],
            description: "Select the most appropriate subcontractor category sheet name based on the invoice details." 
          },
          tradePhase: {
            type: "STRING",
            description: "Select the exact matching phase block name (e.g. 'Plumbing Rough-In', 'Roofing', 'Tile & Flooring', 'Paint & Finishes', etc.)."
          }
        },
        required: ["taskDescription", "contractorVendor", "totalCost", "costCategory", "tradeCategory", "tradePhase"]
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

/**
 * Endpoint for Google Drive folder change webhook notification POST requests.
 */
function doPost(e) {
  console.log("doPost triggered.");
  
  let action = null;
  if (e && e.parameter && e.parameter.action) {
    action = e.parameter.action;
  }
  
  if (action === "sync") {
    parseNewInvoices();
    const serviceUrl = ScriptApp.getService().getUrl();
    return HtmlService.createHtmlOutput(`
      <script>
        alert("Sync processed!");
        window.location.href = "${serviceUrl}";
      </script>
    `);
  } else if (action === "renew") {
    registerFolderWatch();
    const serviceUrl = ScriptApp.getService().getUrl();
    return HtmlService.createHtmlOutput(`
      <script>
        alert("Folder watch channel renewed!");
        window.location.href = "${serviceUrl}";
      </script>
    `);
  } else {
    // Normal drive notification (something changed in the folder)
    parseNewInvoices();
    return ContentService.createTextOutput("OK");
  }
}

/**
 * Status and administration dashboard endpoint.
 */
function doGet(e) {
  const serviceUrl = ScriptApp.getService().getUrl();
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
          
          <form action="${serviceUrl}" method="post" style="margin-bottom: 12px;">
            <input type="hidden" name="action" value="sync" />
            <button type="submit" class="btn">Force Run Sync Now</button>
          </form>
          
          <form action="${serviceUrl}" method="post">
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
  
  const webAppUrl = ScriptApp.getService().getUrl();
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
