import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@/services/api", () => ({
  getAccessToken: vi.fn(async () => "test-token"),
}))

import { getAccessToken } from "@/services/api"
import { uploadToCloudinary } from "./cloudinary"

const fetchMock = vi.fn()
vi.stubGlobal("fetch", fetchMock)

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

describe("uploadToCloudinary", () => {
  afterEach(() => {
    fetchMock.mockReset()
    vi.mocked(getAccessToken).mockResolvedValue("test-token")
  })

  it("requests a backend signature and uploads the file directly to Cloudinary", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          cloudName: "demo",
          apiKey: "123",
          timestamp: 1700000000,
          signature: "abc",
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          secure_url: "https://res.cloudinary.com/demo/image/upload/v1/logo.png",
          public_id: "enterprise/logos/logo",
        }),
      )

    const result = await uploadToCloudinary(new File(["image"], "logo.png", { type: "image/png" }), {
      folder: "enterprise/logos",
    })

    expect(result.secureUrl).toBe("https://res.cloudinary.com/demo/image/upload/v1/logo.png")
    expect(result.publicId).toBe("enterprise/logos/logo")

    const [signatureCall, uploadCall] = fetchMock.mock.calls

    expect(signatureCall[0]).toBe("http://localhost:3000/api/v1/upload/signature")
    expect(signatureCall[1]).toMatchObject({
      method: "POST",
      headers: expect.objectContaining({ Authorization: "Bearer test-token" }),
    })

    expect(uploadCall[0]).toBe("https://api.cloudinary.com/v1_1/demo/auto/upload")
    const body = uploadCall[1]?.body as FormData
    expect(body.get("api_key")).toBe("123")
    expect(body.get("timestamp")).toBe("1700000000")
    expect(body.get("signature")).toBe("abc")
    expect(body.get("folder")).toBe("enterprise/logos")
    expect(body.get("file")).toBeInstanceOf(File)
  })

  it("reports an expired session when the signature request is rejected", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 401))

    await expect(uploadToCloudinary(new File(["x"], "x.png", { type: "image/png" }))).rejects.toThrow(
      "Your session has expired",
    )
  })

  it("rejects when no access token is available", async () => {
    vi.mocked(getAccessToken).mockResolvedValueOnce(null)

    await expect(uploadToCloudinary(new File(["x"], "x.png", { type: "image/png" }))).rejects.toThrow(
      "You are not signed in.",
    )
  })
})
