import { mkdirSync, writeFileSync } from 'node:fs';
import { jsPDF } from 'jspdf';

const outputDir = 'output/pdf';
const pdfPath = `${outputDir}/mock-scan-receipt-26-routing-items.pdf`;
const csvPath = `${outputDir}/mock-scan-receipt-26-routing-items.csv`;

const vendor = 'ADEPEC Pro Supply - Routing Test Receipt';
const date = '2026-07-13';
const receiptNo = 'RT-102-ALL-26';
const lot = 'Lot 102';

const items = [
  ['Site_Prep_&_Structure', 'Foundation & Flatwork', 'Concrete form stakes and layout string', 11.01],
  ['Site_Prep_&_Structure', 'Roofing', 'Roofing nails and underlayment patch', 12.02],
  ['Site_Prep_&_Structure', 'Windows & Exterior Doors', 'Window flashing tape and exterior door shims', 13.03],
  ['Framing_&_Lumber', 'Framing Lumber & Truss', 'Deck screws, lumber connector, truss hanger', 14.04],
  ['Mechanicals_&_Utilities', 'Plumbing Rough-In', 'PVC elbow rough-in shower drain fittings', 15.05],
  ['Mechanicals_&_Utilities', 'Electrical & Lighting', '2-gang wire box and Decora light switch', 16.06],
  ['Mechanicals_&_Utilities', 'HVAC / AC Systems', 'HVAC register boot and flex duct strap', 17.07],
  ['Mechanicals_&_Utilities', 'Insulation & Alarms', 'Alarm wire clips and insulation baffles', 18.08],
  ['Interior_Finishes', 'Drywall & Sheetrock', 'Sheetrock screws, drywall tape, joint compound', 19.09],
  ['Interior_Finishes', 'Cabinets & Trim Carpentry', 'Cabinet hinge, closet rod bracket, trim fasteners', 20.10],
  ['Interior_Finishes', 'Quartz & Countertops', 'Quartz countertop silicone and shims', 21.11],
  ['Interior_Finishes', 'Glass Work', 'Shower glass setting blocks and clear sealant', 22.12],
  ['Paint_Tile', 'Tile & Flooring', 'Tile spacers, grout float, flooring transition strip', 23.13],
  ['Paint_Tile', 'Paint & Finishes', 'Paint roller cover, primer tray, caulk', 24.14],
  ['House_Exterior_&_Yard', 'Stucco & Masonry', 'Stucco mesh and masonry screws', 25.15],
  ['House_Exterior_&_Yard', 'Garage Doors', 'Garage door track bolts and roller bracket', 26.16],
  ['House_Exterior_&_Yard', 'Driveway & Sidewalks', 'Sidewalk expansion joint and driveway form pins', 27.17],
  ['House_Exterior_&_Yard', 'Cantera Stone Detail', 'Cantera stone setting wedges and anchors', 28.18],
  ['House_Exterior_&_Yard', 'Fencing & Gates', 'Fence post caps, gate hinge screws, latch hardware', 29.19],
  ['House_Exterior_&_Yard', 'Landscaping & Irrigation', 'Irrigation coupler, drip fittings, landscape stakes', 30.20],
  ['Project_Overhead_&_Bills', 'Monthly Utility Bills', 'Temporary utility meter payment test charge', 31.21],
  ['Project_Overhead_&_Bills', 'Dumpsters & Cleaning', 'Dumpster liner, trash bags, cleanup broom', 32.22],
  ['Project_Overhead_&_Bills', 'Extra Costs & Misc', 'Miscellaneous project test supplies', 33.23],
  ['Paperwork_&_Permits', 'Paperwork & Permits', 'Permit copy fee and paperwork admin envelope', 34.24],
  ['Interior_Hardware', 'Plumbing Hardware Fixtures', 'Faucet supply line and plumbing fixture screws', 35.25],
  ['Interior_Hardware', 'Electrical Hardware Fixtures', 'Light fixture mounting plate and wire nuts', 36.26],
];

