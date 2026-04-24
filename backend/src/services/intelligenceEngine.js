const { gradeEvidence, retrieveRelevantDocs, tokenize } = require("./ragEngine");

const INTENT_RULES = {
  balance_inquiry: {
    queue: "Member Support",
    phrases: ["balance", "available balance", "current balance", "how much", "funds"],
    terms: ["balance", "available", "current", "funds"]
  },
  transaction_dispute: {
    queue: "Fraud Ops",
    phrases: ["did not make", "didn't make", "do not recognize", "don't recognize", "unknown charge", "dispute", "fraud"],
    terms: ["charge", "transaction", "purchase", "dispute", "fraud", "unrecognized", "overcharged"]
  },
  loan_status: {
    queue: "Loan Ops",
    phrases: ["loan status", "loan approval", "application status", "haven't heard", "have not heard"],
    terms: ["loan", "application", "approval", "pending", "status", "documents"]
  },
  card_block: {
    queue: "Card Services",
    phrases: ["card blocked", "card is blocked", "failed pin", "failed pins", "reactivate", "unblock"],
    terms: ["card", "blocked", "declined", "pin", "reactivate", "unblock", "locked"]
  },
  account_update: {
    queue: "Member Support",
    phrases: ["update address", "change address", "registered address", "recently moved", "phone number", "email"],
    terms: ["update", "address", "moved", "residence", "profile", "phone", "email"]
  },
  policy_question: {
    queue: "Member Support",
    phrases: ["fixed deposit", "early closure", "before maturity", "what is the penalty", "interest rate"],
    terms: ["penalty", "policy", "interest", "maturity", "terms", "deposit", "closure"]
  },
  unresolved_complaint: {
    queue: "Tier-2 Complaints",
    phrases: ["called twice", "still unresolved", "not resolved", "nothing has been resolved", "for months", "three months"],
    terms: ["complaint", "unresolved", "overcharged", "months", "again", "escalate"]
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
  "twice"
];

const RESOLUTION_PLAYBOOK = {
  balance_inquiry: {
    action: "identity_verification",
    template:
      "I can help with a balance request, but I cannot display balances until identity verification is complete. Use online or mobile banking for instant current and available balances, or verify with member ID, last 4 digits of SSN, and OTP for phone support."
  },
  transaction_dispute: {
    action: "start_dispute",
    template:
      "This should be handled as a card transaction dispute. Submit the dispute within 60 calendar days from the statement date. Provisional credit is typically issued within 10 business days while the investigation is in progress."
  },
  loan_status: {
    action: "check_loan_queue",
    template:
      "Personal loan applications are usually reviewed within 3 to 7 business days. If the status is still pending, the most common reason is that supporting documents are waiting to be received or validated."
  },
  card_block: {
    action: "card_reactivation",
    template:
      "A debit card is temporarily locked for 24 hours after 3 consecutive failed PIN attempts. For immediate reactivation, complete identity verification and card security questions with an agent."
  },
  account_update: {
    action: "collect_documents",
    template:
      "To update a registered address, submit a government-issued photo ID and proof of residence dated within the last 90 days, such as a utility bill, bank statement, or lease. Online updates may also require MFA."
  },
  policy_question: {
    action: "answer_policy",
    template:
      "For fixed deposit early closure, the penalty is 1.5% of the principal amount or forfeiture of accrued interest for the current quarter, whichever is higher."
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

  if (classification.topIntent === "unresolved_complaint") {
    return { escalate: true, reason: "Repeated or unresolved complaint requires Tier-2 ownership" };
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

function buildResolution(intent, docs, evidenceGrade) {
  const playbook = RESOLUTION_PLAYBOOK[intent];
  const citations = citeDocs(docs);

  if (!playbook || evidenceGrade.label === "weak") {
    return "I found related policy context, but this request needs a staff specialist to avoid giving you an incomplete answer.";
  }

  return `${playbook.template}\n\nGrounded in: ${citations.join("; ")}`;
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

function processMemberMessage(message, history = []) {
  const classification = classifyIntent(message, history);
  const retrievalQuery = planRetrievalQuery(message, history, classification);
  const docs = retrieveRelevantDocs(retrievalQuery, { intent: classification.topIntent, topK: 4 });
  const evidenceGrade = gradeEvidence(docs);
  const sentiment = detectSentiment(message, history);
  const decision = shouldEscalate({ classification, sentiment, evidenceGrade, message });

  const responseMessage = decision.escalate
    ? "I am escalating this to a staff specialist with the issue type, policy references, sentiment, and recent conversation so you do not need to repeat yourself."
    : buildResolution(classification.topIntent, docs, evidenceGrade);

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
