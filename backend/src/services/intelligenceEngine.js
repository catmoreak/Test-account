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
    phrases: ["open fixed deposit", "open recurring deposit", "fd rate", "rd rate", "loan against deposit", "senior citizen", "documents required"],
    terms: ["fixed", "recurring", "deposit", "fd", "rd", "installment", "nomination", "senior", "maturity", "documents", "aadhaar", "pan"]
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

const RESOLUTION_PLAYBOOK = {
  balance_inquiry: {
    action: "identity_verification",
    template:
      "I cannot display an account balance in this demo. MCC Bank does provide SMS alerts for transactions and branch-assisted service, so a staff member should verify identity before sharing account-specific balance information."
  },
  transaction_dispute: {
    action: "escalate_complaint",
    template:
      "MCC Bank's PPS privacy policy says customer information is not shared with other companies unless required by law or while handling disputes. For an unrecognised transaction, this should be escalated through the complaint contacts so staff can verify account and transaction details."
  },
  loan_status: {
    action: "loan_staff_review",
    template:
      "The MCC Bank knowledge base provided here has loan service charges and sanction-related fees, but it does not include a live loan-status lookup or standard approval timeline. A loan desk staff member should review the application reference."
  },
  card_block: {
    action: "atm_card_staff_review",
    template:
      "The MCC Bank service-charge document lists ATM card annual, additional card, replacement card, and replacement PIN fees, but it does not provide a self-service unblock rule. A staff member should verify the cardholder before reactivation or PIN replacement."
  },
  account_update: {
    action: "collect_documents",
    template:
      "For deposit account opening, MCC Bank requires identity proof and address proof such as Passport, Aadhaar card, Driving Licence, or Voter ID card, plus PAN card and photographs. Aadhaar is mandatory. For address changes, staff should verify the current document requirement before updating records."
  },
  policy_question: {
    action: "answer_policy",
    template:
      "For MCC Bank Fixed Deposit premature closure, interest is paid at 1% less than the rate applicable for the period the deposit remained with the bank. If the depositor has died, this 1% deduction is not applicable for premature payment."
  },
  service_charge: {
    action: "answer_service_charge",
    template:
      "MCC Bank service charges are governed by the service-charge schedule. GST is collected in addition to applicable service charges, and the schedule notes the present GST rate as 18%."
  },
  deposit_product: {
    action: "answer_deposit_product",
    template:
      "MCC Bank offers Fixed Deposit and Recurring Deposit products with minimum opening or instalment amounts of Rs. 100, nomination facility, mandatory Aadhaar for account opening, and loan against deposit or RD up to 85% where applicable."
  },
  privacy_question: {
    action: "answer_privacy",
    template:
      "MCC Bank's PPS application may collect registration, account, contact, transaction, and PPS usage information. It does not collect extra mobile-device information through cookies, and it does not share information with other companies unless required by law or for dispute handling."
  },
  branch_service: {
    action: "answer_branch_service",
    template:
      "MCC Bank provides services such as e-Stamp at selected branches, locker facility at all branches, any branch banking, Pigmy deposit at doorstep, SMS alerts, H2H NEFT/RTGS, and NRE WhatsApp support."
  },
  locker_service: {
    action: "answer_locker_service",
    template:
      "MCC Bank locker rent depends on locker size. The service-charge schedule also defines charges for lost locker key, operations beyond 12 per year, and delayed annual locker-rent payment."
  }
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

function buildFocusedEvidence(intent, docs, message) {
  const text = message.toLowerCase();

  if ((intent === "deposit_product" || intent === "policy_question") && text.includes("456")) {
    return "MCC Bank's 456 days Fixed Deposit rate w.e.f. 02-04-2026 is 7.00%; the 456 days Senior Citizen Fixed Deposit rate w.e.f. 02-04-2026 is 7.50%.";
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

  return docs[0]?.snippet || "";
}

function buildResolution(intent, docs, evidenceGrade, message) {
  const playbook = RESOLUTION_PLAYBOOK[intent];
  const citations = citeDocs(docs);
  const focusedEvidence = buildFocusedEvidence(intent, docs, message);
  const bestEvidence = focusedEvidence ? `\n\nRelevant MCC Bank rule: ${focusedEvidence}` : "";

  if (!playbook || evidenceGrade.label === "weak") {
    return "I found related policy context, but this request needs a staff specialist to avoid giving you an incomplete answer.";
  }

  return `${playbook.template}${bestEvidence}\n\nGrounded in: ${citations.join("; ")}`;
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
  const classification = classifyIntent(message, history);
  const retrievalQuery = planRetrievalQuery(message, history, classification);
  const docs = retrieveRelevantDocs(retrievalQuery, { intent: classification.topIntent, topK: 4 });
  const evidenceGrade = gradeEvidence(docs);
  const sentiment = detectSentiment(message, history);
  const decision = shouldEscalate({ classification, sentiment, evidenceGrade, message });

  const fallbackResponseMessage = decision.escalate
    ? "I am escalating this to a staff specialist with the issue type, policy references, sentiment, and recent conversation so you do not need to repeat yourself."
    : buildResolution(classification.topIntent, docs, evidenceGrade, message);

  const llmResult = await generateGroundedResponse({
    message,
    classification,
    docs,
    evidenceGrade,
    decision,
    fallbackAnswer: fallbackResponseMessage
  });

  const responseMessage = llmResult.used ? llmResult.content : fallbackResponseMessage;

  const contextSummary = {
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
        step: "mistral_grounded_generation",
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
  processMemberMessage
};
