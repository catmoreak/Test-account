const { Pinecone } = require("@pinecone-database/pinecone");
const fs = require("fs");
const path = require("path");
const knowledgeBase = require("../data/knowledgeBase.json");

const STOP_WORDS = new Set([
  "the", "and", "for", "from", "with", "that", "this", "you", "your",
  "have", "has", "had", "was", "were", "are", "about", "what", "where",
  "when", "how", "can", "need", "want", "please", "into", "after",
  "before", "been", "will", "just", "not"
]);

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}

// Query expansion map: maps user shorthand → canonical banking terms for better retrieval
const QUERY_EXPANSION = {
  "block account": "account freeze deactivation suspended restricted",
  "block my account": "account freeze deactivation suspended",
  "freeze account": "account block suspended restricted",
  "account blocked": "account freeze deactivation suspended",
  "block card": "block card disable freeze debit atm card security temporary permanent",
  "block my card": "disable card freeze atm debit card security lock",
  "card blocked": "ATM card blocked declined reactivation PIN unblock",
  "unblock card": "unblock reactivate card atm debit pin reset",
  "how to block": "block disable freeze card method process steps",
  "how to unblock": "unblock reactivate card pin reset process method",
  "close account": "account closure charges savings current",
  "atm pin": "ATM card PIN replacement annual fee",
  "stop payment": "stop payment cheque issued charges SB CA CCL",
  "fixed deposit": "FD interest rate maturity tenure 456 days current rates",
  "fd rate": "fixed deposit interest rate 456 days senior citizen 7.00 7.50",
  "456 days": "fixed deposit interest rate 7.00 senior citizen 7.50 premium tenor",
  "fd interest": "fixed deposit interest rate 456 days maturity tenure current 7.00",
  "what is fd rate": "fixed deposit interest rate 456 days 7.00 7.50 maturity",
  "how much interest": "interest rate fixed deposit fd 456 days current rates",
  "fd rates": "fixed deposit interest rate all tenors 456 days 7.00 7.50 senior citizen",
  "recurring deposit": "recurring deposit RD monthly installment interest 6.75 6.50",
  "education loan": "education loan higher studies CIBIL moratorium rate",
  "gold loan": "jewel gold loan market value 10.75",
  "vehicle loan": "private vehicle four wheeler two wheeler rate",
  "locker": "locker rent key operation delayed charges",
  "neft rtgs": "NEFT RTGS remittance charges transfer",
  "complaint": "complaint escalation GM chairman contact",
  "service charge": "service charges fee 01-10-2024",
  "minimum balance": "minimum average balance quarterly charge savings current",
  "cheque book": "cheque book charges leaves calendar year savings current",
  "passbook": "passbook duplicate statement charge",
  "nre account": "NRE account WhatsApp query",
  "e-stamp": "e-stamp branches facility",
  "savings account": "savings bank SB interest 3.00 5.00 SSB open procedure how to documents",
  "savings interest": "savings bank SB interest 3.00 SSB 5.00",
  "open savings account": "savings account procedure online branch how to open step-by-step documents",
  "how to open savings": "savings account opening procedure documents required minimum balance aadhaar pan",
  "savings account opening": "open savings account how to procedure documents eligibility aadhaar",
  "savings account procedure": "open savings account steps documents required minimum balance cheque book aadhaar pan",
  "documents needed savings": "documents required savings account aadhaar pan opening",
  "documents for savings": "documents required savings account aadhaar identity pan address",
  "what documents savings": "documents required savings account opening aadhaar pan identity proof",
  "documents required": "documents needed opening account aadhaar pan kyc identity proof",
  "what documents needed": "documents required opening account aadhaar pan address proof identity",
  "documents for account": "documents required account opening aadhaar pan identity proof address kyc",
  "loan documents": "loan documents required aadhaar pan identity collateral security",
  "documents for loan": "documents required loan opening aadhaar pan income proof",
  "current account documents": "documents required current account business registration pan gst address",
  "fd documents": "documents fixed deposit aadhaar pan opening",
  "deposit documents": "documents required deposit opening aadhaar pan identity address",
  "recurring deposit": "recurring deposit RD monthly installment interest 6.75 6.50 documents",
  "loan against deposit": "loan deposit 85% interest",
  "dormant account": "dormant account activation NIL",
  "duplicate receipt": "duplicate deposit receipt charges",
  "balance certificate": "balance certificate account maintaining certificate",
};

