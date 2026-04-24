const express = require("express");
const { v4: uuidv4 } = require("uuid");
const multer = require("multer");
const { processMemberMessageWithLanguage } = require("../services/intelligenceEngine");
const { createCase } = require("../services/caseStore");
const { getAccountContext } = require("../services/authService");
const { translateWithSarvam } = require("../services/sarvamClient");
const { transcribeWithSarvam } = require("../services/speechToTextClient");
const { synthesizeWithSarvam } = require("../services/textToSpeechClient");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// Detect if the message is asking about account-specific data (balance, transactions, card status, loan)
function detectAccountQuery(message) {
  const text = message.toLowerCase();
  if (/\bbalance\b|how much.*account|available.*funds|account.*balance/.test(text)) return "balance";
  if (/transaction|statement|history|recent.*payment|last.*transaction/.test(text)) return "transactions";
  if (/loan.*status|application.*status|loan.*approved|loan.*pending/.test(text)) return "loan_status";
  if (/card.*status|card.*blocked|debit.*card|atm.*card.*status/.test(text)) return "card_status";
  return null;
}

function buildAccountResponse(queryType, ctx, language = "en") {
  const fmt = (n) => `₹${Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;

  if (queryType === "balance") {
    const txSummary = ctx.recentTransactions.slice(0, 2)
      .map((t) => `• ${t.date}: ${t.desc} (${t.type === "credit" ? "+" : ""}${fmt(t.amount)})`)
      .join("\n");
    return `Your current account balance is **${fmt(ctx.balance)}**.\n\nSavings balance: ${fmt(ctx.savingsBalance)}\nFD balance: ${fmt(ctx.fdBalance)}\n\nRecent transactions:\n${txSummary}`;
  }

  if (queryType === "transactions") {
    const list = ctx.recentTransactions
      .map((t) => `• ${t.date}: ${t.desc} — ${t.type === "credit" ? "+" : ""}${fmt(t.amount)} (${t.type})`)
      .join("\n");
    return `Here are your recent transactions:\n\n${list}`;
  }

  if (queryType === "loan_status") {
    if (ctx.loanStatus === "none") return "You currently have no active or pending loan applications with MCC Bank.";
    if (ctx.loanStatus === "pending") return `Your **${ctx.loanProduct}** application (₹${fmt(ctx.loanBalance)}) is currently **under review**. Our Loan Desk will contact you within 2 business days. Please keep your documents ready.`;
    if (ctx.loanStatus === "active") return `Your **${ctx.loanProduct}** is active with an outstanding balance of **${fmt(ctx.loanBalance)}**. Please contact our Loan Desk for repayment schedule details.`;
    return "Please visit your nearest MCC Bank branch for loan status details.";
  }

  if (queryType === "card_status") {
    if (ctx.cardStatus === "active") return "Your debit/ATM card is **active** and ready to use.";
    if (ctx.cardStatus === "blocked") return "Your debit/ATM card is currently **blocked**. Please visit the nearest branch or contact our ATM Card Desk to reactivate it. Bring a valid photo ID.";
    return "Your card status could not be determined. Please contact Member Support.";
  }

  return null;
}

// POST /api/member/message
router.post("/message", async (req, res) => {
  const { memberId = "anonymous", message, history = [], language = "en", userId } = req.body;

  if (!message || typeof message !== "string") {
    return res.status(400).json({ error: "message is required" });
  }

  // --- Account context shortcut ---
  let accountReply = null;
  if (userId) {
    const ctx = getAccountContext(userId);
    if (ctx) {
      const queryType = detectAccountQuery(message);
      if (queryType) {
        accountReply = buildAccountResponse(queryType, ctx, language);
      }
    }
  }

  // If we resolved it from account context, skip the AI pipeline for this query
  if (accountReply) {
    // Translate if needed
    let finalReply = accountReply;
    if (language !== "en") {
      const { translated, used } = await translateWithSarvam(accountReply, language, "en");
      if (used) finalReply = translated;
    }

    const caseRecord = await createCase({
      id: `CASE-${uuidv4().split("-")[0].toUpperCase()}`,
      memberId: userId || memberId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      language,
      status: "auto-resolved",
      conversation: [...history, { role: "member", message }, { role: "assistant", message: finalReply }],
      contextSummary: {
        language,
        topIntent: "balance_inquiry",
        confidence: 0.99,
        sentiment: { label: "neutral", probability: 0 },
        evidenceGrade: { label: "strong", topScore: 1 },
        agenticPipeline: [
          { step: "account_context_resolution", output: "auto-resolved", status: "done" }
        ],
        citedKnowledge: [],
        sarvamTranslated: language !== "en"
      },
      escalationPacket: null
    });

    return res.json({ reply: finalReply, case: caseRecord });
  }

  // --- Standard AI pipeline ---
  const analysis = await processMemberMessageWithLanguage(message, history, language);

  let responseMessage = analysis.responseMessage;

  // Apply Sarvam translation to AI response if needed
  if (language !== "en") {
    const { translated, used } = await translateWithSarvam(responseMessage, language, "en");
    if (used) responseMessage = translated;
  }

  const caseRecord = await createCase({
    id: `CASE-${uuidv4().split("-")[0].toUpperCase()}`,
    memberId: userId || memberId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    language: analysis.contextSummary.language,
    status: analysis.autoResolved ? "auto-resolved" : "needs-attention",
    conversation: [...history, { role: "member", message }, { role: "assistant", message: responseMessage }],
    contextSummary: {
      ...analysis.contextSummary,
      sarvamTranslated: language !== "en"
    },
    escalationPacket: analysis.escalationPacket
  });

  return res.json({
    reply: responseMessage,
    case: caseRecord
  });
});

router.post("/voice-to-text", upload.single("file"), async (req, res) => {
  if (!req.file?.buffer) {
    return res.status(400).json({ error: "audio file is required" });
  }

  try {
    const language = req.body.language || "en";
    const transcription = await transcribeWithSarvam(req.file.buffer, language, req.file.mimetype);

    if (!transcription.used) {
      return res.status(502).json({ error: transcription.error || "Speech transcription failed" });
    }

    return res.json({
      transcript: transcription.transcript,
      languageCode: transcription.languageCode,
      requestId: transcription.requestId
    });
  } catch (error) {
    return res.status(502).json({ error: error.message || "Speech transcription failed" });
  }
});

router.post("/text-to-speech", async (req, res) => {
  const { text, language = "en" } = req.body || {};

  if (!text || typeof text !== "string") {
    return res.status(400).json({ error: "text is required" });
  }

  try {
    const speech = await synthesizeWithSarvam(text, language);

    if (!speech.used) {
      return res.status(502).json({ error: speech.error || "Text-to-speech failed" });
    }

    return res.json({
      audioBase64: speech.audioBase64,
      mimeType: speech.mimeType,
      requestId: speech.requestId || null
    });
  } catch (error) {
    return res.status(502).json({ error: error.message || "Text-to-speech failed" });
  }
});

module.exports = router;
