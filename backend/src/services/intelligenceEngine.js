const { gradeEvidence, retrieveRelevantDocs, tokenize } = require("./ragEngine");
const { generateGroundedResponse } = require("./llmClient");
const { validateEvidenceQuality, extractAndValidateCitations, scoreTrustworthiness } = require("./ragConfig");

const INTENT_RULES = {
  balance_inquiry: {
    queue: "Member Support",
    phrases: ["balance", "available balance", "current balance", "how much", "funds", "account balance"],
    terms: ["balance", "available", "current", "funds"]
  },
  transaction_dispute: {
    queue: "Complaints Desk",
    phrases: ["did not make", "didn't make", "do not recognize", "don't recognize", "unknown charge", "dispute", "fraud", "unauthorized transaction"],
    terms: ["charge", "transaction", "purchase", "dispute", "fraud", "unrecognized", "overcharged", "unauthorized"]
  },
  loan_status: {
    queue: "Loan Desk",
    phrases: ["loan status", "loan approval", "application status", "haven't heard", "have not heard", "sanction status", "loan pending"],
    terms: ["loan", "application", "approval", "pending", "status", "documents", "sanction"]
  },
  loan_product: {
    queue: "Loan Desk",
    phrases: [
      "education loan", "msme loan", "business loan", "jewel loan", "gold loan",
      "surety loan", "consumer loan", "vehicle loan", "mortgage loan", "machinery loan",
      "agriculture loan", "two wheeler loan", "four wheeler loan", "boat loan"
    ],
    terms: [
      "education", "msme", "business", "jewel", "gold", "surety",
      "consumer", "vehicle", "mortgage", "machinery", "agriculture",
      "loan", "cibil", "guarantor", "margin", "rate", "interest"
    ]
  },
  account_block: {
    queue: "Member Support",
    phrases: [
      "block account", "block my account", "freeze account", "lock account",
      "account blocked", "account locked", "suspend account", "deactivate account",
      "how can i block", "how do i block", "want to block my", "stop my account"
    ],
    terms: ["block", "freeze", "lock", "suspend", "deactivate", "dormant", "flagged", "restricted"]
  },
  card_block: {
    queue: "ATM Card Desk",
    phrases: [
      "card blocked", "card is blocked", "failed pin", "failed pins", "reactivate",
      "unblock card", "replacement pin", "block my card", "block debit card", "atm card blocked",
      "lost my card", "stolen card"
    ],
    terms: ["card", "blocked", "declined", "pin", "reactivate", "unblock", "locked", "atm", "debit"]
  },
  account_update: {
    queue: "Member Support",
    phrases: ["update address", "change address", "registered address", "recently moved", "phone number", "email", "documents required", "kyc update"],
    terms: ["update", "address", "moved", "residence", "profile", "phone", "email", "documents", "aadhaar", "pan", "kyc"]
  },
  policy_question: {
    queue: "Member Support",
    phrases: ["early closure", "before maturity", "what is the penalty", "premature closure", "456 days", "fd rate", "rd rate"],
    terms: ["penalty", "policy", "maturity", "terms", "closure", "premature", "rate", "interest", "days"]
  },
  unresolved_complaint: {
    queue: "Complaints Desk",
    phrases: ["called twice", "still unresolved", "not resolved", "nothing has been resolved", "for months", "three months", "no one helping"],
    terms: ["complaint", "unresolved", "overcharged", "months", "again", "escalate", "unacceptable", "frustrated"]
  },
  service_charge: {
    queue: "Member Support",
    phrases: [
      "service charge", "service charges", "cheque book charge", "minimum balance charge",
      "stop payment", "neft charge", "rtgs charge", "atm annual fee", "how much charge",
      "what is the fee", "what are the charges", "locker rent", "dd charge"
    ],
    terms: ["charge", "charges", "fee", "fees", "cheque", "statement", "passbook", "neft", "rtgs", "dd", "locker", "atm", "gst", "fine", "penalty"]
  },
  deposit_product: {
    queue: "Deposit Desk",
    phrases: [
      "open fixed deposit", "open recurring deposit", "open savings account", "savings account",
      "fd rate", "rd rate", "loan against deposit", "senior citizen", "documents required",
      "456 days", "interest rate on deposit", "savings interest"
    ],
    terms: ["fixed", "recurring", "deposit", "savings", "saving", "account", "fd", "rd", "sb", "ssb", "installment", "nomination", "senior", "maturity", "documents", "aadhaar", "pan"]
  },
  privacy_question: {
    queue: "Digital Banking",
    phrases: ["pps privacy", "positive pay", "privacy policy", "share my data", "collect my data", "account number masked", "data security"],
    terms: ["pps", "privacy", "positive", "pay", "data", "pin", "masked", "security", "policy"]
  },
  branch_service: {
    queue: "Branch Services",
    phrases: ["e-stamp", "estamp", "which branch", "locker facility", "nre query", "whatsapp", "pigmy deposit", "kiosk passbook", "h2h neft"],
    terms: ["stamp", "branch", "facility", "service", "nre", "whatsapp", "pigmy", "sms", "kiosk", "host"]
  },
  locker_service: {
    queue: "Locker Desk",
    phrases: ["locker rent", "locker key", "lost locker key", "locker operation", "delayed locker rent", "break open locker"],
    terms: ["locker", "rent", "key", "operation", "delayed", "break", "open"]
  }
};