function expandQuery(query) {
  const lowerQuery = query.toLowerCase();
  const expansions = [];
  // Limit expansions to max 2 most relevant to avoid query drift
  const sortedTriggers = Object.entries(QUERY_EXPANSION)
    .filter(([trigger]) => lowerQuery.includes(trigger))
    .sort((a, b) => b[0].length - a[0].length) // prefer longer triggers
    .slice(0, 2);
  
  sortedTriggers.forEach(([, expansion]) => {
    expansions.push(expansion);
  });
  
  const expandedQuery = expansions.length > 0 ? `${query} ${expansions.join(" ")}` : query;
  // Limit expansion length to prevent query bloat
  return expandedQuery.length > 200 ? query : expandedQuery;
}

let pcClient = null;
let mistralClient = null;
let index = null;
let envLoaded = false;
let mistralModulePromise = null;

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

function getClients() {
  loadEnvFile();

  if (!pcClient) {
    const pcApiKey = process.env.PINECONE_API_KEY;
    if (!pcApiKey) throw new Error("PINECONE_API_KEY is not set in environment variables.");
    pcClient = new Pinecone({ apiKey: pcApiKey });
    index = pcClient.Index(process.env.PINECONE_INDEX || "support-knowledge");
  }
  if (!mistralClient) {
    const mistralApiKey = process.env.MISTRAL_API_KEY;
    if (!mistralApiKey) throw new Error("MISTRAL_API_KEY is not set in environment variables.");
  }
  return { mistral: mistralClient, index };
}

async function getMistralClient() {
  loadEnvFile();

  if (mistralClient) {
    return mistralClient;
  }

  const mistralApiKey = process.env.MISTRAL_API_KEY;
  if (!mistralApiKey) throw new Error("MISTRAL_API_KEY is not set in environment variables.");

  if (!mistralModulePromise) {
    mistralModulePromise = import("@mistralai/mistralai");
  }

  const mistralModule = await mistralModulePromise;
  const Mistral = mistralModule.Mistral || mistralModule.default?.Mistral;

  if (typeof Mistral !== "function") {
    throw new Error("Mistral SDK could not be loaded correctly.");
  }

  mistralClient = new Mistral({ apiKey: mistralApiKey });
  return mistralClient;
}

async function embedText(text) {
  const mistral = await getMistralClient();
  const response = await mistral.embeddings.create({
    model: process.env.MISTRAL_EMBEDDING_MODEL || "mistral-embed",
    inputs: [text]
  });
  return response.data[0].embedding;
}

function retrieveRelevantDocsLocally(query, options = {}) {
  const topK = options.topK || 4;
  const expandedQuery = expandQuery(query);
  const queryTerms = new Set(tokenize(expandedQuery));
  const queryText = expandedQuery.toLowerCase();

  const scoredDocs = knowledgeBase.map((doc) => {
    const title = doc.title || "";
    const category = doc.category || "";
    const content = doc.content || "";
    const tags = doc.tags || [];
    const tagText = tags.join(" ");
    const searchableText = `${title} ${category} ${tagText} ${content}`.toLowerCase();

    const matchedTerms = [...queryTerms].filter((term) => searchableText.includes(term));
    const titleHits = matchedTerms.filter((term) => title.toLowerCase().includes(term)).length;
    const tagHits = matchedTerms.filter((term) => tagText.toLowerCase().includes(term)).length;
    const phraseBonus = queryText.length > 6 && searchableText.includes(queryText) ? 8 : 0;
    const rawScore = matchedTerms.length + titleHits * 2 + tagHits * 2 + phraseBonus;

    return { doc, matchedTerms, rawScore };
  });

  const maxScore = Math.max(...scoredDocs.map((item) => item.rawScore), 1);

  return scoredDocs
    .filter((item) => item.rawScore > 0)
    .sort((a, b) => b.rawScore - a.rawScore)
    .slice(0, topK)
    .map(({ doc, matchedTerms, rawScore }) => ({
      id: doc.id,
      title: doc.title,
      category: doc.category || "",
      content: doc.content || "",
      tags: doc.tags || [],
      snippet: (doc.content || "").substring(0, 400),
      score: Number((rawScore / maxScore).toFixed(4)),
      retrievalSignals: {
        provider: "local-keyword",
        expandedQuery: expandedQuery !== query ? expandedQuery : null,
        matchedTerms
      }
    }));
}

