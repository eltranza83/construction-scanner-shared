import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PurchasingService,
  LocalStoragePurchasingAdapter,
  PURCHASING_STATUSES,
  STANDARD_MASTER_ITEMS,
  TRADE_SECTION_MAP,
  classifyTradeCategory,
  parseQuantity
} from '../src/services/purchasingService.js';

class MockMemoryStorage {
  constructor() {
    this.store = new Map();
  }
  getItem(key) {
    return this.store.has(key) ? this.store.get(key) : null;
  }
  setItem(key, value) {
    this.store.set(key, String(value));
  }
  removeItem(key) {
    this.store.delete(key);
  }
  clear() {
    this.store.clear();
  }
}

test('Scenario 1: Basic CRUD & Status Lifecycle (needed -> purchased)', async () => {
  const storage = new MockMemoryStorage();
  const service = new PurchasingService(new LocalStoragePurchasingAdapter(storage));

  const addRes = await service.addItem('lot_3', 'Smart doorbell', 1, 'electrical');
  assert.equal(addRes.action, 'INSERT_ITEM');
  assert.equal(addRes.item.itemName, 'Smart doorbell');
  assert.equal(addRes.item.quantity, 1);
  assert.equal(addRes.item.status, PURCHASING_STATUSES.NEEDED);
  assert.equal(addRes.item.categoryId, 'electrical');

  const neededItems = await service.getItems('lot_3', { status: PURCHASING_STATUSES.NEEDED });
  assert.equal(neededItems.length, 1);
  assert.equal(neededItems[0].itemName, 'Smart doorbell');

  const markRes = await service.updateItemStatus('lot_3', 'Smart doorbell', PURCHASING_STATUSES.PURCHASED);
  assert.equal(markRes.success, true);
  assert.equal(markRes.item.status, PURCHASING_STATUSES.PURCHASED);

  const neededAfter = await service.getItems('lot_3', { status: PURCHASING_STATUSES.NEEDED });
  assert.equal(neededAfter.length, 0);

  const purchasedAfter = await service.getItems('lot_3', { status: PURCHASING_STATUSES.PURCHASED });
  assert.equal(purchasedAfter.length, 1);
  assert.equal(purchasedAfter[0].itemName, 'Smart doorbell');

  await service.updateItemQuantity('lot_3', 'Smart doorbell', 3);
  const updatedItem = await service.findItemByName('lot_3', 'Smart doorbell');
  assert.equal(updatedItem.quantity, 3);

  const removeRes = await service.removeItem('lot_3', 'Smart doorbell');
  assert.equal(removeRes.success, true);
  const remaining = await service.getItems('lot_3');
  assert.equal(remaining.length, 0);
});

test('Scenario 2: Strict Project / Lot Isolation', async () => {
  const storage = new MockMemoryStorage();
  const service = new PurchasingService(new LocalStoragePurchasingAdapter(storage));

  await service.addItem('lot_3', 'Sinks', 2, 'quartz');
  await service.addItem('lot_3', 'Vanity lights', 4, 'electrical');
  await service.addItem('lot_4', 'Security lights', 1, 'electrical');

  const lot3Items = await service.getItems('lot_3');
  assert.equal(lot3Items.length, 2);
  assert.ok(lot3Items.some(it => it.itemName === 'Sinks'));
  assert.ok(lot3Items.some(it => it.itemName === 'Vanity lights'));
  assert.ok(!lot3Items.some(it => it.itemName === 'Security lights'));

  const lot4Items = await service.getItems('lot_4');
  assert.equal(lot4Items.length, 1);
  assert.equal(lot4Items[0].itemName, 'Security lights');

  await service.updateItemStatus('lot_3', 'Sinks', PURCHASING_STATUSES.PURCHASED);
  const lot3Purchased = await service.getItems('lot_3', { status: PURCHASING_STATUSES.PURCHASED });
  assert.equal(lot3Purchased.length, 1);

  const lot4Needed = await service.getItems('lot_4', { status: PURCHASING_STATUSES.NEEDED });
  assert.equal(lot4Needed.length, 1);
  assert.equal(lot4Needed[0].itemName, 'Security lights');
});

