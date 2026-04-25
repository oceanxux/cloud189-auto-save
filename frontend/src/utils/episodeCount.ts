export function extractEpisodeCountFromTitle(value: unknown): number {
  const text = String(value || '').trim();
  if (!text) return 0;

  const patterns = [
    /(?:全|共)\s*(\d{1,3})\s*集/,
    /(\d{1,3})\s*集\s*(?:全|全集|完结|已完结)/,
    /(?:第\s*)?\d{1,3}\s*[-~至到]\s*(\d{1,3})\s*集\s*(?:全|完结|已完结)?/,
    /S\d{1,2}\s*(?:E|EP)\s*\d{1,3}\s*[-~至到]\s*(?:E|EP)?\s*(\d{1,3})/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    const count = Number(match?.[1] || 0);
    if (Number.isInteger(count) && count > 0) {
      return count;
    }
  }

  return 0;
}
