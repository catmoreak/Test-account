const cases = [];

function createCase(caseData) {
  cases.unshift(caseData);
  return caseData;
}

function listCases() {
  return cases;
}

function getCaseById(caseId) {
  return cases.find((item) => item.id === caseId);
}

function updateCaseStatus(caseId, status) {
  const existing = getCaseById(caseId);
  if (!existing) {
    return null;
  }

  existing.status = status;
  existing.updatedAt = new Date().toISOString();
  return existing;
}

module.exports = {
  createCase,
  listCases,
  getCaseById,
  updateCaseStatus
};
