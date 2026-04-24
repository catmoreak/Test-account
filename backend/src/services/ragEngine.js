const knowledgeBase = require("../data/knowledgeBase.json");

const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "from",
  "with",
  "that",
  "this",
  "you",
  "your",
  "have",
  "has",
  "had",
  "was",
  "were",
  "are",
  "about",
  "what",
  "where",
  "when",
  "how",
  "can",
  "need",
  "want",
  "please",
  "into",
  "after",
  "before",
  "been",
  "will",
  "just",
  "not"
]);

const QUERY_EXPANSIONS = {
  balance: ["available", "current", "funds", "account"],
  application: ["loan", "status"],
  charge: ["transaction", "card", "dispute", "chargeback"],
  charges: ["service", "fee", "fees"],
  fee: ["charge", "charges", "service"],
  fees: ["charge", "charges", "service"],
  purchase: ["transaction", "charge", "card"],
  fraud: ["unrecognized", "suspicious", "transaction", "dispute"],
  overcharged: ["complaint", "billing", "dispute", "escalation"],
  loan: ["application", "approval", "pending", "status"],
  education: ["loan", "student", "studies", "cibil"],
  student: ["education", "loan", "studies"],
  msme: ["business", "ccl", "working", "capital", "machinery"],
  business: ["msme", "loan", "industrialist"],
  ccl: ["loan", "renewal", "limit", "processing"],
  jewel: ["loan", "gold", "service", "charge"],
  gold: ["jewel", "loan", "market", "value"],
  surety: ["consumer", "loan", "guarantor"],
  consumer: ["surety", "loan", "household"],
  vehicle: ["loan", "four", "wheeler", "two", "wheeler"],
  mortgage: ["loan", "property", "renovation", "marriage"],
  machinery: ["msme", "hypothecation", "loan"],
  agriculture: ["allied", "crop", "boat", "poultry", "dairy"],
  savings: ["account", "sb", "interest", "passbook"],
  saving: ["savings", "account", "sb"],
  ssb: ["savings", "interest", "account"],
  card: ["debit"],
  atm: ["card", "pin", "annual", "replacement"],
  blocked: ["locked", "declined", "reactivation", "security"],
  unblock: ["reactivation", "locked", "blocked"],
  address: ["update", "residence", "proof", "kyc"],
  moved: ["address", "residence", "proof"],
  penalty: ["fixed", "deposit", "maturity", "closure"],
  premature: ["fixed", "deposit", "closure", "maturity"],
  maturity: ["fixed", "deposit", "penalty", "closure"],
  fd: ["fixed", "deposit", "interest", "maturity"],
  rd: ["recurring", "deposit", "installment", "interest"],
  recurring: ["deposit", "installment", "rd"],
  locker: ["rent", "key", "operation", "delayed"],
  neft: ["rtgs", "remittance", "transfer"],
  rtgs: ["neft", "remittance", "transfer"],
  cheque: ["check", "leaf", "book", "stop"],
  check: ["cheque", "leaf", "book", "stop"],
  stop: ["payment", "cheque"],
  pps: ["positive", "pay", "privacy", "pin"],
  privacy: ["pps", "data", "security", "policy"],
  complaint: ["escalation", "gm", "chairman", "contact"],
  nre: ["whatsapp", "account", "query"],
  stamp: ["e-stamp", "branch", "facility"],
  flagged: ["suspicious", "freeze", "fraud", "restricted"],
  login: ["online", "banking", "password", "access"]
};

const INTENT_CATEGORY_BOOSTS = {
  balance_inquiry: ["account-management"],
  transaction_dispute: ["disputes", "security", "service"],
  loan_status: ["loans", "loan-products"],
  loan_product: ["loan-products", "loans"],
  card_block: ["cards", "security"],
  account_update: ["account-management"],
  policy_question: ["deposits", "service-charges", "privacy-security", "lockers"],
  unresolved_complaint: ["complaints", "service-charges"],
  service_charge: ["service-charges", "loans", "lockers"],
  deposit_product: ["deposits"],
  privacy_question: ["privacy-security"],
  branch_service: ["services"],
  locker_service: ["lockers"]
};

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}

function expandTokens(tokens) {
  const expanded = new Set(tokens);
  tokens.forEach((token) => {
    (QUERY_EXPANSIONS[token] || []).forEach((term) => expanded.add(term));
  });
  return [...expanded];
}

function buildDocText(doc) {
  return [doc.title, doc.category, doc.content, ...(doc.tags || [])].join(" ");
}

