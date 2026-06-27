/**
 * Service to fetch and parse Google Sheets data for project dashboards and contractor summaries.
 */

const GOOGLE_SHEETS_API_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

/**
 * Searches the rows for a text label and returns the cell offset value.
 * Useful for handling spreadsheet structures where row indexes might shift slightly.
 */
function getValByLabel(rows, labelText, offsetCol = 1) {
  if (!rows || rows.length === 0) return '';
  const cleanLabel = labelText.toLowerCase().replace(/[^a-z0-9]/g, '');
  
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    if (!row) continue;
    for (let c = 0; c < row.length; c++) {
      const cellVal = String(row[c] || '').trim();
      const cleanCellVal = cellVal.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (cleanCellVal === cleanLabel) {
        return String(row[c + offsetCol] || '').trim();
      }
    }
  }
  return '';
}

/**
 * Parses the raw Summary_Dashboard tab rows.
 */
function parseSummaryDashboard(rows) {
  if (!rows || rows.length === 0) {
    return {
      name: 'N/A',
      scope: 'N/A',
      address: 'N/A',
      cityStateZip: 'N/A',
      budgetBuild: '$0.00',
      budgetLand: '$0.00',
      budgetGross: '$0.00',
      deposits: '$0.00',
      totalSpent: '$0.00',
      capitalBalance: '$0.00'
    };
  }

  return {
    name: getValByLabel(rows, 'Project Name:') || 'Unnamed Project',
    scope: getValByLabel(rows, 'Development Scope:') || 'N/A',
    address: getValByLabel(rows, 'Street Address:') || 'N/A',
    cityStateZip: getValByLabel(rows, 'City, State, Zip:') || 'N/A',
    
    budgetBuild: getValByLabel(rows, 'Budget for Build (Hard Costs)') || '$0.00',
    budgetLand: getValByLabel(rows, 'Acquisition Lot Cost (Land)') || '$0.00',
    budgetGross: getValByLabel(rows, 'Gross Projected Project Cost') || '$0.00',
    
    deposits: getValByLabel(rows, 'Real Budget Deposits (Capital)') || '$0.00',
    totalSpent: getValByLabel(rows, 'Total Spent to Date (Draws)') || '$0.00',
    capitalBalance: getValByLabel(rows, 'Net Working Capital Balance') || '$0.00'
  };
}

/**
 * Parses a subcontractor category tab (e.g. Paint_Tile).
 */
function parseCategorySheet(sheetName, rows) {
  const contractors = [];
  if (!rows || rows.length <= 1) return contractors;

  // Format sheetName for clean display
  const categoryName = sheetName.replace(/_/g, ' ').replace(/&/g, '&');

  let currentContractor = null;
  let currentPayments = [];

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.length === 0) continue;

    const colA = String(row[0] || '').trim();
    const colG = String(row[6] || '').trim();

    // Skip spreadsheet headers
    const isHeaderRow = colG.toLowerCase().includes('contractor payee') || 
                        colA.toLowerCase().includes('task description') || 
                        colA.toLowerCase().includes('taskdesc');
                        
    const isNewContractor = colG !== '' && !isHeaderRow;

    if (isNewContractor) {
      // If we finished a previous contractor, save it
      if (currentContractor) {
        currentContractor.payments = currentPayments;
        contractors.push(currentContractor);
      }

      // Start a new contractor block
      const phaseName = colA.replace(/^[→\-—\s]+/, '').trim(); // clean leading arrows/dashes
      
      // Look for totals, quotes, balances and status in this row and the next 2 rows
      let originalQuote = '$0.00';
      let totalPaid = '$0.00';
      let remainingBalance = '$0.00';
      let status = 'Not Started';

      for (let offset = 0; offset < 3; offset++) {
        const checkRowIdx = r + offset;
        if (checkRowIdx >= rows.length) break;
        const checkRow = rows[checkRowIdx];
        if (!checkRow) continue;
        
        const qVal = String(checkRow[8] || '').trim();
        const pVal = String(checkRow[7] || '').trim();
        const bVal = String(checkRow[9] || '').trim();
        const sVal = String(checkRow[10] || '').trim();

        if (qVal && qVal !== '' && qVal !== '$0.00' && originalQuote === '$0.00') {
          originalQuote = qVal;
        } else if (qVal && originalQuote === '$0.00') {
          originalQuote = qVal;
        }

        if (pVal && pVal !== '' && pVal !== '$0.00' && totalPaid === '$0.00') {
          totalPaid = pVal;
        } else if (pVal && totalPaid === '$0.00') {
          totalPaid = pVal;
        }

        if (bVal && bVal !== '' && bVal !== '$0.00' && remainingBalance === '$0.00') {
          remainingBalance = bVal;
        } else if (bVal && remainingBalance === '$0.00') {
          remainingBalance = bVal;
        }

        if (sVal && sVal !== '' && status === 'Not Started') {
          status = sVal;
        }
      }

      currentContractor = {
        id: `sub_${sheetName}_${r}_${Date.now()}`,
        category: categoryName,
        phase: phaseName,
        payee: colG,
        originalQuote: originalQuote,
        totalPaid: totalPaid,
        remainingBalance: remainingBalance,
        status: status,
        payments: []
      };
      currentPayments = [];
    } else {
      // Parse payment rows on the left side of the active block
      const vendor = String(row[1] || '').trim();
      const matCost = String(row[2] || '').trim();
      const labCost = String(row[3] || '').trim();
      const date = String(row[4] || '').trim();
      const checkNum = String(row[5] || '').trim();

      const hasPaymentData = vendor !== '' || matCost !== '' || labCost !== '' || date !== '' || checkNum !== '';
      const isNewHeader = colA.startsWith('→') || colA.startsWith('—') || colA.startsWith('-');
      
      if (currentContractor && hasPaymentData && !isNewHeader) {
        currentPayments.push({
          vendor: vendor || 'N/A',
          materialCost: matCost || '$0.00',
          laborCost: labCost || '$0.00',
          date: date || 'N/A',
          checkNumber: checkNum || 'N/A'
        });
      }
    }
  }

  // Push the final contractor in the sheet
  if (currentContractor) {
    currentContractor.payments = currentPayments;
    contractors.push(currentContractor);
  }

  return contractors;
}

