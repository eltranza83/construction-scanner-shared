import { jsPDF } from 'jspdf';
import fs from 'fs';
import path from 'path';

const OUTPUT_DIR = 'C:\\Users\\Acepe\\Downloads';
const LOTS = [
  { lot: '3', base: 69900.00 },
  { lot: '37', base: 72900.00 },
  { lot: '55', base: 69900.00 },
  { lot: '59', base: 69900.00 }
];

const ADEPEC_GOLD = [197, 160, 89];
const ADEPEC_DARK = [10, 10, 10];
const ZINC_900 = [24, 24, 27];
const ZINC_600 = [82, 82, 91];
const ZINC_500 = [113, 113, 122];
const ZINC_200 = [228, 228, 231];
const ZINC_100 = [244, 244, 245];

function formatCurrency(val) {
  return '$' + Number(val).toFixed(2).replace(/\d(?=(\d{3})+\.)/g, '$&,');
}

async function createLotPDF(lotData) {
  const pdf = new jsPDF({
    orientation: 'p',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 15;
  const contentWidth = pageWidth - (margin * 2);

  // 1. Draw Title Header
  pdf.setFillColor(...ADEPEC_DARK);
  pdf.rect(0, 0, pageWidth, 40, 'F');

  // Gold accent bar
  pdf.setFillColor(...ADEPEC_GOLD);
  pdf.rect(margin, 12, 4, 16, 'F');

  pdf.setTextColor(255, 255, 255);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(20);
  pdf.text('ADEPEC', margin + 8, 20);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.setTextColor(...ADEPEC_GOLD);
  pdf.text('CONSTRUCTION RECORD & INDIVIDUAL LOT CLOSING ALLOCATION', margin + 8, 26);

  // Date of Report Creation
  pdf.setTextColor(161, 161, 170); // Zinc 400
  pdf.setFontSize(8);
  const now = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
  pdf.text(`Report Date: ${now}`, pageWidth - margin, 23, { align: 'right' });

  // 2. Metadata Box
  let currentY = 48;
  const boxHeight = 44;
  pdf.setFillColor(...ZINC_100);
  pdf.rect(margin, currentY, contentWidth, boxHeight, 'F');
  pdf.setDrawColor(...ZINC_200);
  pdf.setLineWidth(0.5);
  pdf.rect(margin, currentY, contentWidth, boxHeight, 'S');

  // Metadata Text
  pdf.setTextColor(...ZINC_600);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9);

  // Row 1
  pdf.text('LOT NUMBER:', margin + 6, currentY + 9);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(...ZINC_900);
  pdf.text(`LOT ${lotData.lot}`, margin + 55, currentY + 9);

  // Row 2
  pdf.setTextColor(...ZINC_600);
  pdf.setFont('helvetica', 'bold');
  pdf.text('SUBDIVISION / BLOCK:', margin + 6, currentY + 17);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(...ZINC_900);
  pdf.text('Northwood Trails Block II & III, Block 3', margin + 55, currentY + 17);

  // Row 3
  pdf.setTextColor(...ZINC_600);
  pdf.setFont('helvetica', 'bold');
  pdf.text('PROPERTY ADDRESS:', margin + 6, currentY + 25);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(...ZINC_900);
  pdf.text(`Lot ${lotData.lot}, Block 3, Hidalgo County, McAllen, TX`, margin + 55, currentY + 25);

  // Row 4
  pdf.setTextColor(...ZINC_600);
  pdf.setFont('helvetica', 'bold');
  pdf.text('SETTLEMENT DATE:', margin + 6, currentY + 33);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(...ZINC_900);
  pdf.text('August 3, 2026 (HUD-1 File ALF-NWT-III-3)', margin + 55, currentY + 33);

  // 3. Acquisition Cost Allocation Table
  currentY += boxHeight + 10;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10);
  pdf.setTextColor(...ADEPEC_GOLD);
  pdf.text('CAPITALIZED LOT ACQUISITION COST', margin, currentY);

  const tableStartY = currentY + 3;
  const tableHeight = 35;
  pdf.setFillColor(255, 255, 255);
  pdf.rect(margin, tableStartY, contentWidth, tableHeight, 'F');
  pdf.setDrawColor(...ZINC_200);
  pdf.rect(margin, tableStartY, contentWidth, tableHeight, 'S');

  // Inner lines
  pdf.line(margin, tableStartY + 8, margin + contentWidth, tableStartY + 8);
  pdf.line(margin, tableStartY + 25, margin + contentWidth, tableStartY + 25);

  // Table Headers
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  pdf.setTextColor(...ZINC_500);
  pdf.text('COST COMPONENT', margin + 5, tableStartY + 5);
  pdf.text('BASE ALLOCATION RULE', margin + 70, tableStartY + 5);
  pdf.text('AMOUNT', margin + contentWidth - 5, tableStartY + 5, { align: 'right' });

  // Rows
  pdf.setFontSize(9);
  pdf.setTextColor(...ZINC_900);
  
  // Row 1: Base Lot Cost
  pdf.setFont('helvetica', 'normal');
  pdf.text('Original Contract Lot Price', margin + 5, tableStartY + 14);
  pdf.text('As designated by purchase contract breakdown', margin + 70, tableStartY + 14);
  pdf.setFont('helvetica', 'bold');
  pdf.text(formatCurrency(lotData.base), margin + contentWidth - 5, tableStartY + 14, { align: 'right' });

  // Row 2: Closing Costs & Adjustments
  pdf.setFont('helvetica', 'normal');
  pdf.text('Allocated closing costs and prorations', margin + 5, tableStartY + 20);
  pdf.text('1/4 share of $2,236.88 buyer transaction total', margin + 70, tableStartY + 20);
  pdf.setFont('helvetica', 'bold');
  pdf.text(formatCurrency(559.22), margin + contentWidth - 5, tableStartY + 20, { align: 'right' });

  // Row 3: Final Lot Cost
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(...ZINC_900);
  pdf.text('Final Allocated Lot Cost', margin + 5, tableStartY + 31);
  pdf.text('Capitalized land acquisition cost (HUD-1)', margin + 70, tableStartY + 31);
  pdf.setFontSize(11);
  pdf.text(formatCurrency(lotData.base + 559.22), margin + contentWidth - 5, tableStartY + 31, { align: 'right' });

  // 4. Detailed Cost Allocation Table
  currentY = tableStartY + tableHeight + 10;
  pdf.setFontSize(10);
  pdf.setTextColor(...ADEPEC_GOLD);
  pdf.text('DETAILED ITEMIZATION OF CLOSING ALLOCATION (1/4 SHARE)', margin, currentY);

  const detailStartY = currentY + 3;
  const itemHeight = 6;
  const items = [
    { name: 'HOA Transfer Fee', desc: 'Transfer Fee to Northwood Trails HOA', fullVal: 400.00 },
    { name: 'Escrow Fee', desc: 'Title/Settlement Escrow to Alvarado Law Firm', fullVal: 212.50 },
    { name: 'Tax Service / HOA Info', desc: 'Certificate & search fees', fullVal: 150.00 },
    { name: 'Document Preparation', desc: 'Legal document prep fees', fullVal: 125.00 },
    { name: 'Recording Fees', desc: 'Recording deed with Hidalgo County', fullVal: 39.00 },
    { name: 'E-Filing Fee', desc: 'Electronic file processing fee', fullVal: 10.00 },
    { name: 'HOA Dues Proration', desc: 'Prorated HOA dues (08/04/26 - 12/31/26)', fullVal: 739.73 },
    { name: 'School Property Taxes', desc: 'Prorated school tax adjustment', fullVal: 232.21 },
    { name: 'County Property Taxes', desc: 'Prorated county tax adjustment', fullVal: 219.55 },
    { name: 'City Property Taxes', desc: 'Prorated city tax adjustment', fullVal: 108.89 }
  ];

  const detailHeight = 12 + (items.length * itemHeight);
  pdf.setFillColor(...ZINC_100);
  pdf.rect(margin, detailStartY, contentWidth, detailHeight, 'F');
  pdf.setDrawColor(...ZINC_200);
  pdf.rect(margin, detailStartY, contentWidth, detailHeight, 'S');

  // Detail table headers
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  pdf.setTextColor(...ZINC_500);
  pdf.text('FEE / ADJUSTMENT COMPONENT', margin + 5, detailStartY + 5);
  pdf.text('HUD-1 TOTAL', margin + 75, detailStartY + 5);
  pdf.text('ALLOCATED LOT SHARE (25%)', margin + contentWidth - 5, detailStartY + 5, { align: 'right' });

  pdf.line(margin + 5, detailStartY + 7, margin + contentWidth - 5, detailStartY + 7);

  // Table rows
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8.5);
  pdf.setTextColor(...ZINC_900);

  items.forEach((item, idx) => {
    const rowY = detailStartY + 12 + (idx * itemHeight);
    pdf.setFont('helvetica', 'bold');
    pdf.text(item.name, margin + 5, rowY);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(...ZINC_600);
    pdf.text(item.desc, margin + 37, rowY);
    pdf.text(formatCurrency(item.fullVal), margin + 75, rowY);
    pdf.setTextColor(...ZINC_900);
    pdf.setFont('helvetica', 'bold');
    pdf.text(formatCurrency(item.fullVal / 4), margin + contentWidth - 5, rowY, { align: 'right' });
    pdf.setFont('helvetica', 'normal');
  });

  // Footer bar
  pdf.setFillColor(...ADEPEC_DARK);
  pdf.rect(0, pageHeight - 12, pageWidth, 12, 'F');
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7.5);
  pdf.setTextColor(...ADEPEC_GOLD);
  pdf.text('ADEPEC HOMES', margin, pageHeight - 4.5);
  pdf.setTextColor(212, 212, 216);
  pdf.text(`HUD-1 Cost Allocation - LOT ${lotData.lot} closing record - Page 1 of 1`, pageWidth - margin, pageHeight - 4.5, { align: 'right' });

  // Save PDF
  const filename = `Lot_${lotData.lot}_Closing_Cost_Allocation.pdf`;
  const filepath = path.join(OUTPUT_DIR, filename);
  const pdfBytes = pdf.output('arraybuffer');
  fs.writeFileSync(filepath, Buffer.from(pdfBytes));
  console.log(`Successfully generated: ${filename}`);
}

async function run() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  for (const data of LOTS) {
    await createLotPDF(data);
  }
  console.log('All PDFs generated successfully.');
}

run().catch(console.error);
