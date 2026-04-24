const express = require("express");
const { v4: uuidv4 } = require("uuid");
const { processMemberMessage } = require("../services/intelligenceEngine");
const { createCase } = require("../services/caseStore");

const router = express.Router();

router.post("/message", async (req, res) => {
  const { memberId = "anonymous", message, history = [] } = req.body;

  if (!message || typeof message !== "string") {
    return res.status(400).json({ error: "message is required" });
  }

  const analysis = await processMemberMessage(message, history);

  const caseRecord = createCase({
    id: `CASE-${uuidv4().split("-")[0].toUpperCase()}`,
    memberId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: analysis.autoResolved ? "auto-resolved" : "needs-attention",
    conversation: [...history, { role: "member", message }, { role: "assistant", message: analysis.responseMessage }],
    contextSummary: analysis.contextSummary,
    escalationPacket: analysis.escalationPacket
  });

  return res.json({
    reply: analysis.responseMessage,
    case: caseRecord
  });
});

module.exports = router;
