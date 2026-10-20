// Visibility is a projection only. Hidden examples remain in the portable file.
export const developerKey = 'jiwei-desktop-developer-mode';
export const isDeveloperMode = storage => storage.getItem(developerKey) === 'true';
export function requireDeveloperMode(storage) {
  if (!isDeveloperMode(storage)) throw Error('请先在设置中开启开发者模式，才能导入或使用示例。');
}
export function isExampleRecord(storage, record) {
  if (record?.example === true) return true;
  // Legacy confirmed example drafts did not carry the example flag. Use their
  // recorded source identity, never titles or an arbitrary demo-looking id.
  if (!record?.sourceUrl) return false;
  const captures = JSON.parse(storage.getItem('jiwei-desktop-web-collections-v1') || '[]');
  return captures.some(c => c.example === true && c.url === record.sourceUrl && c.drafts.some(d => d.taskId === record.id));
}
export const visibleRecords = (storage, records) => isDeveloperMode(storage) ? records : records.filter(record => !isExampleRecord(storage, record));