function buildCorpus(docs) {
  const docTokens = docs.map((doc) => tokenize(buildDocText(doc)));
  const df = {};

  docTokens.forEach((tokens) => {
    new Set(tokens).forEach((token) => {
      df[token] = (df[token] || 0) + 1;
    });
  });

  const totalDocs = docs.length;
  const idf = {};
  Object.keys(df).forEach((term) => {
    idf[term] = Math.log(1 + (totalDocs - df[term] + 0.5) / (df[term] + 0.5));
  });

  const avgDocLength = docTokens.reduce((sum, tokens) => sum + tokens.length, 0) / docs.length;
  return { docTokens, idf, avgDocLength };
}

const corpus = buildCorpus(knowledgeBase);

function bm25Score(queryTokens, docTokens) {
  const k1 = 1.4;
  const b = 0.72;
  const docLength = docTokens.length || 1;
  const frequencies = {};

  docTokens.forEach((token) => {
    frequencies[token] = (frequencies[token] || 0) + 1;
  });

  return queryTokens.reduce((score, token) => {
    const frequency = frequencies[token] || 0;
    if (!frequency) return score;

    const idf = corpus.idf[token] || 0.05;
    const denominator = frequency + k1 * (1 - b + b * (docLength / corpus.avgDocLength));
    return score + idf * ((frequency * (k1 + 1)) / denominator);
  }, 0);
}

function phraseScore(query, doc) {
  const text = `${doc.title} ${doc.content} ${(doc.tags || []).join(" ")}`.toLowerCase();
  const normalizedQuery = query.toLowerCase();
  let score = 0;

  (doc.tags || []).forEach((tag) => {
    if (normalizedQuery.includes(tag.toLowerCase())) {
      score += 0.9;
    }
  });

  const titleWords = tokenize(doc.title);
  titleWords.forEach((word) => {
    if (normalizedQuery.includes(word)) {
      score += 0.18;
    }
  });

  if (text.includes(normalizedQuery) && normalizedQuery.length > 10) {
    score += 1.1;
  }

  return score;
}

function categoryBoost(intent, doc) {
  const categories = INTENT_CATEGORY_BOOSTS[intent] || [];
  return categories.includes(doc.category) ? 2.5 : 0;
}

function buildSnippet(doc, queryTokens) {
  const sentences = doc.content.match(/[^.!?]+[.!?]?/g) || [doc.content];
  const ranked = sentences
    .map((sentence) => {
      const sentenceTokens = new Set(tokenize(sentence));
      const hits = queryTokens.filter((token) => sentenceTokens.has(token)).length;
      return { sentence: sentence.trim(), hits };
    })
    .sort((a, b) => b.hits - a.hits);

  return (ranked[0]?.sentence || doc.content).trim();
}

function retrieveRelevantDocs(query, options = {}) {
  const topK = options.topK || 4;
  const intent = options.intent;
  const baseTokens = tokenize(query);
  const queryTokens = expandTokens(baseTokens);

  const scored = knowledgeBase.map((doc, index) => {
    const docTokens = corpus.docTokens[index];
    const lexicalScore = bm25Score(queryTokens, docTokens);
    const phrase = phraseScore(query, doc);
    const category = categoryBoost(intent, doc);
    const matchedTerms = [...new Set(queryTokens.filter((token) => docTokens.includes(token)))];
    const coverage = baseTokens.length ? matchedTerms.filter((term) => baseTokens.includes(term)).length / baseTokens.length : 0;
    const score = lexicalScore + phrase + category + coverage;

    return {
      ...doc,
      score: Number(score.toFixed(4)),
      retrievalSignals: {
        lexicalScore: Number(lexicalScore.toFixed(4)),
        phraseScore: Number(phrase.toFixed(4)),
        categoryBoost: Number(category.toFixed(4)),
        coverage: Number(coverage.toFixed(4)),
        matchedTerms
      },
      snippet: buildSnippet(doc, queryTokens)
    };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

function gradeEvidence(docs) {
  const [first, second] = docs;
  const topScore = first?.score || 0;
  const margin = topScore - (second?.score || 0);
  const label = topScore >= 3.2 && margin >= 0.5 ? "strong" : topScore >= 1.8 ? "usable" : "weak";

  return {
    label,
    topScore: Number(topScore.toFixed(4)),
    margin: Number(margin.toFixed(4))
  };
}

module.exports = {
  retrieveRelevantDocs,
  gradeEvidence,
  tokenize,
  knowledgeBase
};
