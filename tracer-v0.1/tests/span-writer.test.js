/**
 * Tests for span-writer (TRD §3.1 validation and write).
 */
const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const { validate, writeSpan, generateId, REJECTED_FILE, SPANS_FILE } = require('../span-writer.js');

describe('span-writer', () => {
  describe('validate', () => {
    it('accepts valid span with ULID and response event', () => {
      const id = generateId();
      assert.ok(/^[0-7][0-9A-HJKMNPQRSTVWXYZa-hjkmnp-tv-z]{25}$/.test(id));
      const span = {
        id,
        sessionId: 'sess-1',
        tool: 'cursor',
        event: 'response',
        timestamp: new Date().toISOString(),
        model: 'claude-3-5-sonnet',
        inputTokens: 100,
        outputTokens: 50
      };
      const r = validate(span);
      assert.strictEqual(r.valid, true);
    });

    it('rejects invalid id', () => {
      const r = validate({
        id: 'not-a-ulid',
        sessionId: 's',
        tool: 'cursor',
        event: 'response',
        timestamp: new Date().toISOString(),
        model: 'x'
      });
      assert.strictEqual(r.valid, false);
      assert.ok(r.reason.includes('ULID'));
    });

    it('rejects invalid tool', () => {
      const r = validate({
        id: generateId(),
        sessionId: 's',
        tool: 'vscode',
        event: 'response',
        timestamp: new Date().toISOString(),
        model: 'x'
      });
      assert.strictEqual(r.valid, false);
    });

    it('rejects invalid event', () => {
      const r = validate({
        id: generateId(),
        sessionId: 's',
        tool: 'cursor',
        event: 'click',
        timestamp: new Date().toISOString()
      });
      assert.strictEqual(r.valid, false);
    });

    it('rejects response without model', () => {
      const r = validate({
        id: generateId(),
        sessionId: 's',
        tool: 'cursor',
        event: 'response',
        timestamp: new Date().toISOString()
      });
      assert.strictEqual(r.valid, false);
    });

    it('accepts session_start without model', () => {
      const r = validate({
        id: generateId(),
        sessionId: 's',
        tool: 'cursor',
        event: 'session_start',
        timestamp: new Date().toISOString()
      });
      assert.strictEqual(r.valid, true);
    });
  });

  describe('writeSpan', () => {
    it('writes valid span to spans.jsonl', () => {
      const span = {
        id: generateId(),
        sessionId: 'sess-write',
        tool: 'cursor',
        event: 'response',
        timestamp: new Date().toISOString(),
        model: 'claude-3-5-sonnet',
        inputTokens: 10,
        outputTokens: 5
      };
      writeSpan(span);
      assert.ok(fs.existsSync(SPANS_FILE));
      const lines = fs.readFileSync(SPANS_FILE, 'utf8').trim().split('\n').filter(Boolean);
      assert.ok(lines.length >= 1);
      const last = JSON.parse(lines[lines.length - 1]);
      assert.strictEqual(last.tool, 'cursor');
      assert.strictEqual(last.event, 'response');
      assert.strictEqual(last.sessionId, 'sess-write');
    });

    it('writes invalid span to spans-rejected.jsonl', () => {
      const span = {
        id: 'invalid-id',
        sessionId: 's',
        tool: 'cursor',
        event: 'response',
        timestamp: new Date().toISOString(),
        model: 'x'
      };
      writeSpan(span);
      assert.ok(fs.existsSync(REJECTED_FILE));
      const lines = fs.readFileSync(REJECTED_FILE, 'utf8').trim().split('\n').filter(Boolean);
      assert.ok(lines.length >= 1);
      const last = JSON.parse(lines[lines.length - 1]);
      assert.ok(last._rejectedReason);
    });
  });
});
