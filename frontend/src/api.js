const API_BASE = (import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/+$/, "");
let csrfToken = "";

export function setCsrfToken(value) {
  csrfToken = value || "";
}

export async function api(path, options = {}) {
  const method = (options.method || "GET").toUpperCase();
  const headers = { Accept: "application/json", ...options.headers };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (!["GET", "HEAD", "OPTIONS"].includes(method) && csrfToken) {
    headers["X-CSRF-Token"] = csrfToken;
  }

  const startedAt = performance.now();
  let response;
  try {
    response = await fetch(API_BASE + path, {
      ...options,
      method,
      headers,
      credentials: "include",
    });
  } catch (requestError) {
    performance.measure(`LeaveHQ API ${method} ${path}`, { start: startedAt, end: performance.now() });
    if (requestError instanceof TypeError) {
      throw new Error("Unable to reach the LeaveHQ API. Check the server connection.");
    }
    throw requestError;
  }
  performance.measure(`LeaveHQ API ${method} ${path}`, { start: startedAt, end: performance.now() });

  const responseText = await response.text();
  let data = null;
  if (responseText) {
    try {
      data = JSON.parse(responseText);
    } catch {
      if (response.ok) {
        throw new Error("The LeaveHQ API returned an invalid response.");
      }
      data = { detail: responseText };
    }
  }
  if (!response.ok) {
    if (response.status === 401 && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("leavehq:unauthorized"));
    }
    const detail = Array.isArray(data?.detail)
      ? data.detail.map((issue) => issue?.msg).filter(Boolean).join("; ")
      : data?.detail;
    const error = new Error(
      typeof detail === "string" && detail
        ? detail
        : "Request failed. Please try again.",
    );
    error.status = response.status;
    throw error;
  }
  return data ?? {};
}
