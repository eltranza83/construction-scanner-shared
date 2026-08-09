/**
 * Service to audit Google Spreadsheet structural integrity and column header health.
 */

export function auditSpreadsheetHealth(parsedData) {
  const warnings = [];

  if (!parsedData) {
    return { isHealthy: true, warnings: [] };
  }

  const { projectInfo, categories, subcontractors } = parsedData;

  // Check 1: Verify categories were parsed
  if (!categories || !Array.isArray(categories) || categories.length === 0) {
    warnings.push("No trade categories found in your Google Sheet (expected section headers like 'FOUNDATION', 'FRAMING', etc.).");
  }

  // Check 2: Verify subcontractors / phases were parsed
  if (!subcontractors || !Array.isArray(subcontractors) || subcontractors.length === 0) {
    warnings.push("No trade phase rows found under your category sections in the Google Sheet.");
  } else {
    // Check if any subcontractors are missing key fields
    const missingPhaseCount = subcontractors.filter(s => !s.phase || String(s.phase).trim() === '').length;
    if (missingPhaseCount > 0) {
      warnings.push(`${missingPhaseCount} phase row(s) in your Google Sheet have blank or missing Phase descriptions.`);
    }
  }

  // Check 3: Verify gross budget / summary numbers
  if (projectInfo) {
    const grossBudget = parseFloat(String(projectInfo.budgetGross || 0).replace(/[^0-9.-]/g, '')) || 0;
    const totalSpent = parseFloat(String(projectInfo.totalSpent || 0).replace(/[^0-9.-]/g, '')) || 0;

    if (grossBudget === 0 && totalSpent === 0 && categories && categories.length > 0) {
      warnings.push("Gross Budget and Total Spent are both $0.00. Please check if top summary labels ('GROSS BUDGET', 'TOTAL SPENT') in your Google Sheet were edited or renamed.");
    }
  }

  return {
    isHealthy: warnings.length === 0,
    warnings
  };
}
