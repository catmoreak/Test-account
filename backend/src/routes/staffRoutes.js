const express = require("express");
const { listCases, getCaseById, updateCaseStatus } = require("../services/caseStore");

const router = express.Router();

router.get("/cases", async (req, res) => {
  const { status = "all" } = req.query;
  const allCases = await listCases();

  const filtered = status === "all" ? allCases : allCases.filter((item) => item.status === status);

  const stats = {
    total: allCases.length,
    autoResolved: allCases.filter((item) => item.status === "auto-resolved").length,
    needsAttention: allCases.filter((item) => item.status === "needs-attention").length,
    distressed: allCases.filter((item) => item.contextSummary?.sentiment?.label === "distressed").length
  };

  return res.json({ stats, cases: filtered });
});

router.get("/cases/:id", async (req, res) => {
  const found = await getCaseById(req.params.id);
  if (!found) {
    return res.status(404).json({ error: "Case not found" });
  }

  return res.json(found);
});

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

module.exports = router;
