import { describe, expect, it } from "vitest"
import { getReadableApiError } from "./utils"

describe("getReadableApiError", () => {
  it("returns readable message for non-Error values", () => {
    expect(getReadableApiError("bad")).toBe("Something went wrong. Please try again.")
  })

  it("extracts message from JSON error payload string", () => {
    const err = new Error(JSON.stringify({ message: "Invalid input" }))
    expect(getReadableApiError(err)).toBe("Invalid input")
  })
})