function money(value) {
  return `$${value.toFixed(2)}`;
}

function drawText(pdf, text, x, y, options = {}) {
  pdf.setFont('courier', options.bold ? 'bold' : 'normal');
  pdf.setFontSize(options.size || 9);
  pdf.text(text, x, y, options.align ? { align: options.align } : undefined);
}

mkdirSync(outputDir, { recursive: true });

const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
const total = items.reduce((sum, item) => sum + item[3], 0);
const tax = 0;
const grandTotal = total + tax;

pdf.setFillColor('#ffffff');
pdf.rect(0, 0, 216, 279, 'F');
pdf.setDrawColor('#111111');
pdf.setLineWidth(0.3);
pdf.rect(18, 10, 180, 258);

drawText(pdf, 'ADEPEC PRO SUPPLY', 108, 20, { bold: true, size: 16, align: 'center' });
drawText(pdf, 'ROUTING TEST RECEIPT - 26 LINE ITEMS', 108, 27, { bold: true, size: 10, align: 'center' });
drawText(pdf, '123 Builder Way  |  Test City, TX', 108, 33, { size: 8, align: 'center' });
drawText(pdf, `Receipt: ${receiptNo}`, 24, 44, { size: 8 });
drawText(pdf, `Date: ${date}`, 124, 44, { size: 8 });
drawText(pdf, `Project / Lot: ${lot}`, 24, 50, { size: 8 });
drawText(pdf, 'Cashier: ROUTING TEST', 124, 50, { size: 8 });

pdf.line(24, 57, 192, 57);
drawText(pdf, 'QTY  ITEM DESCRIPTION', 24, 63, { bold: true, size: 7.5 });
drawText(pdf, 'AMOUNT', 190, 63, { bold: true, size: 7.5, align: 'right' });
pdf.line(24, 66, 192, 66);

let y = 72;
items.forEach(([category, phase, description, amount], index) => {
  drawText(pdf, String(index + 1).padStart(2, '0'), 24, y, { size: 6.7 });
  drawText(pdf, description.toUpperCase().slice(0, 54), 36, y, { size: 6.7 });
  drawText(pdf, money(amount), 190, y, { size: 6.7, align: 'right' });
  drawText(pdf, `    ROUTE: ${category} / ${phase}`.slice(0, 84), 36, y + 3.8, { size: 5.7 });
  y += 7.6;
});

pdf.line(24, y + 1, 192, y + 1);
y += 8;
drawText(pdf, 'SUBTOTAL', 140, y, { bold: true, size: 8 });
drawText(pdf, money(total), 190, y, { bold: true, size: 8, align: 'right' });
y += 6;
drawText(pdf, 'TAX', 140, y, { size: 8 });
drawText(pdf, money(tax), 190, y, { size: 8, align: 'right' });
y += 6;
drawText(pdf, 'TOTAL', 140, y, { bold: true, size: 10 });
drawText(pdf, money(grandTotal), 190, y, { bold: true, size: 10, align: 'right' });

y += 14;
drawText(pdf, 'TEST INSTRUCTIONS:', 24, y, { bold: true, size: 7.5 });
y += 5;
drawText(pdf, '1. Scan/upload this receipt in the app to create a staged invoice.', 24, y, { size: 6.7 });
y += 4;
drawText(pdf, '2. Open Edit, enable split, and use line items or Load Routing Test.', 24, y, { size: 6.7 });
y += 4;
drawText(pdf, '3. Save and sync. Expect one uploaded split PDF per route.', 24, y, { size: 6.7 });

writeFileSync(pdfPath, Buffer.from(pdf.output('arraybuffer')));

const csvLines = ['line,tradeCategory,tradePhase,description,amount'];
items.forEach(([category, phase, description, amount], index) => {
  csvLines.push(`${index + 1},${category},"${phase}","${description.replace(/"/g, '""')}",${amount.toFixed(2)}`);
});
writeFileSync(csvPath, `${csvLines.join('\n')}\n`);

console.log(pdfPath);
console.log(csvPath);
