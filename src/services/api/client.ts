import { env } from "@/app/config/env"
import { ApiError, type RequestOptions } from "./types"

export interface ApiClient {
  get<T>(path: string, options?: RequestOptions): Promise<T>
  post<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T>
  put<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T>
  patch<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T>
  delete<T>(path: string, options?: RequestOptions): Promise<T>
}

type AccessTokenProvider = () => string | null | Promise<string | null>
let accessTokenProvider: AccessTokenProvider = () => null

export function configureApiAuth(provider: AccessTokenProvider) {
  accessTokenProvider = provider
}

/** Read the current access token through the configured provider. */
export function getAccessToken(): Promise<string | null> {
  return Promise.resolve(accessTokenProvider())
}

function normalizeStatus(status: number): ApiError["code"] {
  if (status === 401) return "unauthorized"
  if (status === 403) return "forbidden"
  if (status === 404) return "not_found"
  if (status === 422) return "validation"
  if (status >= 500) return "server"
  return "unknown"
}

/**
 * The MFI backend wraps successful responses in `{ success, message, data }`. Unwrap to `data` while
 * preserving sibling flags (for example `requiresCommunitySelection`) so callers only ever see the
 * payload they asked for.
 */
function unwrapEnvelope(payload: unknown): unknown {
  if (payload && typeof payload === "object" && "success" in payload && "data" in payload) {
    const envelope = payload as Record<string, unknown>
    const data = envelope.data
    const flags: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(envelope)) {
      if (key !== "success" && key !== "message" && key !== "data") flags[key] = value
    }
    if (data && typeof data === "object" && !Array.isArray(data)) {
      return { ...flags, ...(data as Record<string, unknown>) }
    }
    return data
  }
  return payload
}

/** NestJS validation errors carry `message` as a string array; flatten it for the user. */
function errorMessage(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined
  const message = (payload as Record<string, unknown>).message
  if (typeof message === "string") return message
  if (Array.isArray(message)) return message.filter((part) => typeof part === "string").join(", ")
  return undefined
}

async function request<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const controller = new AbortController()
  const timeout = window.setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? 15_000,
  )

  try {
    const accessToken = await accessTokenProvider()
    const response = await fetch(`${env.VITE_API_URL}${env.VITE_API_PREFIX}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...options.headers,
      },
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
    })

    const payload = response.status === 204 ? undefined : unwrapEnvelope(await response.json())
    if (!response.ok) {
      throw new ApiError(
        errorMessage(payload) ?? "The request could not be completed.",
        normalizeStatus(response.status),
        response.status,
        payload,
      )
    }
    return payload as T
  } catch (error) {
    if (error instanceof ApiError) throw error
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ApiError(
        "The request took too long. Please try again.",
        "timeout",
      )
    }
    throw new ApiError(
      "Unable to reach FinSquare. Check your connection and try again.",
      "network",
    )
  } finally {
    window.clearTimeout(timeout)
  }
}

export const apiClient: ApiClient = {
  get: (path, options) => request(path, { ...options, method: "GET" }),
  post: (path, body, options) =>
    request(path, { ...options, method: "POST", body }),
  put: (path, body, options) =>
    request(path, { ...options, method: "PUT", body }),
  patch: (path, body, options) =>
    request(path, { ...options, method: "PATCH", body }),
  delete: (path, options) => request(path, { ...options, method: "DELETE" }),
}
