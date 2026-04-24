const express = require("express");
const { listCases, getCaseById, updateCaseStatus, addCaseNote } = require("../services/caseStore");
const { retrieveRelevantDocs, knowledgeBase } = require("../services/ragEngine");
const { INTENT_RULES } = require("../services/intelligenceEngine");

const router = express.Router();

// ─── Cases list with stats ─────────────────────────────────────────────────
router.get("/cases", async (req, res) => {
  const { status = "all" } = req.query;
  const allCases = await listCases();

  const filtered = status === "all" ? allCases : allCases.filter((item) => item.status === status);

  // Build queue breakdown
  const queueMap = {};
  allCases.forEach((c) => {
    const queue = c.escalationPacket?.recommendedQueue;
    if (queue) {
      queueMap[queue] = (queueMap[queue] || 0) + 1;
    }
  });

  const stats = {
    total: allCases.length,
    autoResolved: allCases.filter((item) => item.status === "auto-resolved").length,
    needsAttention: allCases.filter((item) => item.status === "needs-attention").length,
    inProgress: allCases.filter((item) => item.status === "in-progress").length,
    resolved: allCases.filter((item) => item.status === "resolved").length,
    distressed: allCases.filter((item) => item.contextSummary?.sentiment?.label === "distressed").length,
    p1Count: allCases.filter((item) => item.escalationPacket?.priority === "P1").length,
    queueBreakdown: queueMap
  };

  return res.json({ stats, cases: filtered });
});

// ─── Single case detail ────────────────────────────────────────────────────
router.get("/cases/:id", async (req, res) => {
  const found = await getCaseById(req.params.id);
  if (!found) {
    return res.status(404).json({ error: "Case not found" });
  }
  return res.json(found);
});

// ─── Update case status ────────────────────────────────────────────────────
router.patch("/cases/:id/status", async (req, res) => {
  const { status } = req.body;
  if (!["auto-resolved", "needs-attention", "in-progress", "resolved"].includes(status)) {
    return res.status(400).json({ error: "Invalid status" });
  }

  const updated = await updateCaseStatus(req.params.id, status);
  if (!updated) {
    return res.status(404).json({ error: "Case not found" });
  }
  return res.json(updated);
});

// ─── Add a staff note to a case ───────────────────────────────────────────
router.post("/cases/:id/notes", async (req, res) => {
  const { note, staffId = "staff" } = req.body;
  if (!note || typeof note !== "string") {
    return res.status(400).json({ error: "note is required" });
  }

  const updated = await addCaseNote(req.params.id, { note, staffId, timestamp: new Date().toISOString() });
  if (!updated) {
    return res.status(404).json({ error: "Case not found" });
  }
  return res.json(updated);
});

// ─── Semantic search across knowledge base ────────────────────────────────
router.get("/search", async (req, res) => {
  const { q } = req.query;
  if (!q || typeof q !== "string" || q.trim().length < 3) {
    return res.status(400).json({ error: "Query must be at least 3 characters" });
  }

  try {
    const hits = await retrieveRelevantDocs(q.trim(), { topK: 6 });
    return res.json({ query: q, hits });
  } catch (err) {
    return res.status(500).json({ error: "Search failed", details: err.message });
  }
});

// ─── Knowledge base overview ──────────────────────────────────────────────
router.get("/knowledge", (req, res) => {
  const summary = knowledgeBase.map((doc) => ({
    id: doc.id,
    title: doc.title,
    category: doc.category,
    tagCount: doc.tags?.length || 0,
    contentLength: doc.content?.length || 0
  }));

  const categories = {};
  knowledgeBase.forEach((doc) => {
    categories[doc.category] = (categories[doc.category] || 0) + 1;
  });

  return res.json({ total: knowledgeBase.length, categories, documents: summary });
});

// ─── Intent queue mapping ─────────────────────────────────────────────────
router.get("/queues", (req, res) => {
  const queues = {};
  Object.entries(INTENT_RULES).forEach(([intent, rule]) => {
    if (!queues[rule.queue]) {
      queues[rule.queue] = [];
    }
    queues[rule.queue].push(intent);
  });
  return res.json(queues);
});

// ─── Analytics endpoint ───────────────────────────────────────────────────
router.get("/analytics", async (req, res) => {
  const { days = 7 } = req.query;
  const allCases = await listCases();

  const since = new Date(Date.now() - Number(days) * 24 * 60 * 60 * 1000);
  const recent = allCases.filter((c) => new Date(c.createdAt) >= since);

  // Top 5 issue types
  const intentCounts = {};
  recent.forEach((c) => {
    const intent = c.contextSummary?.topIntent || "unknown";
    intentCounts[intent] = (intentCounts[intent] || 0) + 1;
  });
  const topIssues = Object.entries(intentCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([intent, count]) => ({ intent: intent.replace(/_/g, " "), count }));

  // Escalation rate
  const escalated = recent.filter((c) => c.status === "needs-attention" || c.escalationPacket).length;
  const escalationRate = recent.length > 0 ? Number(((escalated / recent.length) * 100).toFixed(1)) : 0;

  // Auto-resolve rate
  const autoResolved = recent.filter((c) => c.status === "auto-resolved").length;
  const autoResolveRate = recent.length > 0 ? Number(((autoResolved / recent.length) * 100).toFixed(1)) : 0;

  // Language breakdown
  const langMap = {};
  recent.forEach((c) => {
    const lang = c.language || "en";
    langMap[lang] = (langMap[lang] || 0) + 1;
  });

  // Sentiment breakdown
  const sentimentMap = { neutral: 0, concerned: 0, distressed: 0 };
  recent.forEach((c) => {
    const s = c.contextSummary?.sentiment?.label || "neutral";
    sentimentMap[s] = (sentimentMap[s] || 0) + 1;
  });

  // Average confidence
  const totalConf = recent.reduce((sum, c) => sum + (c.contextSummary?.confidence || 0), 0);
  const avgConfidence = recent.length > 0 ? Number((totalConf / recent.length).toFixed(3)) : 0;

  // P1 count
  const p1Count = recent.filter((c) => c.escalationPacket?.priority === "P1").length;

  // Daily volume trend (last 7 days)
  const dailyMap = {};
  for (let i = 0; i < Number(days); i++) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const key = d.toISOString().split("T")[0];
    dailyMap[key] = 0;
  }
  recent.forEach((c) => {
    const d = new Date(c.createdAt);
    const key = !isNaN(d) ? d.toISOString().split("T")[0] : null;
    if (key && dailyMap[key] !== undefined) dailyMap[key]++;
  });
  const dailyTrend = Object.entries(dailyMap)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, count]) => ({ date, count }));

  return res.json({
    periodDays: Number(days),
    totalCases: recent.length,
    escalated,
    autoResolved,
    escalationRate,
    autoResolveRate,
    p1Count,
    avgConfidence,
    topIssues,
    languageBreakdown: langMap,
    sentimentBreakdown: sentimentMap,
    dailyTrend
  });
});

module.exports = router;