const DISTRESS_TERMS = [
  "angry", "frustrated", "upset", "overcharged", "terrible", "complaint",
  "urgent", "disappointed", "unacceptable", "again", "still", "months",
  "twice", "not resolved", "nothing", "escalate", "ridiculous", "horrible"
];

const LANGUAGE_LABELS = {
  en: { name: "English", responsePrefix: "Response", escalationPrefix: "Escalation" },
  hi: { name: "Hindi", responsePrefix: "प्रतिक्रिया", escalationPrefix: "एस्केलेशन" },
  kn: { name: "Kannada", responsePrefix: "ಪ್ರತಿಕ್ರಿಯೆ", escalationPrefix: "ಎಸ್ಕಲೇಶನ್" },
  ta: { name: "Tamil", responsePrefix: "பதில்", escalationPrefix: "மேலதிக விசாரணைக்கு" }
};

function scoreIntent(message, history = []) {
  const combined = message.toLowerCase();
  const tokens = new Set(tokenize(combined));
  const scores = {};
  const evidence = {};

  Object.entries(INTENT_RULES).forEach(([intent, rule]) => {
    let score = 0;
    const hits = [];

    rule.phrases.forEach((phrase) => {
      if (combined.includes(phrase)) {
        score += 4; // strong phrase match
        hits.push(phrase);
      }
    });

    rule.terms.forEach((term) => {
      if (tokens.has(term)) {
        score += 1;
        hits.push(term);
      }
    });

    scores[intent] = score;
    evidence[intent] = [...new Set(hits)];
  });

  return { scores, evidence };
}

function toProbabilities(scores) {
  const entries = Object.entries(scores);
  const max = Math.max(...entries.map(([, value]) => value));
  const temperature = 0.55;
  let sum = 0;

  const expScores = entries.map(([intent, value]) => {
    const exp = Math.exp((value - max) * temperature);
    sum += exp;
    return [intent, exp];
  });

  return Object.fromEntries(expScores.map(([intent, value]) => [intent, Number((value / sum).toFixed(4))]));
}

function classifyIntent(message, history) {
  const { scores, evidence } = scoreIntent(message, history);
  const probabilities = toProbabilities(scores);
  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [topIntent, topScore] = ranked[0];
  const secondScore = ranked[1]?.[1] || 0;
  const confidence = topScore === 0 ? 0 : Math.min(0.97, 0.48 + topScore * 0.07 + (topScore - secondScore) * 0.06);

  return {
    topIntent,
    confidence: Number(confidence.toFixed(3)),
    scores,
    probabilities,
    matchedSignals: evidence[topIntent] || []
  };
}

function detectSentiment(message, history = []) {
  const combined = [...history.slice(-2).map((entry) => entry.message), message].join(" ").toLowerCase();
  const hits = DISTRESS_TERMS.filter((word) => combined.includes(word));
  const score = Math.min(1, hits.length / 4);

  return {
    label: score >= 0.5 ? "distressed" : score >= 0.25 ? "concerned" : "neutral",
    probability: Number(score.toFixed(3)),
    signals: hits
  };
}

