/**
 * TRACER v0.1 - Track 1: AI Prompt Strategy Spike
 * Tests Full Document vs. Chunked Document context windows.
 * Run with: ANTHROPIC_API_KEY=your_key node spike.js
 */

const fs = require('fs');
const path = require('path');

const API_KEY = process.env.ANTHROPIC_API_KEY;
if (!API_KEY) {
  console.error("Error: ANTHROPIC_API_KEY environment variable is required.");
  process.exit(1);
}

// --- MOCK DATA ---
const mockDiff = `
diff --git a/src/auth.js b/src/auth.js
index 83a0f7..92b1c4 100644
--- a/src/auth.js
+++ b/src/auth.js
@@ -10,5 +10,14 @@
-export function authenticate(req) {
-  // Legacy Basic Auth
-  const b64auth = (req.headers.authorization || '').split(' ')[1] || '';
-  return Buffer.from(b64auth, 'base64').toString().split(':');
-}
+export function authenticate(req) {
+  // New JWT Auth Implementation
+  const token = req.headers.authorization?.split('Bearer ')[1];
+  if (!token) throw new Error('Unauthorized');
+  return jwt.verify(token, process.env.JWT_SECRET);
+}
`;

const mockFullDoc = `
# System Architecture

## 1. Overview
The Mopac API provides backend services for the client application. It is built on Node.js and Express.

## 2. Authentication
Currently, the system uses basic authentication. Clients must pass a base64 encoded string of their username and password in the Authorization header.
We plan to migrate this to token-based auth in Q3.

## 3. Database
We use PostgreSQL. Connection pooling is handled by pg-pool.
`;

const mockChunkedDoc = `
## 2. Authentication
Currently, the system uses basic authentication. Clients must pass a base64 encoded string of their username and password in the Authorization header.
We plan to migrate this to token-based auth in Q3.
`;

// --- AI CALLING LOGIC ---
async function callClaude(promptContext, strategyName) {
  console.log(`\n⏳ Running strategy: ${strategyName}...`);
  
  const systemPrompt = `You are AutoDocs, an AI documentation agent. 
Your job is to read a code diff and an existing documentation snippet, and output ONLY the updated markdown for the documentation.
Do not include pleasantries. Keep the tone technical and concise.`;

  const userPrompt = `
Here is the code diff:
<diff>
${mockDiff}
</diff>

Here is the current documentation:
<doc>
${promptContext}
</doc>

Please rewrite the documentation to accurately reflect the changes in the diff.`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }]
    })
  });

  if (!response.ok) {
    const err = await response.text();
    console.error(`❌ API Error (${strategyName}):`, err);
    return null;
  }

  const data = await response.json();
  return data.content[0].text;
}

// --- EXECUTION ---
async function runSpike() {
  console.log("🚀 Starting AutoDocs Prompt Strategy Spike...");

  // Run Strategy 1: Full Document
  const fullDocResult = await callClaude(mockFullDoc, "Full Document Context");
  if (fullDocResult) {
    fs.writeFileSync(path.join(__dirname, '.tracer', 'spike', 'result-full.md'), fullDocResult);
    console.log("✅ Full Document result saved to .tracer/spike/result-full.md");
  }

  // Run Strategy 2: Chunked Document
  const chunkedResult = await callClaude(mockChunkedDoc, "Chunked Document Context");
  if (chunkedResult) {
    fs.writeFileSync(path.join(__dirname, '.tracer', 'spike', 'result-chunked.md'), chunkedResult);
    console.log("✅ Chunked Document result saved to .tracer/spike/result-chunked.md");
  }

  console.log("\n🏁 Spike complete. Review the files in .tracer/spike/ and determine the winner.");
}

runSpike();