async function retrieveRelevantDocs(query, options = {}) {
  const topK = options.topK || 4;
  const expandedQuery = expandQuery(query);

  try {
    const { index } = getClients();
    const vector = await embedText(expandedQuery);

    // Request more results to filter for quality
    const queryResponse = await index.query({
      vector,
      topK: Math.min(topK + 3, 10),
      includeMetadata: true
    });

    // FILTER: Only keep documents with score >= 0.60 (lowered for better documents retrieval)
    const qualityMatches = queryResponse.matches.filter(m => (m.score || 0) >= 0.60);

    return qualityMatches.slice(0, topK).map(match => {
      // Find full doc from local knowledge base for complete content
      const localDoc = knowledgeBase.find(d => d.id === match.id) || {};
      return {
        id: match.id,
        title: match.metadata?.title || localDoc.title || match.id,
        category: match.metadata?.category || localDoc.category || "",
        content: localDoc.content || match.metadata?.content || "",
        tags: localDoc.tags || [],
        snippet: localDoc.content
          ? localDoc.content.substring(0, 400)
          : (match.metadata?.snippet || ""),
        score: Number((match.score || 0).toFixed(4)),
        retrievalSignals: {
          provider: "pinecone-mistral",
          vectorScore: Number((match.score || 0).toFixed(4)),
          expandedQuery: expandedQuery !== query ? expandedQuery : null,
          matchedTerms: []
        }
      };
    });
  } catch (error) {
    console.warn(`Semantic retrieval unavailable; using local keyword retrieval. ${error.message}`);
    return retrieveRelevantDocsLocally(query, options);
  }
}

function gradeEvidence(docs) {
  const [first, second] = docs;
  const topScore = first?.score || 0;
  const margin = topScore - (second?.score || 0);
  const secondScore = second?.score || 0;

  // BALANCED thresholds - strict but achievable:
  // strong: 0.85+ with clear margin (0.10+) = high confidence
  // usable: either clear margin OR two high-scoring corroborating sources
  // weak: below threshold = escalate or refuse
  const corroboratedHighScore = topScore >= 0.75 && secondScore >= 0.70;
  const label = topScore >= 0.85 && margin >= 0.10
    ? "strong"
    : (topScore >= 0.65 && margin >= 0.05 && topScore - Math.max(secondScore, 0.1) >= 0.05) || corroboratedHighScore
      ? "usable"
      : "weak";

  const confidence = topScore >= 0.85 ? 0.95 : label === "usable" ? 0.75 : 0.4;
  const documentCount = docs.filter(d => d.score >= 0.65).length;

  return {
    label,
    topScore: Number(topScore.toFixed(4)),
    margin: Number(margin.toFixed(4)),
    confidence: Number(confidence.toFixed(3)),
    documentCount,
    documentCountLabel: documentCount >= 2 ? "multiple-sources" : "single-source"
  };
}

// Expose embedText for the semantic search route
module.exports = {
  retrieveRelevantDocs,
  retrieveRelevantDocsLocally,
  gradeEvidence,
  tokenize,
  embedText,
  knowledgeBase
};
