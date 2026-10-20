const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

// For text and quoted HTML attributes; URLs and styles need their own validation.
export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => entities[char]);
