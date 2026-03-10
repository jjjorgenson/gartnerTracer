/**
 * Unit tests for validateDocUpdate (trd3gpt §9 hard-reject rules)
 */
const { describe, it } = require('node:test');
const assert = require('node:assert');
const { validateDocUpdate } = require('../validate.js');

const ORIGINAL = 'Line one.\nLine two.\nLine three.';

describe('validateDocUpdate', () => {
  it('accepts valid update of similar length', () => {
    const result = validateDocUpdate(ORIGINAL, 'Line one.\nLine two updated.\nLine three.');
    assert.strictEqual(result.valid, true);
  });

  it('rejects empty response', () => {
    const result = validateDocUpdate(ORIGINAL, '');
    assert.strictEqual(result.valid, false);
    assert.ok(result.reasons.includes('empty_response'));
  });

  it('rejects whitespace-only response', () => {
    const result = validateDocUpdate(ORIGINAL, '   \n\t  ');
    assert.strictEqual(result.valid, false);
    assert.ok(result.reasons.includes('empty_response'));
  });

  it('rejects null or non-string', () => {
    assert.strictEqual(validateDocUpdate(ORIGINAL, null).valid, false);
    assert.strictEqual(validateDocUpdate(ORIGINAL, undefined).valid, false);
    assert.strictEqual(validateDocUpdate(ORIGINAL, 123).valid, false);
    assert.ok(validateDocUpdate(ORIGINAL, null).reasons.includes('unparseable_format'));
  });

  it('rejects output >2x original size', () => {
    const long = 'x'.repeat(ORIGINAL.length * 2 + 1);
    const result = validateDocUpdate(ORIGINAL, long);
    assert.strictEqual(result.valid, false);
    assert.ok(result.reasons.includes('output_exceeds_2x_original_size'));
  });

  it('accepts output exactly 2x original size', () => {
    const exactly2x = 'x'.repeat(ORIGINAL.length * 2);
    const result = validateDocUpdate(ORIGINAL, exactly2x);
    assert.strictEqual(result.valid, true);
  });

  it('rejects >40% content deletion', () => {
    const short = 'Line one.'; // much shorter than ORIGINAL
    const result = validateDocUpdate(ORIGINAL, short);
    assert.strictEqual(result.valid, false);
    assert.ok(result.reasons.includes('content_deletion_over_40_percent'));
  });

  it('accepts moderate deletion under 40%', () => {
    const result = validateDocUpdate(ORIGINAL, 'Line one.\nLine two.');
    assert.strictEqual(result.valid, true);
  });

  it('rejects malformed markdown (unbalanced code fences)', () => {
    const result = validateDocUpdate(ORIGINAL, 'Text\n```js\ncode');
    assert.strictEqual(result.valid, false);
    assert.ok(result.reasons.includes('malformed_markdown'));
  });

  it('accepts balanced code fences', () => {
    const result = validateDocUpdate(ORIGINAL, 'Text\n```js\ncode\n```');
    assert.strictEqual(result.valid, true);
  });
});
