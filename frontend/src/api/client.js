const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json"
    },
    ...options
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || "Request failed");
  }

  return response.json();
}

// Member chat — now sends userId for account context resolution
export async function sendMemberMessage(payload) {
  return request("/api/member/message", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

// Staff cases
export async function getCases(status = "all") {
  return request(`/api/staff/cases?status=${status}`);
}

export async function getCaseById(id) {
  return request(`/api/staff/cases/${id}`);
}

export async function updateCaseStatus(id, status) {
  return request(`/api/staff/cases/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status })
  });
}

export async function addCaseNote(id, note, staffId = "staff") {
  return request(`/api/staff/cases/${id}/notes`, {
    method: "POST",
    body: JSON.stringify({ note, staffId })
  });
}

export async function searchKnowledge(q) {
  return request(`/api/staff/search?q=${encodeURIComponent(q)}`);
}

export async function getKnowledgeOverview() {
  return request("/api/staff/knowledge");
}

// Analytics
export async function getAnalytics(days = 7) {
  return request(`/api/staff/analytics?days=${days}`);
}
