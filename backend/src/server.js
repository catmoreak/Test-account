const express = require("express");
const cors = require("cors");
const memberRoutes = require("./routes/memberRoutes");
const staffRoutes = require("./routes/staffRoutes");

const app = express();
const PORT = process.env.PORT || 8787;

app.use(cors());
app.use(express.json());

app.get("/api/health", (_, res) => {
  res.json({ status: "ok", service: "CreditAssist AI backend" });
});

app.use("/api/member", memberRoutes);
app.use("/api/staff", staffRoutes);

app.listen(PORT, () => {
  console.log(`CreditAssist backend running on port ${PORT}`);
});
