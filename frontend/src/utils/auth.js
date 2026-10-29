/**
 * Authentication and Token Management Helper
 * Department of Information Science & Engineering &bull; Major Project Code 08
 * Provides automatic token injection, session refresh, and authenticated fetch wrappers.
 */

const API_BASE = "http://127.0.0.1:5000";

/**
 * Retrieves the stored auth token or automatically provisions
 * a default commissioner session if none exists.
 */
export async function getAuthToken() {
  let token = localStorage.getItem("evoting_token");
  if (token && token.trim()) {
    return token.trim();
  }

  // Auto-acquire commissioner token for smooth demonstration flow
  try {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "commissioner", password: "admin123" })
    });
    const data = await res.json();
    if (data.success && data.token) {
      token = data.token;
      localStorage.setItem("evoting_token", token);
      if (data.user) {
        localStorage.setItem("evoting_user", JSON.stringify(data.user));
      }
      return token;
    }
  } catch (err) {
    console.warn("Auto-login fallback failed:", err);
  }
  return "";
}

/**
 * Builds request headers with Authorization: Bearer <token>.
 */
export async function getAuthHeaders(extraHeaders = {}) {
  const token = await getAuthToken();
  const headers = { ...extraHeaders };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

/**
 * Fetch wrapper that attaches Authorization token and automatically retries
 * once with a fresh login token if an unexpected 401 is encountered.
 */
export async function authenticatedFetch(url, options = {}) {
  let headers = await getAuthHeaders(options.headers || {});
  let response = await fetch(url, {
    ...options,
    headers
  });

  // If unauthenticated (token expired or server restarted), retry once
  if (response.status === 401) {
    let allowAutoRefresh = true;
    try {
      const savedUser = localStorage.getItem("evoting_user");
      if (savedUser) {
        const u = JSON.parse(savedUser);
        // If user intentionally switched to Auditor or Voter, don't silently re-log them as commissioner
        if (u.role && u.role !== "COMMISSIONER") {
          allowAutoRefresh = false;
        }
      }
    } catch {}

    if (allowAutoRefresh) {
      try {
        const loginRes = await fetch(`${API_BASE}/api/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: "commissioner", password: "admin123" })
        });
        const loginData = await loginRes.json();
        if (loginData.success && loginData.token) {
          localStorage.setItem("evoting_token", loginData.token);
          if (loginData.user) {
            localStorage.setItem("evoting_user", JSON.stringify(loginData.user));
          }
          const retryHeaders = {
            ...(options.headers || {}),
            "Authorization": `Bearer ${loginData.token}`
          };
          response = await fetch(url, {
            ...options,
            headers: retryHeaders
          });
        }
      } catch (err) {
        console.warn("Token refresh attempt failed:", err);
      }
    }
  }

  return response;
}
