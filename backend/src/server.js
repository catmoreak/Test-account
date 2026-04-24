require("dotenv").config({ path: require("path").resolve(__dirname, "../../.env") });
const express = require("express");
const cors = require("cors");
const memberRoutes = require("./routes/memberRoutes");
const staffRoutes = require("./routes/staffRoutes");
const authRoutes = require("./routes/authRoutes");
const { initCaseStore } = require("./services/caseStore");

const app = express();
const PORT = process.env.PORT || 8787;

const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5174",
  "https://alvas.devorbit.cloud",
  "https://backendalvas.devorbit.cloud",
  ...(process.env.CORS_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
];

const corsOptions = {
  origin: function (origin, callback) {
    // Allow any origin
    callback(null, true);
  },
  methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-User-Id", "Accept", "Origin", "X-Requested-With"],
  optionsSuccessStatus: 204,
  credentials: true
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));
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
