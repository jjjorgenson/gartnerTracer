#!/usr/bin/env node

/**
 * TRACER v0.1 - Cursor Tool Hook
 * Simulates receiving a payload from Cursor and logging a span.
 */
const { logSpan } = require('./logger');
const crypto = require('node:crypto');

try {
  console.log("⚡ [Tracer] Intercepting Cursor AI event...");

  // In a real environment, Cursor passes data via stdin or arguments.
  // We are mocking the incoming payload for this test.
  const mockCursorPayload = {
    model: "claude-3-5-sonnet",
    usage: { prompt_tokens: 1250, completion_tokens: 450 },
    durationMs: 1200,
    sensitivePrompt: "Write a JWT auth middleware for Express..." // Should be stripped!
  };

  // Map to the Canonical Span Schema
  const span = {
    id: `span_${crypto.randomUUID()}`,
    timestamp: new Date().toISOString(),
    tool: 'cursor',
    eventType: 'ai_call',
    model: mockCursorPayload.model,
    inputTokens: mockCursorPayload.usage.prompt_tokens,
    outputTokens: mockCursorPayload.usage.completion_tokens,
    latencyMs: mockCursorPayload.durationMs,
    promptText: mockCursorPayload.sensitivePrompt // Deliberately testing the security stripper
  };

  logSpan(span);
  console.log("✅ [Tracer] Span securely logged.");

  // ALWAYS EXIT 0
  process.exit(0);

} catch (err) {
  // FAIL OPEN: Swallow the error and exit 0 to protect the IDE
  process.exit(0);
}