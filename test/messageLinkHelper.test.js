import assert from 'node:assert/strict';
import test from 'node:test';
import {
  cleanPhoneForWhatsApp,
  cleanPhoneForSMS,
  buildMessageText,
  buildMessageLink
} from '../src/services/messageLinkHelper.js';

test('cleanPhoneForWhatsApp cleans up non-digits', () => {
  assert.equal(cleanPhoneForWhatsApp('+1 (555) 123-4567'), '15551234567');
  assert.equal(cleanPhoneForWhatsApp('1-555-999-0000'), '15559990000');
  assert.equal(cleanPhoneForWhatsApp(''), '');
});

test('cleanPhoneForSMS preserves leading plus', () => {
  assert.equal(cleanPhoneForSMS('+1 (555) 123-4567'), '+15551234567');
  assert.equal(cleanPhoneForSMS('555-123-4567'), '5551234567');
  assert.equal(cleanPhoneForSMS('  +52 1 234 5678  '), '+5212345678');
  assert.equal(cleanPhoneForSMS(''), '');
});

test('buildMessageText formats correctly with and without description/photo', () => {
  const issueBasic = {
    contractorName: 'John',
    category: 'Mechanicals_&_Utilities',
    tradePhase: 'Plumbing Rough-In',
    title: 'Pipe Leak under sink',
    description: '',
    photoUrl: null
  };

  const basicText = buildMessageText(issueBasic);
  assert.equal(basicText, 'Hi John, we have an open issue on site for Plumbing Rough-In: "Pipe Leak under sink"');

  const issueFull = {
    contractorName: '  Alice  ',
    category: 'Paint_Tile',
    tradePhase: '',
    title: 'Cracked tile in kitchen',
    description: 'Backsplash tile has a vertical crack.',
    photoUrl: 'https://drive.google.com/file/d/12345'
  };

  const fullText = buildMessageText(issueFull);
  assert.equal(fullText, 'Hi Alice, we have an open issue on site for Paint Tile: "Cracked tile in kitchen" - Backsplash tile has a vertical crack. Photo: https://drive.google.com/file/d/12345');
});

test('buildMessageLink formats correct URLs', () => {
  const issue = {
    contractorName: 'Bob',
    category: 'Framing_&_Lumber',
    title: 'Missing stud',
    phoneNumber: '+1-555-999-1111',
    description: 'Main wall has a missing stud.',
    photoUrl: null
  };

  const expectedText = 'Hi Bob, we have an open issue on site for Framing & Lumber: "Missing stud" - Main wall has a missing stud.';
  const expectedEncoded = encodeURIComponent(expectedText);


  // WhatsApp Link
  const waLink = buildMessageLink(issue, 'whatsapp');
  assert.equal(waLink, `https://wa.me/15559991111?text=${expectedEncoded}`);

  // SMS Link
  const smsLink = buildMessageLink(issue, 'sms');
  assert.equal(smsLink, `sms:+15559991111?body=${expectedEncoded}`);
});
