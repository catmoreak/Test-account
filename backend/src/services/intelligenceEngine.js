const { gradeEvidence, retrieveRelevantDocs, tokenize } = require("./ragEngine");
const { generateGroundedResponse } = require("./llmClient");

const INTENT_RULES = {
  balance_inquiry: {
    queue: "Member Support",
    phrases: ["balance", "available balance", "current balance", "how much", "funds"],
    terms: ["balance", "available", "current", "funds"]
  },
  transaction_dispute: {
    queue: "Complaints Desk",
    phrases: ["did not make", "didn't make", "do not recognize", "don't recognize", "unknown charge", "dispute", "fraud"],
    terms: ["charge", "transaction", "purchase", "dispute", "fraud", "unrecognized", "overcharged", "unauthorized"]
  },
  loan_status: {
    queue: "Loan Desk",
    phrases: ["loan status", "loan approval", "application status", "haven't heard", "have not heard", "sanction status"],
    terms: ["loan", "application", "approval", "pending", "status", "documents", "sanction"]
  },
  loan_product: {
    queue: "Loan Desk",
    phrases: [
      "education loan",
      "msme loan",
      "business loan",
      "jewel loan",
      "gold loan",
      "surety loan",
      "consumer loan",
      "vehicle loan",
      "mortgage loan",
      "machinery loan",
      "agriculture loan"
    ],
    terms: [
      "education",
      "msme",
      "business",
      "jewel",
      "gold",
      "surety",
      "consumer",
      "vehicle",
      "mortgage",
      "machinery",
      "agriculture",
      "loan",
      "cibil",
      "guarantor",
      "margin"
    ]
  },
  card_block: {
    queue: "ATM Card Desk",
    phrases: ["card blocked", "card is blocked", "failed pin", "failed pins", "reactivate", "unblock", "replacement pin"],
    terms: ["card", "blocked", "declined", "pin", "reactivate", "unblock", "locked", "atm"]
  },
  account_update: {
    queue: "Member Support",
    phrases: ["update address", "change address", "registered address", "recently moved", "phone number", "email", "documents required"],
    terms: ["update", "address", "moved", "residence", "profile", "phone", "email", "documents", "aadhaar", "pan"]
  },
  policy_question: {
    queue: "Member Support",
    phrases: ["early closure", "before maturity", "what is the penalty", "premature closure"],
    terms: ["penalty", "policy", "maturity", "terms", "closure", "premature"]
  },
  unresolved_complaint: {
    queue: "Complaints Desk",
    phrases: ["called twice", "still unresolved", "not resolved", "nothing has been resolved", "for months", "three months"],
    terms: ["complaint", "unresolved", "overcharged", "months", "again", "escalate"]
  },
  service_charge: {
    queue: "Member Support",
    phrases: ["service charge", "service charges", "cheque book charge", "minimum balance charge", "stop payment", "neft charge", "rtgs charge", "atm annual fee"],
    terms: ["charge", "charges", "fee", "fees", "cheque", "statement", "passbook", "neft", "rtgs", "dd", "locker", "atm", "gst"]
  },
  deposit_product: {
    queue: "Deposit Desk",
    phrases: ["open fixed deposit", "open recurring deposit", "open savings account", "savings account", "fd rate", "rd rate", "loan against deposit", "senior citizen", "documents required"],
    terms: ["fixed", "recurring", "deposit", "savings", "saving", "account", "fd", "rd", "sb", "ssb", "installment", "nomination", "senior", "maturity", "documents", "aadhaar", "pan"]
  },
  privacy_question: {
    queue: "Digital Banking",
    phrases: ["pps privacy", "positive pay", "privacy policy", "share my data", "collect my data", "account number masked"],
    terms: ["pps", "privacy", "positive", "pay", "data", "pin", "masked", "security"]
  },
  branch_service: {
    queue: "Branch Services",
    phrases: ["e-stamp", "estamp", "which branch", "locker facility", "nre query", "whatsapp"],
    terms: ["stamp", "branch", "facility", "service", "nre", "whatsapp", "pigmy", "sms"]
  },
  locker_service: {
    queue: "Locker Desk",
    phrases: ["locker rent", "locker key", "lost locker key", "locker operation", "delayed locker rent"],
    terms: ["locker", "rent", "key", "operation", "delayed"]
  }
};

const DISTRESS_TERMS = [
  "angry",
  "frustrated",
  "upset",
  "overcharged",
  "terrible",
  "complaint",
  "urgent",
  "disappointed",
  "unacceptable",
  "again",
  "still",
  "months",
  "twice",
  "not resolved",
  "nothing"
];

const LANGUAGE_LABELS = {
  en: { name: "English", responsePrefix: "Response", escalationPrefix: "Escalation" },
  hi: { name: "Hindi", responsePrefix: "प्रतिक्रिया", escalationPrefix: "एस्केलेशन" },
  kn: { name: "Kannada", responsePrefix: "ಪ್ರತಿಕ್ರಿಯೆ", escalationPrefix: "ಎಸ್ಕಲೇಶನ್" }
};

