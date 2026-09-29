// Fetch layer over the FastAPI backend. Base is the relative "/api" prefix so the
// same code works in dev (Vite proxies /api → :8001) and behind a single origin in prod.
const BASE = "/api";

export class ApiError extends Error {
  status;
  body;
  constructor(status, body) {
    super(`request failed with ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}
async function request(method, path, body) {
  // Auth rides the httpOnly session cookie automatically — never add auth headers here.
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers:
      body === undefined
        ? undefined
        : {
            "Content-Type": "application/json",
          },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  // FastAPI reports request-validation failures as 422 with a {detail: [...]} body.
  if (!res.ok) {
    const errBody = await res.json().catch(() => null);
    throw new ApiError(res.status, errBody);
  }
  if (res.status === 204) return undefined;
  return await res.json();
}

// Multipart upload (audio dictation) — never set Content-Type by hand, the
// browser must supply the multipart boundary.
export async function apiUpload(path, formData) {
  const res = await fetch(`${BASE}${path}`, { method: "POST", body: formData });
  if (!res.ok) {
    const errBody = await res.json().catch(() => null);
    throw new ApiError(res.status, errBody);
  }
  return await res.json();
}

// Runtime response-shape assertions belong in tests when an endpoint contract matters.
export const apiGet = (path) => request("GET", path);
export const apiPost = (path, body) => request("POST", path, body ?? null);
export const apiPut = (path, body) => request("PUT", path, body ?? null);
export const apiPatch = (path, body) => request("PATCH", path, body ?? null);
export const apiDelete = (path) => request("DELETE", path);
