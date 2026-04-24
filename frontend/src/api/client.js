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

export async function sendMemberMessage(payload) {
  return request("/api/member/message", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

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
