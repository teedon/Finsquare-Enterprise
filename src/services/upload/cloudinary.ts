import { env } from "@/app/config/env"
import { getAccessToken } from "@/services/api"

export interface SignedUploadParams {
  cloudName: string
  apiKey: string
  timestamp: number
  signature: string
}

export interface CloudinaryUploadResult {
  secureUrl: string
  publicId: string
  resourceType: string
  format?: string
  width?: number
  height?: number
  bytes?: number
}

export interface CloudinaryUploadOptions {
  /** Cloudinary folder the asset is uploaded into (signed by the backend). */
  folder?: string
  /** `image`, `video`, `raw` or `auto`. Defaults to `auto`. */
  resourceType?: "image" | "video" | "raw" | "auto"
}

/**
 * The FinSquare backend mounts the signed-upload endpoint outside the MFI
 * prefix, so it is addressed directly rather than through `apiClient`.
 */
const SIGNATURE_PATH = "/api/v1/upload/signature"

async function requestSignature(folder: string | undefined, accessToken: string): Promise<SignedUploadParams> {
  const response = await fetch(`${env.VITE_API_URL}${SIGNATURE_PATH}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(folder ? { folder } : {}),
  })

  if (!response.ok) {
    throw new Error(
      response.status === 401 || response.status === 403
        ? "Your session has expired. Sign in again to upload files."
        : `Could not request an upload signature (${response.status}).`,
    )
  }

  return (await response.json()) as SignedUploadParams
}

/**
 * Upload a file directly to Cloudinary using a backend-signed request.
 *
 * The backend signs `timestamp` (+ `folder` when provided) and the file goes
 * straight from the browser to Cloudinary, so the API secret never reaches
 * the client. Returns the persisted `secureUrl` callers should save.
 */
export async function uploadToCloudinary(
  file: File,
  options: CloudinaryUploadOptions = {},
): Promise<CloudinaryUploadResult> {
  const resourceType = options.resourceType ?? "auto"
  const folder = options.folder?.trim() || undefined

  const accessToken = await getAccessToken()
  if (!accessToken) {
    throw new Error("You are not signed in.")
  }

  const signed = await requestSignature(folder, accessToken)

  const form = new FormData()
  form.append("file", file)
  form.append("api_key", signed.apiKey)
  form.append("timestamp", String(signed.timestamp))
  form.append("signature", signed.signature)
  if (folder) form.append("folder", folder)

  const response = await fetch(`https://api.cloudinary.com/v1_1/${signed.cloudName}/${resourceType}/upload`, {
    method: "POST",
    body: form,
  })

  const result = (await response.json()) as {
    secure_url?: string
    public_id?: string
    format?: string
    width?: number
    height?: number
    bytes?: number
    error?: { message?: string }
  }

  if (!response.ok || !result.secure_url) {
    throw new Error(result.error?.message ?? "The upload failed. Please try again.")
  }

  return {
    secureUrl: result.secure_url,
    publicId: result.public_id ?? "",
    resourceType,
    format: result.format,
    width: result.width,
    height: result.height,
    bytes: result.bytes,
  }
}
