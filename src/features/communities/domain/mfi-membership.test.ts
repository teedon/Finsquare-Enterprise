import { describe, expect, it } from "vitest"
import { mapMfiMembership, type MfiCommunityIdentity } from "./mfi-membership"

const community = (over: Partial<MfiCommunityIdentity> = {}): MfiCommunityIdentity => ({
  id: "a6c4abfd",
  name: "Kogi Boys",
  ...over,
})

describe("mapMfiMembership", () => {
  it("trims the whitespace the backend keeps on a community's name", () => {
    const membership = mapMfiMembership(community({ name: " Kogi Boys " }), "OWNER")

    expect(membership.name).toBe("Kogi Boys")
  })

  it("trims the profile fields it surfaces in Settings", () => {
    const membership = mapMfiMembership(
      community({ details: { profile: { type: " Cooperative ", legalName: " Kogi Boys Ltd " } } }),
      "OWNER",
    )

    expect(membership.type).toBe("Cooperative")
    expect(membership.legalName).toBe("Kogi Boys Ltd")
  })

  it("keeps the default type when the profile does not carry one", () => {
    expect(mapMfiMembership(community({ details: { profile: { type: "  " } } }), "OWNER").type).toBe("MFI")
  })
})
