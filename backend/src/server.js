require("dotenv").config({ path: require("path").resolve(__dirname, "../../.env") });
const express = require("express");
const cors = require("cors");
const memberRoutes = require("./routes/memberRoutes");
const staffRoutes = require("./routes/staffRoutes");
const authRoutes = require("./routes/authRoutes");
const { initCaseStore } = require("./services/caseStore");

const app = express();
const PORT = process.env.PORT || 8787;

// Total CORS bypass for hackathon using the cors package
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

app.get("/api/health", (_, res) => {
  res.json({ status: "ok", service: "CreditAssist AI backend" });
});

app.use("/api/auth", authRoutes);
app.use("/api/member", memberRoutes);
app.use("/api/staff", staffRoutes);

async function startServer() {
  await initCaseStore();

  app.listen(PORT, () => {
    console.log(`CreditAssist backend running on port ${PORT}`);
  });
}

startServer().catch((error) => {
  console.error("Failed to start backend:", error);
  process.exit(1);
});