test('Scenario 3: Master Template Cloning & Lot Decoupling', async () => {
  const storage = new MockMemoryStorage();
  const service = new PurchasingService(new LocalStoragePurchasingAdapter(storage));

  const initRes = await service.initializeProjectFromMaster('lot_3');
  assert.equal(initRes.success, true);
  assert.equal(initRes.count, 20);

  const lot3Items = await service.getItems('lot_3');
  assert.equal(lot3Items.length, 20);
  assert.equal(lot3Items.every(it => it.projectId === 'lot_3'), true);
  assert.equal(lot3Items.every(it => it.status === PURCHASING_STATUSES.NEEDED), true);

  await service.updateItemStatus('lot_3', 'Sinks', PURCHASING_STATUSES.PURCHASED);
  await service.updateItemStatus('lot_3', 'Security lights', PURCHASING_STATUSES.PURCHASED);

  const lot3Needed = await service.getItems('lot_3', { status: PURCHASING_STATUSES.NEEDED });
  assert.equal(lot3Needed.length, 18);

  const initLot4 = await service.initializeProjectFromMaster('lot_4');
  assert.equal(initLot4.count, 20);
  const lot4Needed = await service.getItems('lot_4', { status: PURCHASING_STATUSES.NEEDED });
  assert.equal(lot4Needed.length, 20, 'Lot 4 must have all 20 items needed, independent of Lot 3');
});

test('Scenario 4: Natural Language Query & Fuzzy Stem Matching', async () => {
  const storage = new MockMemoryStorage();
  const service = new PurchasingService(new LocalStoragePurchasingAdapter(storage));

  await service.initializeProjectFromMaster('lot_3');

  const sinkItem = await service.findItemByName('lot_3', 'sink');
  assert.ok(sinkItem);
  assert.equal(sinkItem.itemName, 'Sinks');

  const doorbellItem = await service.findItemByName('lot_3', 'doorbell');
  assert.ok(doorbellItem);
  assert.ok(doorbellItem.itemName.includes('doorbell'));

  const elecItems = await service.getItems('lot_3', { trade: 'electrician' });
  assert.equal(elecItems.length, 10);
  assert.equal(elecItems[0].categoryId, 'electrical');
});

test('Scenario 5: Non-Destructive Migration from Existing Google Doc', async () => {
  const storage = new MockMemoryStorage();
  const service = new PurchasingService(new LocalStoragePurchasingAdapter(storage));

  const existingGoogleDocText = 'Applicable to all lots and standard builds.\n\n' +
    '## 1. Quartz Hardware\n- [x] Sinks\n- [ ] Electrical pass-through caps\n\n' +
    '## 2. Electrical Hardware Fixtures\n- [ ] Security lights\n- [ ] Contractor\'s doorbell chime kit\n- [ ] Smart doorbell\n- [ ] Front porch hanging light\n- [ ] Exterior column lights\n- [ ] Garage ceiling lights with the cap to install it\n- [ ] Vanity lights\n- [ ] Smart switches\n- [ ] Extension rods\n- [ ] Ceiling fans\n\n' +
    '## 3. Plumbing Hardware Fixtures\n- [ ] Soap dispenser\n- [ ] Garbage disposal power button\n- [ ] Garbage disposal\n- [ ] Water heater with the water heater stand and tray\n- [ ] Shower kits\n- [ ] Toilets\n- [ ] Rough-in shower valves\n- [ ] Faucets\n';

  const migRes = await service.migrateFromGoogleDocContent('lot_3', existingGoogleDocText);
  assert.equal(migRes.success, true);
  assert.equal(migRes.count, 20);

  const items = await service.getItems('lot_3');
  assert.equal(items.length, 20);

  const sink = items.find(it => it.itemName === 'Sinks');
  assert.ok(sink);
  assert.equal(sink.status, PURCHASING_STATUSES.PURCHASED);

  const secLights = items.find(it => it.itemName === 'Security lights');
  assert.ok(secLights);
  assert.equal(secLights.status, PURCHASING_STATUSES.NEEDED);
});

test('Scenario 6: One-Way Google Doc Markdown Export Formatting', async () => {
  const storage = new MockMemoryStorage();
  const service = new PurchasingService(new LocalStoragePurchasingAdapter(storage));

  await service.initializeProjectFromMaster('lot_3');
  await service.updateItemStatus('lot_3', 'Sinks', PURCHASING_STATUSES.PURCHASED);

  const markdown = await service.exportToGoogleDocMarkdown('lot_3', {
    title: 'Purchasing Checklist - Lot 3'
  });

  assert.ok(markdown.startsWith('# Purchasing Checklist - Lot 3'));
  assert.ok(markdown.includes('## 1. Quartz Hardware\n- [ ] Electrical pass-through caps\n- [x] Sinks'));
  assert.ok(markdown.includes('## 2. Electrical Hardware Fixtures'));
  assert.ok(markdown.includes('## 3. Plumbing Hardware Fixtures'));
  assert.equal(markdown.includes('\n\n\n'), false, 'Exported markdown must have zero triple newlines');
});