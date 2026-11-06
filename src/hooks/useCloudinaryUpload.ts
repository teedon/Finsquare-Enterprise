import { useCallback, useState } from "react"
import { uploadToCloudinary, type CloudinaryUploadResult } from "@/services/upload/cloudinary"

export type UploadOutcome =
  | { ok: true; secureUrl: string; result: CloudinaryUploadResult }
  | { ok: false; message: string }

/**
 * File → Cloudinary upload with in-flight state. Files are uploaded through the
 * backend-signed Cloudinary flow; the resolved `secureUrl` is what callers
 * should persist.
 */
export function useCloudinaryUpload(options: { folder?: string } = {}) {
  const [uploading, setUploading] = useState(false)
  const folder = options.folder

  const upload = useCallback(
    async (file: File): Promise<UploadOutcome> => {
      setUploading(true)
      try {
        const result = await uploadToCloudinary(file, { folder })
        return { ok: true, secureUrl: result.secureUrl, result }
      } catch (error) {
        return {
          ok: false,
          message: error instanceof Error ? error.message : "The upload failed. Please try again.",
        }
      } finally {
        setUploading(false)
      }
    },
    [folder],
  )

  return { upload, uploading }
}
