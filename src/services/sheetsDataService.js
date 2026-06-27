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
 * Analyzes all rows in a phase block to extract the contractor payee, quote, paid, balance, status, and payments.
 */
function finalizeBlock(block) {
  let payee = '';
  let originalQuote = '$0.00';
  let totalPaid = '$0.00';
  let remainingBalance = '$0.00';
  let status = 'Not Started';
  const payments = [];

  block.rows.forEach((row, idx) => {
    const colB = String(row[1] || '').trim(); // Vendor
    const colC = String(row[2] || '').trim(); // Material Cost
    const colD = String(row[3] || '').trim(); // Labor Cost
    const colE = String(row[4] || '').trim(); // Date
    const colF = String(row[5] || '').trim(); // Check/Trans
    const colG = String(row[6] || '').trim(); // Payee
    const colH = String(row[7] || '').trim(); // Total Paid
    const colI = String(row[8] || '').trim(); // Quote
    const colJ = String(row[9] || '').trim(); // Balance
    const colK = String(row[10] || '').trim(); // Status

    // 1. Payee: Prefer a name that is not a default placeholder (like ending with 'Payee')
    if (colG && colG !== '') {
      const isPlaceholder = colG.toLowerCase().endsWith('payee') || colG.toLowerCase().includes('placeholder');
      if (!payee || !isPlaceholder) {
        payee = colG;
      }
    }

    // 2. Quote: Extract the last non-empty, non-zero quote value
    if (colI && colI !== '' && colI !== '$0.00') {
      originalQuote = colI;
    } else if (colI && originalQuote === '$0.00') {
      originalQuote = colI;
    }

    // 3. Paid: Extract the last non-empty, non-zero paid value
    if (colH && colH !== '' && colH !== '$0.00') {
      totalPaid = colH;
    } else if (colH && totalPaid === '$0.00') {
      totalPaid = colH;
    }

    // 4. Balance: Extract the last non-empty, non-zero balance value
    if (colJ && colJ !== '' && colJ !== '$0.00') {
      remainingBalance = colJ;
    } else if (colJ && remainingBalance === '$0.00') {
      remainingBalance = colJ;
    }

    // 5. Status
    if (colK && colK !== '') {
      status = colK;
    }

    // 6. Payments: Rows below the header row containing transaction detail in Columns B-F
    const hasPaymentData = colB !== '' || colC !== '' || colD !== '' || colE !== '' || colF !== '';
    if (idx > 0 && hasPaymentData) {
      payments.push({
        vendor: colB || 'N/A',
        materialCost: colC || '$0.00',
        laborCost: colD || '$0.00',
        date: colE || 'N/A',
        checkNumber: colF || 'N/A'
      });
    }
  });

  // Fallback to placeholder payee if no custom payee is filled in
  if (!payee && block.rows.length > 0) {
    payee = String(block.rows[0][6] || '').trim();
  }

  if (!payee) {
    payee = `${block.phase} Contractor`;
  }

  return {
    id: `sub_${block.phase.replace(/[^a-z0-9]/gi, '_')}_${Date.now()}`,
    category: block.category,
    phase: block.phase,
    payee: payee,
    originalQuote: originalQuote,
    totalPaid: totalPaid,
    remainingBalance: remainingBalance,
    status: status,
    payments: payments
  };
}

/**
 * Parses a subcontractor category tab (e.g. Paint_Tile).
 */
function parseCategorySheet(sheetName, rows) {
  const contractors = [];
  if (!rows || rows.length <= 1) return contractors;

  const categoryName = sheetName.replace(/_/g, ' ').replace(/&/g, '&');

  let currentBlock = null;

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.length === 0) continue;

    const colA = String(row[0] || '').trim();

    // A new phase block starts when Column A begins with an arrow or bullet indicator
    const isPhaseHeader = colA.startsWith('→') || colA.startsWith('—') || colA.startsWith('-');

    if (isPhaseHeader) {
      if (currentBlock) {
        contractors.push(finalizeBlock(currentBlock));
      }

      const phaseName = colA.replace(/^[→\-—\s]+/, '').trim();
      currentBlock = {
        category: categoryName,
        phase: phaseName,
        rows: [row]
      };
    } else if (currentBlock) {
      // Append row to the active phase block
      currentBlock.rows.push(row);
    }
  }

  if (currentBlock) {
    contractors.push(finalizeBlock(currentBlock));
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
