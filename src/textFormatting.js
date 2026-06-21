export function stripFormatting(value = '') {
  return value
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*]\s+/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/_(.*?)_/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

export function createPlainPreview(value = '') {
  return stripFormatting(value) || 'No preview available.';
}
