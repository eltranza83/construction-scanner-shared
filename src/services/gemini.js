import { GoogleGenerativeAI } from '@google/generative-ai';

/**
 * Converts a File or Blob object into the format expected by the Gemini API (inlineData).
 */
async function fileToGenerativePart(fileOrBlob) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64Data = reader.result.split(',')[1];
      resolve({
        inlineData: {
          data: base64Data,
          mimeType: fileOrBlob.type
        },
      });
    };
    reader.readAsDataURL(fileOrBlob);
  });
}

/**
 * Extracts construction document details using Gemini AI.
 * Falls back to mock data if the API key is missing or invalid, allowing testing.
 */
export async function extractDocumentData(fileOrBlob, apiKey) {
  if (!apiKey) {
    console.warn('Gemini API key is missing. Using simulated local OCR extraction.');
    return simulateOCRExtraction(fileOrBlob.name || 'document.jpg');
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    // Use gemini-3.1-flash-lite for fast, low-cost multimodal analysis
    const model = genAI.getGenerativeModel({ model: 'gemini-3.1-flash-lite' });
    const imagePart = await fileToGenerativePart(fileOrBlob);

    const prompt = `
      You are an OCR and data extraction assistant for a construction company.
      Analyze the attached image of a check, receipt, or invoice and extract the details in JSON format.
      
      Response JSON Schema:
      {
        "type": "check" | "invoice" | "receipt",
        "description": "Short description of items purchased, memo of check, or job description.",
        "vendor": "Name of the store (e.g. Home Depot) or subcontractor payee (e.g. John Doe Electrical).",
        "costCategory": "material" | "labor",
        "amount": 0.00 (the total cost or check amount as a decimal number),
        "date": "YYYY-MM-DD (format the date found on the document, or empty string)",
        "checkNumber": "Check number (only if the document is a check, otherwise null)",
        "tradeCategory": "Site_Prep_&_Structure" | "Framing_&_Lumber" | "Mechanicals_&_Utilities" | "Interior_Finishes" | "Paint_Tile" | "House_Exterior_&_Yard" | "Project_Overhead_&_Bills",
        "tradePhase": "The specific phase block matching the category (e.g. 'Plumbing Rough-In', 'Roofing', 'Tile & Flooring', 'Paint & Finishes')"
      }
      
      Instructions:
      1. Carefully identify if this is a CHECK written out to someone or an INVOICE/RECEIPT from a store.
      2. If it is a check, extract the "payee" as the vendor, classify the costCategory (usually "labor" for subcontractors, "material" if specified for materials), extract the date, check number, and amount.
      3. If it is an invoice/receipt, extract the store/vendor name, the total amount, the date, and describe the items. Classify as "material" unless it is an invoice for labor services.
      4. Make a best effort to write a concise "description" of the job or items (e.g. "Electrical wiring for Plot 14", "Lumber and drywalls").
      
      5. Subcontractor Trade Classification:
         Identify which Trade Category sheet name and Phase block name this transaction belongs to:
         - Category: Site_Prep_&_Structure (Phases: Foundation & Flatwork, Roofing, Windows & Exterior Doors)
         - Category: Framing_&_Lumber (Phases: Framing & Lumber)
         - Category: Mechanicals_&_Utilities (Phases: Plumbing Rough-In, Electrical & Lighting, HVAC / AC Systems, Insulation & Alarms)
         - Category: Interior_Finishes (Phases: Drywall & Sheetrock, Cabinets & Trim Carpentry, Quartz & Countertops, Glass Work)
         - Category: Paint_Tile (Phases: Tile & Flooring, Paint & Finishes)
         - Category: House_Exterior_&_Yard (Phases: Stucco & Masonry, Garage Doors, Driveway & Sidewalks, Cantera Stone Detail, Fencing & Gates, Landscaping & Irrigation)
         - Category: Project_Overhead_&_Bills (Phases: Monthly Utility Bills, Dumpsters & Cleaning, Extra Costs & Misc)
      
      6. Output ONLY the JSON block. Do not wrap in markdown or backticks.
    `;

    const result = await model.generateContent({
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            imagePart
          ]
        }
      ],
      generationConfig: {
        responseMimeType: 'application/json',
      }
    });

    const responseText = result.response.text();
    console.log('Gemini raw response:', responseText);
    return JSON.parse(responseText);
  } catch (error) {
    console.error('Gemini API Extraction failed:', error);
    throw new Error(`AI Extraction failed: ${error.message}`);
  }
}

/**
 * Mock OCR helper for testing when API key is not entered yet.
 */
function simulateOCRExtraction(filename) {
  return new Promise((resolve) => {
    setTimeout(() => {
      const isCheck = filename.toLowerCase().includes('check') || Math.random() > 0.5;
      
      if (isCheck) {
        resolve({
          type: 'check',
          description: 'Rough Plumbing Rough-in for Lot 12',
          vendor: 'Apex Plumbing Services',
          costCategory: 'labor',
          amount: 2450.00,
          date: new Date().toISOString().split('T')[0],
          checkNumber: Math.floor(1000 + Math.random() * 9000).toString(),
          tradeCategory: 'Mechanicals_&_Utilities',
          tradePhase: 'Plumbing Rough-In'
        });
      } else {
        resolve({
          type: 'invoice',
          description: 'Copper pipes, fittings, and PVC adhesive',
          vendor: 'Lowe\'s Pro Services',
          costCategory: 'material',
          amount: 418.75,
          date: new Date().toISOString().split('T')[0],
          checkNumber: null,
          tradeCategory: 'Mechanicals_&_Utilities',
          tradePhase: 'Plumbing Rough-In'
        });
      }
    }, 1500);
  });
}