function scoreIntent(message, history = []) {
  const combined = [...history.slice(-3).map((entry) => entry.message), message].join(" ").toLowerCase();
  const tokens = new Set(tokenize(combined));
  const scores = {};
  const evidence = {};

  Object.entries(INTENT_RULES).forEach(([intent, rule]) => {
    let score = 0;
    const hits = [];

    rule.phrases.forEach((phrase) => {
      if (combined.includes(phrase)) {
        score += 3;
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
  const confidence = topScore === 0 ? 0 : Math.min(0.97, 0.48 + topScore * 0.08 + (topScore - secondScore) * 0.07);

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
  const recentMemberMessages = history
    .filter((entry) => entry.role === "member")
    .slice(-2)
    .map((entry) => entry.message);

  return [
    message,
    ...recentMemberMessages,
    classification.topIntent.replace(/_/g, " "),
    ...(classification.matchedSignals || [])
  ].join(" ");
}

function normalizeLanguage(language) {
  const value = String(language || "en").toLowerCase();
  if (value.startsWith("hi")) return "hi";
  if (value.startsWith("kn") || value.startsWith("ka")) return "kn";
  return "en";
}

function buildEchoResponse({ message, docs, language }) {
  const label = LANGUAGE_LABELS[language] || LANGUAGE_LABELS.en;
  const citations = citeDocs(docs);

  return `${label.responsePrefix}: ${message}\n\nRetrieved policy references: ${citations.join("; ")}`;
}

function buildFocusedEvidence(intent, docs, message) {
  const text = message.toLowerCase();
  const topSnippet = docs[0]?.snippet || docs[0]?.content || "";

  if ((intent === "deposit_product" || intent === "policy_question") && text.includes("456")) {
    return "MCC Bank's 456 days Fixed Deposit rate w.e.f. 02-04-2026 is 7.00%; the 456 days Senior Citizen Fixed Deposit rate w.e.f. 02-04-2026 is 7.50%.";
  }

  if (intent === "deposit_product" && (text.includes("savings") || text.includes("saving") || text.includes("ssb"))) {
    return "MCC Bank Savings Bank Account requires minimum initial deposit of Rs. 1000. Savings interest is 3.00%, and SSB accounts maintaining above Rs. 1,00,000 get 5.00%. Cheque book facility requires minimum balance of Rs. 1000.";
  }

  if ((intent === "deposit_product" || intent === "policy_question") && text.includes("recurring") && text.includes("document")) {
    return "For a Recurring Deposit, MCC Bank requires identity proof and address proof such as Passport, Aadhaar card, Driving Licence, or Voter ID card, plus PAN card and photographs. Aadhaar is mandatory.";
  }

  if (
    (intent === "policy_question" || intent === "deposit_product") &&
    (text.includes("premature") || (text.includes("close") && text.includes("maturity")))
  ) {
    return "For premature Fixed Deposit closure, interest is paid at 1% less than the rate applicable for the period the deposit remained with MCC Bank. The 1% deduction does not apply if premature payment is due to the depositor's death.";
  }

  if (intent === "loan_product" && text.includes("education")) {
    return "MCC Bank Education Loan is for higher studies in India and abroad. Interest rate is 10.50%, maximum repayment tenure is 15 years including moratorium, minimum margin is 15%, minimum CIBIL score is 600, and student with parent is the borrower.";
  }

  if (intent === "loan_product" && text.includes("msme")) {
    return "MCC Bank MSME Business Loan rates are 11.50% for CIBIL 700 and above and 12.00% for 600 to 699. MSME CCL working capital rates are 11.00% for 700 and above and 12.00% for 600 to 699. Tenure is up to 120 months and margin is at least 25% of project cost.";
  }

  if (intent === "loan_product" && (text.includes("jewel") || text.includes("gold"))) {
    return "MCC Bank Jewel Loan ROI is 10.75% per annum. Maximum permissible loan is 75% of the 30 days average market value. Membership is necessary, and minimum CIC score is 600.";
  }

  if (intent === "loan_product" && text.includes("vehicle")) {
    return "MCC Bank Private Vehicle Loan new four-wheeler rates are 10.00% for CIBIL 650 and above and 11.00% for 600 to 649. Two-wheeler rate is 15.00%. Used LMV rates are 11.50% within 2 years and 13.00% for older than 2 years but less than 5 years.";
  }

  if (intent === "loan_product" && text.includes("mortgage")) {
    return "MCC Bank Mortgage Loan rate is 13.50% floating, repayment tenure is up to 10 years, and maximum permissible amount is 60% of property valuation or 75% of estimate, whichever is lower.";
  }

  if (intent === "loan_product" && (text.includes("surety") || text.includes("consumer"))) {
    return "MCC Bank Surety and Consumer Loan rate is 15.00% floating, tenure is up to 36 months, and maximum loan limit is Rs. 1,00,000. Minimum CIBIL score is 600.";
  }

  if (intent === "service_charge" && text.includes("stop")) {
    return "Stop payment against a cheque is Rs 250 per instance for Savings Bank and Rs 500 per instance for Current Account or CCL. Revoking stop payment is Rs 100 per instance for SB/CA/CCL.";
  }

  if (intent === "locker_service") {
    return "Locker rent w.e.f. 01-04-2025 is Rs 1250 for small, Rs 2000 for medium, Rs 3500 for large, and Rs 5000 for extra large lockers. Loss of locker key costs Rs 1500 plus actual break-open charges.";
  }

  if (intent === "branch_service" && (text.includes("e-stamp") || text.includes("estamp") || text.includes("stamp"))) {
    return "e-Stamp facility is available at Founders, Ashoknagar, Kankanady, Kulshekar, Morgansgate, Shirva, Bajpe, Kinnigoli, Surathkal, Udupi, Puttur, B C Road, Karkala, Brahmavara, Belthangady, Belman, Byndoor, and Santhekatte branches.";
  }

  if (intent === "privacy_question" && text.includes("share")) {
    return "MCC Bank says PPS information is not shared with other companies unless required by law or while handling disputes.";
  }

  return topSnippet;
}

function buildGroundedFallbackResponse({ classification, docs, evidenceGrade, decision, message, language }) {
  const label = LANGUAGE_LABELS[language] || LANGUAGE_LABELS.en;
  const citations = citeDocs(docs);
  const evidence = buildFocusedEvidence(classification.topIntent, docs, message);

  if (decision.escalate) {
    return `${label.escalationPrefix}: I am escalating this to a staff specialist. Reason: ${decision.reason}.\n\nRelevant MCC Bank rule: ${evidence}\n\nGrounded in: ${citations.join("; ")}`;
  }

  if (evidenceGrade.label === "weak") {
    return `${label.escalationPrefix}: I found weak policy evidence for this request, so a staff specialist should review it.\n\nGrounded in: ${citations.join("; ")}`;
  }

  return `${label.responsePrefix}: ${evidence}\n\nGrounded in: ${citations.join("; ")}`;
}

function shouldEscalate({ classification, sentiment, evidenceGrade, message }) {
  const text = message.toLowerCase();
  const explicitEscalation = ["manager", "agent", "human", "escalate", "complaint"].some((word) => text.includes(word));
  const needsAuthenticatedBankSystem = ["balance_inquiry", "transaction_dispute", "loan_status", "card_block"].includes(
    classification.topIntent
  );

  if (classification.topIntent === "unresolved_complaint") {
    return { escalate: true, reason: "Repeated or unresolved complaint requires Tier-2 ownership" };
  }

  if (needsAuthenticatedBankSystem) {
    return { escalate: true, reason: "This request needs account verification or a bank core-system action" };
  }

  if (sentiment.label === "distressed") {
    return { escalate: true, reason: "Distressed member sentiment detected" };
  }

  if (explicitEscalation && sentiment.label !== "neutral") {
    return { escalate: true, reason: "Member requested human help with elevated concern" };
  }

  if (classification.confidence < 0.48) {
    return { escalate: true, reason: "Intent confidence is below resolution threshold" };
  }

  if (evidenceGrade.label === "weak") {
    return { escalate: true, reason: "Knowledge base evidence is too weak for automatic resolution" };
  }

  return { escalate: false, reason: "Intent and policy evidence are sufficient for guided self-service" };
}

function citeDocs(docs) {
  const topScore = docs[0]?.score || 0;
  const citationThreshold = Math.max(1.8, topScore * 0.45);
  const citations = docs.filter((doc) => doc.score >= citationThreshold).slice(0, 2);
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
        snippet: doc.snippet
      })),
      requestedOutcome: "Review the member issue, apply the cited policy, and follow up without asking the member to repeat context.",
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
  const docs = retrieveRelevantDocs(retrievalQuery, { intent: classification.topIntent, topK: 4 });
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
      { step: "intake_normalization", output: "Member message and recent history normalized" },
      { step: "intent_classification", output: classification.topIntent, confidence: classification.confidence },
      { step: "query_planning", output: retrievalQuery },
      { step: "knowledge_retrieval", output: docs.slice(0, 3).map((doc) => doc.id) },
      { step: "evidence_grading", output: evidenceGrade.label },
      {
        step: "grounded_generation",
        output: llmResult.used ? "used" : "fallback",
        model: llmResult.model,
        reason: llmResult.reason
      },
      { step: "resolution_or_escalation", output: decision.escalate ? "escalated" : "auto-resolved", reason: decision.reason }
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
  LANGUAGE_LABELS
};