function planRetrievalQuery(message, history, classification) {
  // Build a rich query including the intent and matched signals for better semantic retrieval
  const intentPhrase = classification.topIntent.replace(/_/g, " ");
  const signals = (classification.matchedSignals || []).slice(0, 4).join(" ");

  return [message, intentPhrase, signals].join(" ").trim();
}

function normalizeLanguage(language) {
  const value = String(language || "en").toLowerCase();
  if (value.startsWith("hi")) return "hi";
  if (value.startsWith("kn") || value.startsWith("ka")) return "kn";
  if (value.startsWith("ta")) return "ta";
  return "en";
}

function buildGroundedFallbackResponse({ classification, docs, evidenceGrade, decision, message, language }) {
  const label = LANGUAGE_LABELS[language] || LANGUAGE_LABELS.en;
  const topDoc = docs[0];
  const intent = classification.topIntent;
  const queue = INTENT_RULES[intent]?.queue || "Member Support";

  if (decision.escalate) {
    const reason = decision.reason;
    // Only include a policy snippet if the evidence is strong enough to be relevant
    const snippet = (topDoc?.score >= 0.75 && topDoc?.snippet)
      ? `\n\nFor context, here is a relevant MCC Bank policy [${topDoc.id}]: ${topDoc.snippet.substring(0, 200)}...`
      : "";
    return `${label.escalationPrefix}: Your request is being escalated to our ${queue} team. ${reason}.${snippet}\n\nA specialist will follow up with you shortly. Please keep your Member ID ready.`;
  }

  if (evidenceGrade.label === "weak" || !topDoc) {
    return `${label.responsePrefix}: Based on available MCC Bank policies — I found limited direct guidance on your specific query. Here's what I can share: For comprehensive support on this topic, please visit your nearest branch or use our mobile app for additional resources.\n\nQueue: ${queue}`;
  }

  const snippet = topDoc.snippet || topDoc.content?.substring(0, 300) || "";
  return `${label.responsePrefix}: Based on MCC Bank policy [${topDoc.id}] — ${snippet}\n\nGrounded in: ${docs.slice(0, 2).map(d => `${d.id}: ${d.title}`).join("; ")}`;
}

function shouldEscalate({ classification, sentiment, evidenceGrade, message }) {
  const text = message.toLowerCase();
  const intent = classification.topIntent;

  // Check evidence quality first (NEW: stricter validation)
  const evidenceValidation = validateEvidenceQuality(evidenceGrade, [], intent);
  if (!evidenceValidation.canAnswer) {
    return { 
      escalate: true, 
      reason: `Evidence quality insufficient (${evidenceGrade.label}): ${evidenceValidation.reason}` 
    };
  }

  // Explicit requests for human help
  const explicitEscalation = ["manager", "agent", "human", "escalate", "complaint", "speak to someone"].some((word) => text.includes(word));

  // Fraud and unauthorized transactions require escalation (account verification + investigation)
  if (intent === "transaction_dispute") {
    return { escalate: true, reason: "Transaction disputes require verification and investigation by our Complaints Desk" };
  }

  // Repeated or unresolved complaints require priority escalation
  if (intent === "unresolved_complaint") {
    return { escalate: true, reason: "Repeated or unresolved complaint requires Tier-2 ownership by our Complaints Desk" };
  }

  // Distressed member sentiment → priority escalation
  if (sentiment.label === "distressed") {
    return { escalate: true, reason: "Distressed member sentiment detected — priority escalation" };
  }

  // Explicit request for human assistance
  if (explicitEscalation) {
    return { escalate: true, reason: "Member explicitly requested human assistance" };
  }

  // Very low intent confidence → safety escalation
  if (classification.confidence < 0.42) {
    return { escalate: true, reason: "Intent confidence below resolution threshold — safety escalation" };
  }

  // All other intents can be auto-resolved with best available information
  return { escalate: false, reason: "Intent and policy evidence are sufficient for guided self-service" };
}

function citeDocs(docs) {
  const topScore = docs[0]?.score || 0;
  const citationThreshold = Math.max(0.70, topScore * 0.88);
  const citations = docs.filter((doc) => doc.score >= citationThreshold).slice(0, 3);
  return (citations.length ? citations : docs.slice(0, 1)).map((doc) => `${doc.id}: ${doc.title}`);
}

