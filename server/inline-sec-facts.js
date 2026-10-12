const attribute = (text, name) => text.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, 'i'))?.[1];
const element = (text, name) => text.match(new RegExp(`<(?:xbrli:)?${name}\\b[^>]*>([^<]+)<\\/(?:xbrli:)?${name}>`, 'i'))?.[1]?.trim();

// Narrow, audited fallback for issuer extension facts omitted from SEC CompanyFacts.
function inlineFinancialFacts(html, { cik, qualifiedTag, form, filed, accn, cutoff, contextKind = 'duration' }) {
  if (!/^[\w-]+:[\w-]+$/.test(qualifiedTag) || !['duration', 'instant'].includes(contextKind)) return [];
  const contexts = new Map();
  for (const match of html.matchAll(/<(?:xbrli:)?context\b([^>]*)>([\s\S]*?)<\/(?:xbrli:)?context>/gi)) {
    const body = match[2]; const start = contextKind === 'duration' ? element(body, 'startDate') : undefined;
    const end = element(body, contextKind === 'instant' ? 'instant' : 'endDate');
    if (/<(?:xbrldi:)?(?:explicitMember|typedMember)\b/i.test(body) || Number(element(body, 'identifier')) !== Number(cik) ||
      (contextKind === 'duration' && (!/^\d{4}-\d{2}-\d{2}$/.test(start || '') || !Number.isFinite(Date.parse(start)) || start >= end)) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(end || '') || !Number.isFinite(Date.parse(end)) || end > cutoff) continue;
    contexts.set(attribute(match[1], 'id'), { ...(start ? { start } : {}), end });
  }
  const units = new Map();
  for (const match of html.matchAll(/<(?:xbrli:)?unit\b([^>]*)>([\s\S]*?)<\/(?:xbrli:)?unit>/gi)) {
    const currency = element(match[2], 'measure')?.match(/^iso4217:([A-Z]{3})$/)?.[1];
    if (currency && !/<(?:xbrli:)?divide\b/i.test(match[2])) units.set(attribute(match[1], 'id'), currency);
  }
  const facts = new Map(); const conflicts = new Set();
  for (const match of html.matchAll(/<ix:nonfraction\b([^>]*)>([\s\S]*?)<\/ix:nonfraction>/gi)) {
    if (attribute(match[1], 'name') !== qualifiedTag || /^(true|1)$/i.test(attribute(match[1], '(?:xsi:)?nil') || '')) continue;
    const context = contexts.get(attribute(match[1], 'contextref')); const unit = units.get(attribute(match[1], 'unitref'));
    const text = match[2].replace(/<ix:exclude\b[^>]*>[\s\S]*?<\/ix:exclude>/gi, '').replace(/<[^>]*>/g, '').trim();
    const scale = Number(attribute(match[1], 'scale') || 0); const sign = attribute(match[1], 'sign');
    if (!context || !unit || !/^-?\d[\d,]*(?:\.\d+)?$/.test(text) || !Number.isInteger(scale) || Math.abs(scale) > 12 || (sign && sign !== '-')) continue;
    const val = Number(text.replaceAll(',', '')) * 10 ** scale * (sign === '-' ? -1 : 1);
    if (!Number.isFinite(val) || Math.abs(val) > Number.MAX_SAFE_INTEGER || filed > cutoff) continue;
    const [taxonomy, tag] = qualifiedTag.split(':');
    const key = `${context.start}:${context.end}:${unit}`;
    if (facts.has(key) && facts.get(key).val !== val) conflicts.add(key);
    facts.set(key, { ...context, unit, val, taxonomy, tag, form, filed, accn, extractionMethod: 'sec-inline-xbrl' });
  }
  return [...facts].filter(([key]) => !conflicts.has(key)).map(([, fact]) => fact);
}

const inlineRevenueFacts = (html, metadata) => inlineFinancialFacts(html, { ...metadata, contextKind: 'duration' });
module.exports = { inlineRevenueFacts, inlineFinancialFacts };
