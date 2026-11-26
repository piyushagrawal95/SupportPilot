const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8001";

export function getToken() {
  return localStorage.getItem("supportpilot_token");
}

export function setToken(token) {
  if (token) {
    localStorage.setItem("supportpilot_token", token);
  } else {
    localStorage.removeItem("supportpilot_token");
  }
}

export async function apiRequest(endpoint, options = {}) {
  const token = getToken();
  const headers = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (res.status === 401 && !endpoint.includes("/auth/login")) {
    setToken(null);
    window.dispatchEvent(new CustomEvent("supportpilot_auth_expired"));
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const errorMsg = data.detail || `Request failed with status ${res.status}`;
    const err = new Error(errorMsg);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}

export const api = {
  // Auth
  login: (email, password) => apiRequest("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  registerAdmin: (name, email, password) =>
    apiRequest("/api/auth/register-admin", { method: "POST", body: JSON.stringify({ name, email, password }) }),
  registerStaff: (name, email, password) =>
    apiRequest("/api/auth/register-staff", { method: "POST", body: JSON.stringify({ name, email, password }) }),
  requestRoleUpgrade: (requested_role, reason) =>
    apiRequest("/api/auth/role-request", { method: "POST", body: JSON.stringify({ requested_role, reason }) }),
  getMyRoleRequests: () => apiRequest("/api/auth/my-role-requests"),
  getMe: () => apiRequest("/api/auth/me"),
  setAvailability: (availability) => apiRequest("/api/auth/availability", { method: "POST", body: JSON.stringify({ availability }) }),
  forgotPassword: (email) => apiRequest("/api/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) }),
  resetPassword: (token, password) => apiRequest("/api/auth/reset-password", { method: "POST", body: JSON.stringify({ token, password }) }),
  heartbeat: () => apiRequest("/api/auth/me").catch(() => null),

  // Overview
  getOverview: () => apiRequest("/api/overview"),

  // Tickets
  getTickets: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiRequest(`/api/tickets${query ? `?${query}` : ""}`);
  },
  getTicket: (id) => apiRequest(`/api/tickets/${id}`),
  replyTicket: (id, message, new_status) =>
    apiRequest(`/api/tickets/${id}/reply`, { method: "POST", body: JSON.stringify({ message, new_status }) }),
  takeoverTicket: (id) => apiRequest(`/api/tickets/${id}/takeover`, { method: "POST" }),
  updateTicketStatus: (id, status) =>
    apiRequest(`/api/tickets/${id}/status`, { method: "POST", body: JSON.stringify({ status }) }),
  flagTicketWrong: (id, reason) =>
    apiRequest(`/api/tickets/${id}/flag-wrong`, { method: "POST", body: JSON.stringify({ reason }) }),

  // Live Queue & Chat
  getLiveQueue: () => apiRequest("/api/live/queue"),
  acceptLiveChat: (ticket_id) => apiRequest(`/api/live/${ticket_id}/accept`, { method: "POST" }),
  getLiveMessages: (ticket_id, after_id = 0) => apiRequest(`/api/live/${ticket_id}/messages?after_id=${after_id}`),
  sendLiveMessage: (ticket_id, message) =>
    apiRequest(`/api/live/${ticket_id}/send`, { method: "POST", body: JSON.stringify({ message }) }),

  // Approvals
  getApprovals: (status = "pending") => apiRequest(`/api/approvals?status=${status}`),
  getApproval: (id) => apiRequest(`/api/approvals/${id}`),
  getApprovalByToken: (token) => apiRequest(`/api/approvals/token/${token}`),
  decideApprovalByToken: (token, decision, reason, approver_email = null) =>
    apiRequest(`/api/approvals/token/${token}/decide`, {
      method: "POST",
      body: JSON.stringify({ decision, reason, approver_email }),
    }),
  decideApproval: (id, decision, reason) =>
    apiRequest(`/api/approvals/${id}/decide`, { method: "POST", body: JSON.stringify({ decision, reason }) }),

  // Activity Log
  getActivity: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiRequest(`/api/activity${query ? `?${query}` : ""}`);
  },

  // Performance
  getPerformance: () => apiRequest("/api/performance"),

  // Settings
  getSettings: () => apiRequest("/api/settings"),
  updateSettings: (settings) => apiRequest("/api/settings", { method: "PUT", body: JSON.stringify(settings) }),
  addTeamMember: (member) => apiRequest("/api/settings/team", { method: "POST", body: JSON.stringify(member) }),
  updateTeamMember: (id, member) => apiRequest(`/api/settings/team/${id}`, { method: "PUT", body: JSON.stringify(member) }),
  deleteTeamMember: (id) => apiRequest(`/api/settings/team/${id}`, { method: "DELETE" }),

  // Users & Staff Management (Admin)
  getUsersOverview: (search) => apiRequest(`/api/users/overview${search ? `?search=${encodeURIComponent(search)}` : ""}`),
  updateStaffRole: (id, role) => apiRequest(`/api/users/staff/${id}/role`, { method: "PUT", body: JSON.stringify({ role }) }),
  deleteStaffUser: (id) => apiRequest(`/api/users/staff/${id}`, { method: "DELETE" }),
  decideRoleRequest: (id, decision) => apiRequest(`/api/users/role-requests/${id}/decide`, { method: "POST", body: JSON.stringify({ decision }) }),

  // Test Suite & Decision Log
  runTests: () => apiRequest("/api/tests/run"),
  getTestCases: () => apiRequest("/api/tests/cases"),
  getDecisionLog: () => apiRequest("/api/decision-log"),
};
