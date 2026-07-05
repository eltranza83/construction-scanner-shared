import { jsPDF } from 'jspdf';


/**
 * Loads an image to get its width and height.
 */
function loadImageDimensions(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.width, height: img.height });
    };
    img.src = dataUrl;
  });
}

/**
 * Generates a PDF document with metadata on top and attached image(s) below.
 * @param {Object} metadata The verified scanner details
 * @param {string[]} imageUrls Array of image data URLs (first is main document, second is optional receipt)
 * @returns {Promise<Blob>} The generated PDF as a Blob
 */
export async function generateDocumentPDF(metadata, imageUrls) {
  const pdf = new jsPDF({
    orientation: 'p',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = 210; // A4 width
  const pageHeight = 297; // A4 height
  const margin = 15;
  const contentWidth = pageWidth - (margin * 2);

  // 1. Draw Title Header
  pdf.setFillColor(10, 10, 10); // Adepec Dark Background
  pdf.rect(0, 0, pageWidth, 40, 'F');

  // Adepec Gold Logo Accent
  pdf.setFillColor(197, 160, 89); // Adepec Gold
  pdf.rect(margin, 12, 4, 16, 'F');

  pdf.setTextColor(255, 255, 255);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(22);
  pdf.text('ADEPEC', margin + 8, 20);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  pdf.setTextColor(197, 160, 89); // Gold accent text
  pdf.text('CONSTRUCTION RECORD & EXPENSE REPORT', margin + 8, 26);

  // Date of Report Creation
  pdf.setTextColor(161, 161, 170); // Zinc 400
  pdf.setFontSize(9);
  const now = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
  pdf.text(`Created: ${now}`, pageWidth - margin - 50, 23, { align: 'right' });

  // 2. Draw Metadata Grid Block
  let currentY = 50;
  const hasCheck = !!metadata.checkNumber;
  const hasSplits = metadata.splits && metadata.splits.length > 0;
  
  // Calculate height needed for splits table
  const splitsHeight = hasSplits ? (15 + (metadata.splits.length * 6)) : 0;
  const boxHeight = (hasCheck ? 83 : 75) + splitsHeight;

  // Draw Box Container for Metadata
  pdf.setFillColor(244, 244, 245); // Zinc 100
  pdf.rect(margin, currentY, contentWidth, boxHeight, 'F');
  pdf.setDrawColor(228, 228, 231); // Zinc 200
  pdf.setLineWidth(0.5);
  pdf.rect(margin, currentY, contentWidth, boxHeight, 'S');

  // Text inside Grid
  pdf.setTextColor(82, 82, 91); // Zinc 600
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10);

  // Row 1
  pdf.text('LOT NUMBER / ADDRESS:', margin + 5, currentY + 10);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(24, 24, 27); // Zinc 900
  pdf.text(metadata.lotNumber || 'N/A', margin + 55, currentY + 10);

  // Row 2
  pdf.setTextColor(82, 82, 91);
  pdf.setFont('helvetica', 'bold');
  pdf.text('JOB / ITEM DESCRIPTION:', margin + 5, currentY + 18);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(24, 24, 27);
  pdf.text(metadata.description || 'N/A', margin + 55, currentY + 18);

  // Row 3
  pdf.setTextColor(82, 82, 91);
  pdf.setFont('helvetica', 'bold');
  pdf.text('CONTACT / VENDOR:', margin + 5, currentY + 26);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(24, 24, 27);
  pdf.text(metadata.vendor || 'N/A', margin + 55, currentY + 26);

  // Row 4
  pdf.setTextColor(82, 82, 91);
  pdf.setFont('helvetica', 'bold');
  pdf.text('DATE OF TRANSACTION:', margin + 5, currentY + 34);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(24, 24, 27);
  pdf.text(metadata.date || 'N/A', margin + 55, currentY + 34);

  // Row 5
  pdf.setTextColor(82, 82, 91);
  pdf.setFont('helvetica', 'bold');
  pdf.text('COST CLASSIFICATION:', margin + 5, currentY + 42);
  pdf.setFont('helvetica', 'bold');
  if (hasSplits) {
    pdf.setTextColor(147, 107, 40); // Adepec Dark Gold
    pdf.text('MULTIPLE (SPLIT)', margin + 55, currentY + 42);
  } else if (metadata.costCategory === 'labor') {
    pdf.setTextColor(30, 64, 175); // Royal Blue
    pdf.text('LABOR COST', margin + 55, currentY + 42);
  } else {
    pdf.setTextColor(147, 107, 40); // Adepec Dark Gold
    pdf.text('MATERIAL COST', margin + 55, currentY + 42);
  }

  // Row 6
  pdf.setTextColor(82, 82, 91);
  pdf.setFont('helvetica', 'bold');
  pdf.text(hasSplits ? 'TOTAL AMOUNT (SPLIT):' : 'TOTAL AMOUNT:', margin + 5, currentY + 50);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(24, 24, 27);
  pdf.setFontSize(11);
  pdf.text(`$${Number(metadata.amount || 0).toFixed(2)}`, margin + 55, currentY + 50);
  pdf.setFontSize(10); // reset

  // Row 7 (Subcontractor Category)
  pdf.setTextColor(82, 82, 91);
  pdf.setFont('helvetica', 'bold');
  pdf.text('SUBCONTRACTOR CATEGORY:', margin + 5, currentY + 58);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(24, 24, 27);
  pdf.text(metadata.tradeCategory || 'N/A', margin + 55, currentY + 58);

  // Row 8 (Project Phase)
  pdf.setTextColor(82, 82, 91);
  pdf.setFont('helvetica', 'bold');
  pdf.text('PROJECT PHASE BLOCK:', margin + 5, currentY + 66);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(24, 24, 27);
  pdf.text(metadata.tradePhase || 'N/A', margin + 55, currentY + 66);

  // Row 9 (Check Number if present)
  if (hasCheck) {
    pdf.setTextColor(82, 82, 91);
    pdf.setFont('helvetica', 'bold');
    pdf.text('CHECK NUMBER:', margin + 5, currentY + 74);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(24, 24, 27);
    pdf.text(metadata.checkNumber, margin + 55, currentY + 74);
  }

  // Draw Splits Table if present
  if (hasSplits) {
    const splitsStartY = currentY + (hasCheck ? 82 : 74);
    
    // Divider line
    pdf.setDrawColor(200, 200, 204);
    pdf.setLineWidth(0.3);
    pdf.line(margin + 5, splitsStartY - 4, margin + contentWidth - 5, splitsStartY - 4);

    // Section title
    pdf.setTextColor(197, 160, 89); // Adepec Gold
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    pdf.text('ALLOTMENT SPLITS', margin + 5, splitsStartY);

    // Table Headers
    pdf.setTextColor(113, 113, 122); // Zinc 500
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    
    // Column coordinates
    const colLotX = margin + 5;
    const colCatX = margin + 45;
    const colDescX = margin + 75;
    const colAmtX = margin + contentWidth - 5; // Align right

    pdf.text('LOT / ADDRESS', colLotX, splitsStartY + 5);
    pdf.text('CATEGORY', colCatX, splitsStartY + 5);
    pdf.text('DESCRIPTION', colDescX, splitsStartY + 5);
    pdf.text('AMOUNT', colAmtX, splitsStartY + 5, { align: 'right' });

    // Draw header bottom line
    pdf.line(margin + 5, splitsStartY + 7, margin + contentWidth - 5, splitsStartY + 7);

    // Table Rows
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(24, 24, 27); // Zinc 900
    
    metadata.splits.forEach((split, idx) => {
      const rowY = splitsStartY + 12 + (idx * 6);
      
      // Lot
      pdf.text(split.lotNumber || 'N/A', colLotX, rowY);
      
      // Category
      pdf.setFont('helvetica', 'bold');
      if (split.costCategory === 'labor') {
        pdf.setTextColor(30, 64, 175);
        pdf.text('LABOR', colCatX, rowY);
      } else {
        pdf.setTextColor(147, 107, 40);
        pdf.text('MATERIAL', colCatX, rowY);
      }
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(24, 24, 27);
      
      // Trade Phase + Description
      const phase = split.tradePhase || metadata.tradePhase || 'N/A';
      const desc = split.description || metadata.description || '';
      const displayText = desc ? `${phase} (${desc})` : phase;
      const truncatedText = displayText.length > 40 ? displayText.substring(0, 37) + '...' : displayText;
      pdf.text(truncatedText, colDescX, rowY);
      
      // Amount
      pdf.setFont('helvetica', 'bold');
      pdf.text(`$${Number(split.amount || 0).toFixed(2)}`, colAmtX, rowY, { align: 'right' });
      pdf.setFont('helvetica', 'normal');
    });
  }

  // 3. Attach First Image on Page 1
  currentY += (boxHeight + 10); // move below metadata grid
  const maxImgHeightP1 = pageHeight - currentY - margin; // Usable height left on page 1

  if (imageUrls && imageUrls.length > 0 && imageUrls[0]) {
    try {
      const dataUrl = imageUrls[0];
      
      // Label for image
      pdf.setTextColor(113, 113, 122); // Zinc 500
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8);
      pdf.text('PRIMARY DOCUMENT ATTACHMENT', margin, currentY - 2);

      if (dataUrl.startsWith('data:application/pdf')) {
        // PDF files cannot be embedded as images in jsPDF; show message
        pdf.setTextColor(24, 24, 27);
        pdf.setFont('helvetica', 'italic');
        pdf.setFontSize(10);
        pdf.text('Source PDF document attached to expense entry in Google Drive.', margin, currentY + 10);
      } else {
        const dims = await loadImageDimensions(dataUrl);
        
        // Calculate scaling to preserve aspect ratio within margins
        const scaleX = contentWidth / dims.width;
        const scaleY = maxImgHeightP1 / dims.height;
        const scale = Math.min(scaleX, scaleY);
        
        const imgWidth = dims.width * scale;
        const imgHeight = dims.height * scale;
        const imgX = margin + (contentWidth - imgWidth) / 2; // Center horizontally

        pdf.addImage(dataUrl, 'JPEG', imgX, currentY, imgWidth, imgHeight, undefined, 'FAST');
      }
    } catch (e) {
      console.error('Failed to add primary image to PDF:', e);
      pdf.setTextColor(220, 38, 38);
      pdf.text('Failed to render document image scan.', margin, currentY + 10);
    }
  }

  // 4. Attach Second Image (e.g. Receipt) on Page 2 if exists
  if (imageUrls && imageUrls.length > 1 && imageUrls[1]) {
    try {
      pdf.addPage();
      
      // Header for Page 2
      pdf.setFillColor(24, 24, 27);
      pdf.rect(0, 0, pageWidth, 20, 'F');
      
      pdf.setTextColor(255, 255, 255);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(12);
      pdf.text('JOBSCAN - ATTACHED RECEIPT / REFERENCE', margin, 13);
      
      const p2Y = 30;
      const maxImgHeightP2 = pageHeight - p2Y - margin;

      const dataUrl = imageUrls[1];
      const dims = await loadImageDimensions(dataUrl);

      const scaleX = contentWidth / dims.width;
      const scaleY = maxImgHeightP2 / dims.height;
      const scale = Math.min(scaleX, scaleY);

      const imgWidth = dims.width * scale;
      const imgHeight = dims.height * scale;
      const imgX = margin + (contentWidth - imgWidth) / 2;

      pdf.addImage(dataUrl, 'JPEG', imgX, p2Y, imgWidth, imgHeight, undefined, 'FAST');
    } catch (e) {
      console.error('Failed to add secondary image to PDF:', e);
    }
  }

  // 5. Output PDF as Blob
  return pdf.output('blob');
}
