#!/usr/bin/env node

import https from "node:https";
import { Buffer } from "node:buffer";

const API_KEY = process.argv[2] || process.env.ANTHROPIC_API_KEY;
const QUESTION =
  process.argv.slice(3).join(" ").trim() ||
  "Who was the first President of India and in which year did he take office? Answer in 2 short sentences.";

if (!API_KEY) {
  console.error("Usage: node test-anthropic-key.js <your-api-key> [question...]");
  console.error("  or:  ANTHROPIC_API_KEY=your-key node test-anthropic-key.js [question...]");
  process.exit(1);
}

console.log("Testing Anthropic API key...");
console.log("Key:", API_KEY.slice(0, 10) + "..." + API_KEY.slice(-4));
console.log("Question:", QUESTION);

const body = JSON.stringify({
  model: "claude-haiku-4-5",
  max_tokens: 300,
  messages: [{ role: "user", content: QUESTION }],
});

const options = {
  hostname: "api.anthropic.com",
  path: "/v1/messages",
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-api-key": API_KEY,
    "anthropic-version": "2023-06-01",
    "Content-Length": Buffer.byteLength(body),
  },
};

const req = https.request(options, (res) => {
  let data = "";
  res.on("data", (chunk) => (data += chunk));
  res.on("end", () => {
    const json = JSON.parse(data);

    if (res.statusCode === 200) {
      console.log("\n✅ API key is VALID");
      console.log("Model:", json.model);
      console.log("Response:", json.content[0].text);
      console.log("Input tokens used:", json.usage.input_tokens);
      console.log("Output tokens used:", json.usage.output_tokens);
    } else if (res.statusCode === 401) {
      console.error("\n❌ INVALID API key — authentication failed");
    } else if (res.statusCode === 429) {
      console.warn("\n⚠️  Key is valid but RATE LIMITED or out of credits");
      console.warn("Error:", json.error?.message);
    } else {
      console.error(`\n❌ Error ${res.statusCode}:`, json.error?.message);
    }
  });
});

req.on("error", (e) => console.error("Request failed:", e.message));
req.write(body);
req.end();
