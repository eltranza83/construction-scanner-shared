/**
 * Clean phone number specifically for WhatsApp API (digits only, no spaces, dashes, or leading plus/zeros).
 */
export function cleanPhoneForWhatsApp(phone) {
  if (!phone) return '';
  return phone.replace(/\D/g, '');
}

/**
 * Clean phone number for SMS (digits and optional leading plus sign).
 */
export function cleanPhoneForSMS(phone) {
  if (!phone) return '';
  // Keep digits and leading + if it exists
  const cleaned = phone.trim();
  const hasPlus = cleaned.startsWith('+');
  const digits = cleaned.replace(/\D/g, '');
  return hasPlus ? `+${digits}` : digits;
}

/**
 * Builds the text message body for the contractor.
 */
export function buildMessageText(issue) {
  const contractor = issue.contractorName ? issue.contractorName.trim() : 'there';
  const categoryOrPhase = issue.tradePhase || String(issue.category || 'General').replace(/_/g, ' ');
  const title = String(issue.title || '').trim();
  const description = String(issue.description || '').trim();
  
  let body = `Hi ${contractor}, we have an open issue on site for ${categoryOrPhase}: "${title}"`;
  
  if (description) {
    body += ` - ${description}`;
  }
  
  if (issue.photoUrl) {
    body += ` Photo: ${issue.photoUrl}`;
  }

  if (issue.floorPlanSnapshotUrl) {
    body += ` Floor plan pin: ${issue.floorPlanSnapshotUrl}`;
  } else if (Number.isFinite(Number(issue.floorPlanX)) && Number.isFinite(Number(issue.floorPlanY))) {
    body += ' Location: marked on the X-Ray floor plan.';
  }
  
  return body;
}

/**
 * Generates the clickable URL for SMS or WhatsApp.
 */
export function buildMessageLink(issue, platform) {
  const message = buildMessageText(issue);
  const encoded = encodeURIComponent(message);
  
  if (platform === 'whatsapp') {
    const cleanPhone = cleanPhoneForWhatsApp(issue.phoneNumber);
    return `https://wa.me/${cleanPhone}?text=${encoded}`;
  } else {
    const cleanPhone = cleanPhoneForSMS(issue.phoneNumber);
    return `sms:${cleanPhone}?body=${encoded}`;
  }
}