/**
 * Main entry point to batch-fetch and parse all subcontractor and summary sheets.
 */
export async function fetchProjectDashboardData(accessToken, spreadsheetId) {
  const ranges = [
    'Summary_Dashboard!A1:E60',
    'Paperwork_&_Permits!A1:K80',
    'Site_Prep_&_Structure!A1:K80',
    'Framing_&_Lumber!A1:K80',
    'Mechanicals_&_Utilities!A1:K80',
    'Interior_Finishes!A1:K80',
    'Paint_Tile!A1:K80',
    'Interior_Hardware!A1:K80',
    'House_Exterior_&_Yard!A1:K80',
    'Project_Overhead_&_Bills!A1:K80'
  ];

  const queryParams = ranges.map(r => `ranges=${encodeURIComponent(r)}`).join('&');
  const url = `${GOOGLE_SHEETS_API_BASE}/${spreadsheetId}/values:batchGet?${queryParams}&valueRenderOption=FORMATTED_VALUE`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Failed to fetch spreadsheet dashboard data: ${errText}`);
  }

  const data = await response.json();
  const valueRanges = data.valueRanges || [];

  let projectInfo = {};
  let subcontractorsList = [];
  const categorySummaries = [];

  // Loop through valueRanges and parse them
  for (let i = 0; i < valueRanges.length; i++) {
    const vRange = valueRanges[i];
    const rangeName = vRange.range || '';
    const rows = vRange.values || [];

    if (rangeName.includes('Summary_Dashboard')) {
      projectInfo = parseSummaryDashboard(rows);
    } else {
      // Get the sheet name from the range string (e.g. "Paint_Tile!A1:K80" -> "Paint_Tile")
      const sheetName = rangeName.split('!')[0].replace(/'/g, '');
      const parsedSubs = parseCategorySheet(sheetName, rows);
      
      if (parsedSubs.length > 0) {
        subcontractorsList = [...subcontractorsList, ...parsedSubs];
        
        // Sum category totals for general accordion info
        let catQuote = 0;
        let catPaid = 0;
        let catOwed = 0;

        parsedSubs.forEach(s => {
          const quote = parseFloat(s.originalQuote.replace(/[^0-9.-]/g, '')) || 0;
          const paid = parseFloat(s.totalPaid.replace(/[^0-9.-]/g, '')) || 0;
          const owed = parseFloat(s.remainingBalance.replace(/[^0-9.-]/g, '')) || 0;
          catQuote += quote;
          catPaid += paid;
          catOwed += owed;
        });

        categorySummaries.push({
          name: sheetName.replace(/_/g, ' ').replace(/&/g, '&'),
          sheetName: sheetName,
          totalQuote: catQuote,
          totalPaid: catPaid,
          totalOwed: catOwed,
          phasesCount: parsedSubs.length
        });
      }
    }
  }

  return {
    projectInfo,
    subcontractors: subcontractorsList,
    categories: categorySummaries
  };
}
