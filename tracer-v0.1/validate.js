/**
 * TRACER v0.1 - Output validation (trd3gpt §9)
 * Hard-reject conditions; rejected outputs are recorded in spans-rejected.jsonl.
 */

/**
 * Validate AI-generated doc update. Returns { valid: true } or { valid: false, reasons: string[] }.
 * Reject: empty, unparseable, >2x original size, >40% deletion, malformed markdown.
 */
function validateDocUpdate(originalContent, generatedContent) {
  const reasons = [];

  if (generatedContent == null || typeof generatedContent !== 'string') {
    reasons.push('unparseable_format');
    return { valid: false, reasons };
  }

  const trimmed = generatedContent.trim();
  if (trimmed === '') {
    reasons.push('empty_response');
    return { valid: false, reasons };
  }

  const origLen = originalContent.length;
  const newLen = trimmed.length;

  if (origLen > 0 && newLen > origLen * 2) {
    reasons.push('output_exceeds_2x_original_size');
  }

  const deletionRatio = origLen > 0 ? (origLen - newLen) / origLen : 0;
  if (deletionRatio > 0.4) {
    reasons.push('content_deletion_over_40_percent');
  }

  if (isMalformedMarkdown(trimmed)) {
    reasons.push('malformed_markdown');
  }

  return reasons.length > 0 ? { valid: false, reasons } : { valid: true };
}

/** Basic markdown sanity: balanced code fences, no obvious truncation. */
function isMalformedMarkdown(text) {
  const codeFenceMatches = text.match(/```/g);
  const count = codeFenceMatches ? codeFenceMatches.length : 0;
  if (count % 2 !== 0) return true;
  if (text.endsWith('```') && !text.includes('\n```')) return true;
  return false;
}

module.exports = { validateDocUpdate };
