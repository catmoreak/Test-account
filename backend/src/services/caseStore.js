const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

const memoryCases = [];
let envLoaded = false;
let pool = null;
let useDatabase = false;

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
      const value = rest.join("=").trim().replace(/^['\"]|['\"]$/g, "");
      if (!process.env[key.trim()]) {
        process.env[key.trim()] = value;
      }
    });
  });
}

function normalizeCaseRow(row) {
  return {
    id: row.id,
    memberId: row.member_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    language: row.language,
    status: row.status,
    conversation: row.conversation,
    contextSummary: row.context_summary,
    escalationPacket: row.escalation_packet
  };
}

async function initCaseStore() {
  loadEnvFile();

  const connection = process.env.DATABASE_URL;
  if (!connection) {
    useDatabase = false;
    console.warn("DATABASE_URL not found. Using in-memory case store.");
    return;
  }

  pool = new Pool({
    connectionString: connection,
    ssl: { rejectUnauthorized: false }
  });

  await pool.query(`
    CREATE TABLE IF NOT EXISTS support_cases (
      id TEXT PRIMARY KEY,
      member_id TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL,
      language TEXT NOT NULL,
      status TEXT NOT NULL,
      conversation JSONB NOT NULL,
      context_summary JSONB NOT NULL,
      escalation_packet JSONB
    )
  `);

  useDatabase = true;
  console.log("Case store connected to Postgres.");
}

async function createCase(caseData) {
  if (!useDatabase) {
    memoryCases.unshift(caseData);
    return caseData;
  }

  await pool.query(
    `
      INSERT INTO support_cases
      (id, member_id, created_at, updated_at, language, status, conversation, context_summary, escalation_packet)
      VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9::jsonb)
    `,
    [
      caseData.id,
      caseData.memberId,
      caseData.createdAt,
      caseData.updatedAt,
      caseData.language || "en",
      caseData.status,
      JSON.stringify(caseData.conversation),
      JSON.stringify(caseData.contextSummary),
      caseData.escalationPacket ? JSON.stringify(caseData.escalationPacket) : null
    ]
  );

  return caseData;
}

async function listCases() {
  if (!useDatabase) {
    return memoryCases;
  }

  const result = await pool.query("SELECT * FROM support_cases ORDER BY created_at DESC");
  return result.rows.map(normalizeCaseRow);
}

async function getCaseById(caseId) {
  if (!useDatabase) {
    return memoryCases.find((item) => item.id === caseId) || null;
  }

  const result = await pool.query("SELECT * FROM support_cases WHERE id = $1 LIMIT 1", [caseId]);
  if (!result.rows[0]) {
    return null;
  }

  return normalizeCaseRow(result.rows[0]);
}

async function updateCaseStatus(caseId, status) {
  if (!useDatabase) {
    const existing = memoryCases.find((item) => item.id === caseId);
    if (!existing) {
      return null;
    }

    existing.status = status;
    existing.updatedAt = new Date().toISOString();
    return existing;
  }

  const result = await pool.query(
    `
      UPDATE support_cases
      SET status = $2, updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `,
    [caseId, status]
  );

  if (!result.rows[0]) {
    return null;
  }

  return normalizeCaseRow(result.rows[0]);
}

module.exports = {
  initCaseStore,
  createCase,
  listCases,
  getCaseById,
  updateCaseStatus
};