function buildEscalationPacket({ classification, sentiment, docs, reason, message, history }) {
  const priority = sentiment.label === "distressed" || classification.topIntent === "unresolved_complaint" ? "P1" : "P2";
  const queue = INTENT_RULES[classification.topIntent]?.queue || "Member Support";
  const recentConversation = [...history.slice(-4), { role: "member", message }];

  return {
    reason,
    priority,
    recommendedQueue: queue,
    structuredSummary: {
      issueType: classification.topIntent,
      memberEmotion: sentiment.label,
      memberAsk: message,
      matchedIntentSignals: classification.matchedSignals,
      keyPolicyReferences: docs.map((doc) => doc.id),
      evidenceSnippets: docs.slice(0, 3).map((doc) => ({
        id: doc.id,
        title: doc.title,
        snippet: doc.snippet || doc.content?.substring(0, 200),
        vectorScore: doc.score
      })),
      requestedOutcome: "Review the member issue, verify identity, take the required action, and follow up without asking the member to repeat context.",
      recentConversation
    }
  };
}

async function processMemberMessage(message, history = []) {
  return processMemberMessageWithLanguage(message, history, "en");
}

async function processMemberMessageWithLanguage(message, history = [], language = "en") {
  const uiLanguage = normalizeLanguage(language);
  const classification = classifyIntent(message, history);
  const retrievalQuery = planRetrievalQuery(message, history, classification);
  const docs = await retrieveRelevantDocs(retrievalQuery, { intent: classification.topIntent, topK: 4 });
  const evidenceGrade = gradeEvidence(docs);
  const sentiment = detectSentiment(message, history);
  const decision = shouldEscalate({ classification, sentiment, evidenceGrade, message });

  const llmResult = await generateGroundedResponse({
    message,
    classification,
    docs,
    evidenceGrade,
    decision,
    language: uiLanguage,
    fallbackAnswer: buildGroundedFallbackResponse({ classification, docs, evidenceGrade, decision, message, language: uiLanguage })
  });

  const responseMessage = llmResult.used
    ? llmResult.content
    : buildGroundedFallbackResponse({ classification, docs, evidenceGrade, decision, message, language: uiLanguage });

  const contextSummary = {
    language: uiLanguage,
    topIntent: classification.topIntent,
    intentProbabilities: classification.probabilities,
    intentScores: classification.scores,
    confidence: classification.confidence,
    sentiment,
    evidenceGrade,
    citedKnowledge: docs.map((doc) => ({
      id: doc.id,
      title: doc.title,
      category: doc.category,
      score: doc.score,
      snippet: doc.snippet,
      retrievalSignals: doc.retrievalSignals
    })),
    agenticPipeline: [
      { step: "intake_normalization", output: "Member message and recent history normalized", status: "done" },
      { step: "intent_classification", output: classification.topIntent, confidence: classification.confidence, signals: classification.matchedSignals, status: "done" },
      { step: "query_planning", output: retrievalQuery, status: "done" },
      { step: "semantic_retrieval", output: docs.slice(0, 3).map((doc) => `${doc.id} (score: ${doc.score})`), model: "mistral-embed", status: "done" },
      { step: "evidence_grading", output: evidenceGrade.label, topScore: evidenceGrade.topScore, status: "done" },
      {
        step: "grounded_generation",
        output: llmResult.used ? "LLM grounded response" : "fallback rule-based response",
        model: llmResult.model || "fallback",
        reason: llmResult.reason,
        status: "done"
      },
      { step: "resolution_or_escalation", output: decision.escalate ? "escalated" : "auto-resolved", reason: decision.reason, status: "done" }
    ],
    conversationHighlights: [...history.slice(-4), { role: "member", message }]
  };

  return {
    responseMessage,
    autoResolved: !decision.escalate,
    contextSummary,
    escalationPacket: decision.escalate
      ? buildEscalationPacket({
          classification,
          sentiment,
          docs,
          reason: decision.reason,
          message,
          history
        })
      : null
  };
}

module.exports = {
  processMemberMessage,
  processMemberMessageWithLanguage,
  normalizeLanguage,
  LANGUAGE_LABELS,
  INTENT_RULES
};
