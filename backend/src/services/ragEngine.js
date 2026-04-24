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
  "card blocked": "ATM card blocked declined reactivation PIN",
  "block card": "ATM card block decline reactivation",
  "close account": "account closure charges savings current",
  "atm pin": "ATM card PIN replacement annual fee",
  "stop payment": "stop payment cheque issued charges SB CA CCL",
  "fixed deposit": "FD interest rate maturity tenure",
  "fd rate": "fixed deposit interest rate 456 days senior citizen",
  "rd rate": "recurring deposit installment interest",
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
  "savings account": "savings bank SB interest 3.00 5.00 SSB",
  "savings interest": "savings bank SB interest 3.00 SSB 5.00",
  "recurring deposit": "recurring deposit RD monthly installment interest",
  "loan against deposit": "loan deposit 85% interest",
  "dormant account": "dormant account activation NIL",
  "duplicate receipt": "duplicate deposit receipt charges",
  "balance certificate": "balance certificate account maintaining certificate",
};

function expandQuery(query) {
  const lowerQuery = query.toLowerCase();
  const expansions = [];
  for (const [trigger, expansion] of Object.entries(QUERY_EXPANSION)) {
    if (lowerQuery.includes(trigger)) {
      expansions.push(expansion);
    }
  }
  return expansions.length > 0 ? `${query} ${expansions.join(" ")}` : query;
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

    const queryResponse = await index.query({
      vector,
      topK,
      includeMetadata: true
    });

    return queryResponse.matches.map(match => {
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

  // Cosine similarity: 0.82+ = strong, 0.72+ = usable, below = weak
  const label = topScore >= 0.82 && margin >= 0.015
    ? "strong"
    : topScore >= 0.72
      ? "usable"
      : "weak";

  return {
    label,
    topScore: Number(topScore.toFixed(4)),
    margin: Number(margin.toFixed(4))
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
