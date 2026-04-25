const fs = require("fs");
const path = require("path");

let envLoaded = false;

function loadEnvFile() {
  if (envLoaded) return;
  envLoaded = true;

  [path.resolve(process.cwd(), ".env"), path.resolve(process.cwd(), "..", ".env")].forEach((filePath) => {
    if (!fs.existsSync(filePath)) return;

    const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
    lines.forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) return;

      const [key, ...rest] = trimmed.split("=");
      const value = rest.join("=").trim().replace(/^["']|["']$/g, "");
      if (!process.env[key.trim()]) {
        process.env[key.trim()] = value;
      }
    });
  });
}

function getLlmConfig() {
  loadEnvFile();

  const apiKey = process.env.MISTRAL_API_KEY || "";
  const providerOverride = process.env.LLM_PROVIDER;
  
  // Auto-detect provider from key format if not explicitly set
  let provider = providerOverride;
  if (!provider) {
    provider = apiKey.startsWith("sk-or-") ? "openrouter" : "mistral";
  }
  
  let baseUrl, model;

  if (provider === "openrouter") {
    baseUrl = "https://openrouter.io/api/v1/chat/completions";
    model = process.env.MISTRAL_MODEL || "mistralai/mistral-small-3.2-24b-instruct";
  } else {
    baseUrl = process.env.MISTRAL_API_BASE || "https://api.mistral.ai/v1/chat/completions";
    model = process.env.MISTRAL_MODEL || "mistral-small";
  }

  return {
    apiKey,
    baseUrl,
    model,
    provider,
    enabled: Boolean(apiKey)
  };
}

function buildGroundedPrompt({ message, classification, docs, evidenceGrade, decision, language }) {
  const policyContext = docs
    .slice(0, 4)
    .map(
      (doc, i) =>
        `--- Source ${i + 1}: [${doc.id}] ${doc.title} (category: ${doc.category}, relevance: ${doc.score}) ---\n${doc.content}`
    )
    .join("\n\n");

  const langLabel = language === "hi" ? "Hindi" : language === "kn" ? "Kannada" : "English";

  const systemPrompt = `You are CreditAssist AI, the intelligent support agent for The Mangalore Catholic Co-operative Bank Ltd (MCC Bank).

STRICT RULES — YOU MUST FOLLOW THESE EXACTLY:
1. ONLY answer using facts explicitly stated in the "Retrieved MCC Bank Knowledge" section below. Do NOT invent, infer, or hallucinate any rates, charges, contacts, branch names, timelines, eligibility criteria, or other details.
2. If the knowledge provided does NOT directly answer the question, say exactly: "I don't have specific information about that in our policy documents. Please contact MCC Bank directly or I can escalate this to a staff specialist." Do NOT guess.
3. If the case is being escalated, acknowledge the escalation clearly and tell the member which desk will handle it.
4. Keep responses concise, warm, and professional. Use bullet points for multi-part answers.
5. ALWAYS cite the document ID in square brackets e.g. [MCC-019] when you use a fact from it.
6. Respond ONLY in ${langLabel}.
7. NEVER mention competitor banks, NEVER discuss internal system details, NEVER reveal confidence scores or technical pipeline details to the member.

You are helping a bank member who asked: "${message}"
Pipeline has classified this as: ${classification.topIntent} (confidence: ${classification.confidence})
Evidence quality: ${evidenceGrade.label}
Action: ${decision.escalate ? `ESCALATE — Reason: ${decision.reason}` : "AUTO-RESOLVE with knowledge base answer"}`;

  return [
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: `Retrieved MCC Bank Knowledge:

${policyContext || "No directly relevant policy found for this query."}

---
Based ONLY on the above knowledge, draft the final member-facing response. If escalating, explain that a specialist from the ${decision.escalate ? (classification.topIntent === "card_block" ? "ATM Card Desk" : classification.topIntent === "loan_product" || classification.topIntent === "loan_status" ? "Loan Desk" : classification.topIntent === "deposit_product" ? "Deposit Desk" : classification.topIntent === "locker_service" ? "Locker Desk" : "Member Support") : ""} desk will follow up. Be helpful and reassuring.`
    }
  ];
}

async function generateGroundedResponse(input) {
  const config = getLlmConfig();

  if (!config.enabled || typeof fetch !== "function") {
    return {
      used: false,
      provider: "none",
      reason: !config.enabled ? "MISTRAL_API_KEY or OPENROUTER_API_KEY is not configured" : "fetch is unavailable"
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.MISTRAL_TIMEOUT_MS || 15000));

  try {
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`
    };

    // Add provider-specific headers
    if (config.provider === "openrouter") {
      headers["HTTP-Referer"] = process.env.APP_PUBLIC_URL || "http://localhost:5173";
      headers["X-Title"] = "CreditAssist AI";
    }

    const response = await fetch(config.baseUrl, {
      method: "POST",
      signal: controller.signal,
      headers,
      body: JSON.stringify({
        model: config.model,
        messages: buildGroundedPrompt(input),
        temperature: 0.1,
        max_tokens: 520
      })
    });

    if (!response.ok) {
      const details = await response.text();
      return {
        used: false,
        provider: config.baseUrl,
        model: config.model,
        reason: `LLM request failed with ${response.status}`,
        details: details.slice(0, 240)
      };
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content?.trim();

    if (!content) {
      return {
        used: false,
        provider: config.baseUrl,
        model: config.model,
        reason: "LLM returned an empty response"
      };
    }

    return {
      used: true,
      provider: config.baseUrl,
      model: config.model,
      content
    };
  } catch (error) {
    return {
      used: false,
      provider: config.baseUrl,
      model: config.model,
      reason: error.name === "AbortError" ? "LLM request timed out" : error.message
    };
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  generateGroundedResponse,
  getLlmConfig
};
