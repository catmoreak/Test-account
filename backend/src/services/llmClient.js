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

  const apiKey = process.env.MISTRAL_API_KEY || process.env.OPENROUTER_API_KEY || "";
  const usesOpenRouter = apiKey.startsWith("sk-or-") || process.env.LLM_PROVIDER === "openrouter";
  const baseUrl =
    process.env.MISTRAL_API_BASE ||
    (usesOpenRouter ? "https://openrouter.ai/api/v1/chat/completions" : "https://api.mistral.ai/v1/chat/completions");
  const model =
    process.env.MISTRAL_MODEL || (usesOpenRouter ? "mistralai/mistral-small-3.2-24b-instruct" : "mistral-small-latest");

  return {
    apiKey,
    baseUrl,
    model,
    enabled: Boolean(apiKey)
  };
}

function buildGroundedPrompt({ message, classification, docs, evidenceGrade, decision, fallbackAnswer }) {
  const policyContext = docs
    .slice(0, 4)
    .map(
      (doc) =>
        `[${doc.id}] ${doc.title}\nCategory: ${doc.category}\nRelevant text: ${doc.snippet || doc.content}\nFull policy: ${doc.content}`
    )
    .join("\n\n");

  return [
    {
      role: "system",
      content:
        "You are CreditAssist AI for The Mangalore Catholic Co-operative Bank Ltd. Answer only from the provided MCC Bank knowledge context. Do not invent rates, charges, timelines, eligibility rules, or contact details. If the case needs staff action, say it is being escalated and summarize why. Keep the answer concise, member-friendly, and include cited MCC document IDs."
    },
    {
      role: "user",
      content: `Member message:
${message}

Pipeline decision:
- Intent: ${classification.topIntent}
- Confidence: ${classification.confidence}
- Evidence grade: ${evidenceGrade.label}
- Action: ${decision.escalate ? "escalate" : "auto-resolve"}
- Decision reason: ${decision.reason}

Retrieved MCC Bank knowledge:
${policyContext}

Deterministic fallback answer:
${fallbackAnswer}

Draft the final member response.`
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
  const timeout = setTimeout(() => controller.abort(), Number(process.env.MISTRAL_TIMEOUT_MS || 12000));

  try {
    const response = await fetch(config.baseUrl, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
        "HTTP-Referer": process.env.APP_PUBLIC_URL || "http://localhost:5173",
        "X-Title": "CreditAssist AI"
      },
      body: JSON.stringify({
        model: config.model,
        messages: buildGroundedPrompt(input),
        temperature: 0.15,
        max_tokens: 420
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
