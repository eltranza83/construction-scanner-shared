import { findOrCreateFolder, uploadFileToDrive } from './googleDrive.js';

function dataURLtoBlob(dataUrl) {
  const arr = dataUrl.split(',');
  const mime = arr[0].match(/:(.*?);/)[1];
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
}

export function buildInvoiceFileName(metadata) {
  const lot = (metadata.lotNumber || 'No_Lot').trim();
  const desc = (metadata.description || 'Expense').trim().substring(0, 30).trim();
  const category = (metadata.costCategory || 'material').trim().toLowerCase();
  const rawName = `${lot} - ${desc} - ${category}.pdf`;
  return rawName.replace(/[/\\:*?"<>|]/g, '_');
}

export function buildHistoryLogs(metadata, { idPrefix, link }) {
  const dateLogged = new Date().toLocaleDateString();

  if (metadata.splits && metadata.splits.length > 0) {
    return metadata.splits.map((split, index) => ({
      id: `${idPrefix}_split_${index}`,
      dateLogged,
      dateTransaction: metadata.date,
      description: `[${split.lotNumber || metadata.lotNumber || 'N/A'}] ${split.description || metadata.description || ''}`,
      vendor: metadata.vendor,
      costCategory: split.costCategory || 'material',
      amount: split.amount,
      link,
      tradeCategory: split.tradeCategory || metadata.tradeCategory,
      tradePhase: split.tradePhase || metadata.tradePhase
    }));
  }

  return [{
    id: idPrefix,
    dateLogged,
    dateTransaction: metadata.date,
    description: `[${metadata.lotNumber || 'N/A'}] ${metadata.description || ''}`,
    vendor: metadata.vendor,
    costCategory: metadata.costCategory,
    amount: metadata.amount,
    link,
    tradeCategory: metadata.tradeCategory,
    tradePhase: metadata.tradePhase
  }];
}

function downloadPdf(pdfBlob, fileName) {
  const url = URL.createObjectURL(pdfBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

async function buildPdfBlob(item, generateDocumentPDF) {
  const { metadata, mainImageBase64, secondaryImageBase64 } = item;
  const images = [];
  if (mainImageBase64) images.push(mainImageBase64);
  if (secondaryImageBase64) images.push(secondaryImageBase64);

  if (mainImageBase64 && mainImageBase64.startsWith('data:application/pdf')) {
    return { pdfBlob: dataURLtoBlob(mainImageBase64), images };
  }

  return {
    pdfBlob: await generateDocumentPDF(metadata, images),
    images
  };
}

export function resolveSplitProjectFolder(projects, selectedFolder, split) {
  const lotName = String(split.lotNumber || '').trim().toLowerCase();
  const matchingProject = projects.find(project => project.name.trim().toLowerCase() === lotName);

  return {
    folderId: matchingProject ? matchingProject.folderId : selectedFolder.id,
    lotName: matchingProject ? matchingProject.name : split.lotNumber
  };
}

export async function syncInvoiceDocument({
  item,
  googleToken,
  selectedFolder,
  projects
}) {
  const { generateDocumentPDF } = await import('./pdfGenerator.js');
  const { metadata } = item;
  const { pdfBlob, images } = await buildPdfBlob(item, generateDocumentPDF);

  const isOfflineMode = !googleToken || !selectedFolder;
  if (isOfflineMode) {
    downloadPdf(pdfBlob, buildInvoiceFileName(metadata));
    return {
      logs: buildHistoryLogs(metadata, { idPrefix: Date.now().toString(), link: null }),
      hasDriveUpload: false,
      successMessage: 'Document PDF generated and downloaded to device!'
    };
  }

  let mainUploadResult = null;

  if (metadata.splits && metadata.splits.length > 0) {
    for (const split of metadata.splits) {
      const splitAmount = parseFloat(split.amount) || 0;
      if (splitAmount <= 0) continue;

      const splitMetadata = {
        ...metadata,
        amount: splitAmount,
        description: split.description || metadata.description,
        lotNumber: split.lotNumber || metadata.lotNumber,
        tradeCategory: split.tradeCategory || metadata.tradeCategory,
        tradePhase: split.tradePhase || metadata.tradePhase,
        costCategory: split.costCategory || metadata.costCategory,
        splits: null
      };
      const splitPdfBlob = await generateDocumentPDF(splitMetadata, images);
      const projectFolder = resolveSplitProjectFolder(projects, selectedFolder, split);
      const uploadsFolder = await findOrCreateFolder(googleToken, 'Invoice Uploads', projectFolder.folderId);
      const splitFileName = buildInvoiceFileName({
        ...splitMetadata,
        lotNumber: projectFolder.lotName
      });

      const result = await uploadFileToDrive(
        googleToken,
        uploadsFolder,
        splitFileName,
        'application/pdf',
        splitPdfBlob,
        JSON.stringify(splitMetadata)
      );

      if (!mainUploadResult) {
        mainUploadResult = result;
      }
    }
  } else {
    const uploadsFolder = await findOrCreateFolder(googleToken, 'Invoice Uploads', selectedFolder.id);
    mainUploadResult = await uploadFileToDrive(
      googleToken,
      uploadsFolder,
      buildInvoiceFileName(metadata),
      'application/pdf',
      pdfBlob,
      JSON.stringify(metadata)
    );
  }

  if (!mainUploadResult) {
    throw new Error('No invoice splits had a valid amount to upload.');
  }

  return {
    logs: buildHistoryLogs(metadata, {
      idPrefix: mainUploadResult.id,
      link: mainUploadResult.webViewLink
    }),
    hasDriveUpload: true,
    successMessage: 'Document report PDF synced successfully!'
  };
}
