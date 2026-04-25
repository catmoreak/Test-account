/**
 * RAG Configuration and Validation Module
 * Prevents hallucination through strict evidence grading, citation tracking, and refusal thresholds
 */

const RAG_CONFIG = {
  // Evidence Grading Thresholds (STRICTER to reduce hallucination)
  EVIDENCE: {
    STRONG_MIN_SCORE: 0.85,
    STRONG_MIN_MARGIN: 0.10,
    STRONG_CONFIDENCE: 0.95,

    USABLE_MIN_SCORE: 0.65,        // Lowered from 0.72 to catch documents queries
    USABLE_MIN_MARGIN: 0.05,       // Keep at 0.05 for balance
    USABLE_CONFIDENCE: 0.75,

    RETRIEVAL_MIN_SCORE: 0.60,     // Lowered from 0.65 for better retrieval
    WEAK_CONFIDENCE: 0.4
  },

  // LLM Response Validation
  LLM: {
    TEMPERATURE: 0.05,  // LOWER = more deterministic, less creative (less hallucination)
    MAX_TOKENS: 400,
    TIMEOUT_MS: 15000,
    REQUIRED_CITATIONS_MIN: 1  // Each major claim needs citation
  },

  // Query Processing
  QUERY: {
    MAX_EXPANSION_LENGTH: 180,
    MAX_EXPANSION_TRIGGERS: 2,  // Limit expansions to top 2 matches
    DEDUP_SIMILARITY_THRESHOLD: 0.92
  },

  // Escalation Rules (when to refuse and escalate)
  ESCALATION: {
    CONFIDENCE_THRESHOLD: 0.42,
    NO_SOURCES_THRESHOLD: 0.70,  // If no docs >= this, escalate
    WEAK_EVIDENCE_TRIGGER: true  // Always escalate on weak evidence
  }
};

/**
 * Validates if retrieved docs are suitable for grounded response
 * Returns { canAnswer, reason, confidence }
 */
function validateEvidenceQuality(evidenceGrade, docs, intent) {
  const minDocsRequired = intent === "transaction_dispute" || intent === "account_block" ? 1 : 1;
  
  if (evidenceGrade.label === "strong") {
    return { canAnswer: true, reason: "strong-evidence", confidence: 0.95 };
  }

  if (evidenceGrade.label === "usable" && docs.length >= minDocsRequired) {
    return { canAnswer: true, reason: "usable-evidence", confidence: 0.75 };
  }

  // WEAK evidence: refuse and escalate
  return { 
    canAnswer: false, 
    reason: "weak-evidence-insufficient-for-grounding", 
    confidence: 0.4,
    shouldEscalate: true 
  };
}

/**
 * Extracts citations from LLM response and validates they exist in sources
 */
function extractAndValidateCitations(llmResponse, sourceIds) {
  const citationRegex = /\[([A-Z]{3}-\d{3})\]/g;
  const found = new Set();
  let match;

  while ((match = citationRegex.exec(llmResponse)) !== null) {
    found.add(match[1]);
  }

  const valid = Array.from(found).filter(id => sourceIds.includes(id));
  const invalid = Array.from(found).filter(id => !sourceIds.includes(id));

  return {
    citedIds: Array.from(found),
    validCitations: valid,
    invalidCitations: invalid,  // RED FLAG: hallucinated citations
    hasValidCitations: valid.length > 0,
    citationQuality: valid.length / Math.max(found.size, 1)  // 1.0 = all valid
  };
}

/**
 * Scores response trustworthiness (0-1)
 * Low score = likely hallucinating or low-confidence
 */
function scoreTrustworthiness(llmResponse, validations, evidenceGrade) {
  let score = 0.5;

  // Evidence quality contribution
  score += evidenceGrade.label === "strong" ? 0.3 : evidenceGrade.label === "usable" ? 0.15 : 0;

  // Citation quality contribution
  const citationQuality = validations.citationQuality || 0;
  score += citationQuality * 0.25;

  // Response length check (too short may indicate refusal, too long may indicate hallucination)
  const length = llmResponse.length;
  if (length >= 100 && length <= 800) {
    score += 0.1;
  }

  // Confidence floor
  return Math.max(0.2, Math.min(1.0, score));
}

/**
 * Builds a safer grounded prompt with strict instructions
 */
function buildSaferGroundedPrompt(message, classification, docs, evidenceGrade, language) {
  const validDocs = docs.filter(d => d.score >= 0.65).slice(0, 3);
  const langLabel = language === "hi" ? "Hindi" : language === "kn" ? "Kannada" : "English";

  const policySection = validDocs.length > 0
    ? validDocs
        .map(
          (doc, i) =>
            `[SOURCE-${i + 1}: ${doc.id}]\\n` +
            `Title: ${doc.title}\\n` +
            `Category: ${doc.category}\\n` +
            `Content: ${doc.content}\\n`
        )
        .join("\\n---\\n")
    : "[NO RELEVANT SOURCES FOUND]";

  const systemPrompt = `You are CreditAssist AI, MCC Bank's support agent. CRITICAL RULES:

1. REFUSE to answer if sources don't support it
2. CITE EVERY fact: "This rate is 6.75% [MCC-007]"
3. NEVER hallucinate policies, rates, timelines, eligibility
4. If unsure, say: "I need to escalate this to a specialist"
5. Keep responses under 150 words
6. Respond in ${langLabel} only
7. No competitor mentions or technical details

Member asked: "${message}"
Detected intent: ${classification.topIntent}
Evidence strength: ${evidenceGrade.label}`;

  const userPrompt = validDocs.length > 0
    ? `Policy sources:\\n\\n${policySection}\\n\\n---\\nAnswer using ONLY these sources. Cite each fact. If sources are insufficient, offer escalation.`
    : `No matching policies found. Politely tell the member you'll escalate to our team for specialized help.`;

  return [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt }
  ];
}

module.exports = {
  RAG_CONFIG,
  validateEvidenceQuality,
  extractAndValidateCitations,
  scoreTrustworthiness,
  buildSaferGroundedPrompt
};
