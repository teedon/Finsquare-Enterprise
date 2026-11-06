import type { CSSProperties } from "react"
import { useCloudinaryUpload } from "@/hooks/useCloudinaryUpload"
import { Upload } from "@/icons"
import { Button } from "@/components/ui"
import OrgAvatar from "@/components/layout/OrgAvatar"

const MAX_LOGO_BYTES = 512 * 1024

/**
 * Logo picker: previews the community avatar and uploads the chosen file to
 * Cloudinary, handing the persisted `secureUrl` back through `onChange`.
 */
export default function LogoUpload({
  name,
  logo,
  onChange,
  onError,
  style,
}: {
  name: string
  logo: string
  onChange: (secureUrl: string) => void
  onError?: (message: string | null) => void
  style?: CSSProperties
}) {
  const { upload, uploading } = useCloudinaryUpload({ folder: "enterprise/logos" })

  return (
    <div className="logo-upload" style={style}>
      <OrgAvatar large name={name} logo={logo} />
      <label className="btn btn-secondary" style={{ cursor: "pointer" }}>
        <Upload size={14} /> {uploading ? "Uploading…" : logo ? "Replace logo" : "Upload logo"}
        <input
          type="file"
          hidden
          accept="image/png,image/jpeg,image/svg+xml,image/webp"
          onChange={async (event) => {
            const file = event.target.files?.[0]
            event.target.value = ""
            if (!file) return
            if (file.size > MAX_LOGO_BYTES) {
              onError?.("Logo must be 512 KB or smaller")
              return
            }
            onError?.(null)
            const outcome = await upload(file)
            if (outcome.ok) onChange(outcome.secureUrl)
            else onError?.(outcome.message)
          }}
        />
      </label>
      {logo && (
        <Button variant="ghost" onClick={() => onChange("")}>
          Remove
        </Button>
      )}
    </div>
  )
}
