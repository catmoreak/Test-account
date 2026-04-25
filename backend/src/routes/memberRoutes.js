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
  const isSubmission = text.includes("reason:") || /\d{4}-\d{2}-\d{2}/.test(text);
  
  // If it's a submission (dispute detail), ALWAYS skip the shortcut logic 
  // and let it go to the full AI/RAG pipeline for proper escalation.
  if (isSubmission) return null;

  // Account balance shortcut
  if (/\bbalance\b|how much.*account|available.*funds|account.*balance/.test(text)) return "balance";
  
  // Transaction dispute UI shortcut (initial request only)
  const isDisputeFlag = /\bdispute\b|recognize|fraud|unauthorized|unknown charge/.test(text);
  if (isDisputeFlag && text.length < 80) return "dispute";
  
  // Transaction history shortcut
  if (/transaction|statement|history|recent.*payment|last.*transaction/.test(text)) return "transactions";
  
  // Status shortcuts
  if (/loan.*status|application.*status|loan.*approved|loan.*pending/.test(text)) return "loan_status";
  if (/card.*status|card.*blocked|debit.*card|atm.*card.*status/.test(text)) return "card_status";
  return null;
}

function buildAccountResponse(queryType, ctx, language = "en") {
  const fmt = (n) => `₹${Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;

  if (queryType === "balance") {
    const totalAcrossAccounts = Number(ctx.balance || 0) + Number(ctx.savingsBalance || 0) + Number(ctx.fdBalance || 0);
    const txSummary = ctx.recentTransactions.slice(0, 2)
      .map((t) => `• ${t.date}: ${t.desc} (${t.type === "credit" ? "+" : ""}${fmt(t.amount)})`)
      .join("\n");
    return {
      reply: `Here is your account snapshot:\n\n• Current account (spendable): ${fmt(ctx.balance)}\n• Savings account: ${fmt(ctx.savingsBalance)}\n• Fixed deposit (FD): ${fmt(ctx.fdBalance)}\n• Total across shown accounts: ${fmt(totalAcrossAccounts)}\n\nNote: Current account balance is separate from savings and FD balances.\n\nRecent transactions (latest 2):\n${txSummary}`
    };
  }

  if (queryType === "dispute") {
    return {
      reply: "Please select the transaction you wish to dispute from your recent history:",
      ui: {
        type: "transaction_dispute",
        transactions: ctx.recentTransactions
      }
    };
  }

  if (queryType === "transactions") {
    const list = ctx.recentTransactions
      .map((t) => `• ${t.date}: ${t.desc} — ${t.type === "credit" ? "+" : ""}${fmt(t.amount)} (${t.type})`)
      .join("\n");
    return {
      reply: `Here are your recent transactions:\n\n${list}`
    };
  }

  if (queryType === "loan_status") {
    let msg = "";
    if (ctx.loanStatus === "none") msg = "You currently have no active or pending loan applications with MCC Bank.";
    else if (ctx.loanStatus === "pending") msg = `Your **${ctx.loanProduct}** application (₹${fmt(ctx.loanBalance)}) is currently **under review**. Our Loan Desk will contact you within 2 business days. Please keep your documents ready.`;
    else if (ctx.loanStatus === "active") msg = `Your **${ctx.loanProduct}** is active with an outstanding balance of **${fmt(ctx.loanBalance)}**. Please contact our Loan Desk for repayment schedule details.`;
    else msg = "Please visit your nearest MCC Bank branch for loan status details.";
    return { reply: msg };
  }

  if (queryType === "card_status") {
    let msg = "";
    if (ctx.cardStatus === "active") msg = "Your debit/ATM card is **active** and ready to use.";
    else if (ctx.cardStatus === "blocked") msg = "Your debit/ATM card is currently **blocked**. Please visit the nearest branch or contact our ATM Card Desk to reactivate it. Bring a valid photo ID.";
    else msg = "Your card status could not be determined. Please contact Member Support.";
    return { reply: msg };
  }

  return null;
}

async function normalizeMessageForAnalysis(message, language = "en") {
  if (language === "en") {
    return message;
  }

  const translated = await translateWithSarvam(message, "en", language);
  return translated.used && translated.translated ? translated.translated : message;
}

// POST /api/member/message
router.post("/message", async (req, res) => {
  const { memberId = "anonymous", message, history = [], language = "en", userId } = req.body;

  if (!message || typeof message !== "string") {
    return res.status(400).json({ error: "message is required" });
  }

  const normalizedMessage = await normalizeMessageForAnalysis(message, language);

  // --- Account context shortcut ---
  let accountResult = null;
  if (userId) {
    const ctx = getAccountContext(userId);
    if (ctx) {
      const queryType = detectAccountQuery(normalizedMessage);
      if (queryType) {
        accountResult = buildAccountResponse(queryType, ctx, language);
      }
    }
  }

  // If we resolved it from account context, skip the AI pipeline for this query
  if (accountResult) {
    let finalReply = accountResult.reply;
    let finalUi = accountResult.ui;

    if (language !== "en") {
      // Translate the text reply
      const translation = await translateWithSarvam(accountResult.reply, language, "en");
      if (translation.used) finalReply = translation.translated;

      // Translate transaction descriptions if present
      if (finalUi?.type === "transaction_dispute" && finalUi.transactions) {
        const translatedTxs = await Promise.all(finalUi.transactions.map(async (tx) => {
          const txTrans = await translateWithSarvam(tx.desc, language, "en");
          return { ...tx, desc: txTrans.used ? txTrans.translated : tx.desc };
        }));
        finalUi = { ...finalUi, transactions: translatedTxs };
      }
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
        topIntent: finalUi?.type === "transaction_dispute" ? "transaction_dispute" : "balance_inquiry",
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

    return res.json({ reply: finalReply, ui: finalUi, case: caseRecord });
  }

  // --- Standard AI pipeline ---
  const analysis = await processMemberMessageWithLanguage(normalizedMessage, history, language);

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
