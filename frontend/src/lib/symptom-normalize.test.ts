import { describe, expect, it } from "vitest"
import {
  normalizeSymptomsForAi,
  resolveSymptomText,
  type SelectedSymptomInput,
} from "./symptom-normalize"

describe("resolveSymptomText", () => {
  it("maps Vietnamese and English aliases to preset keys", () => {
    expect(resolveSymptomText("sốt")).toEqual({
      kind: "preset",
      key: "fever",
      cleaned: "sốt",
    })
    expect(resolveSymptomText("ho")).toEqual({
      kind: "preset",
      key: "cough",
      cleaned: "ho",
    })
    expect(resolveSymptomText("dau dau")).toEqual({
      kind: "preset",
      key: "headache",
      cleaned: "dau dau",
    })
    expect(resolveSymptomText("fever")).toEqual({
      kind: "preset",
      key: "fever",
      cleaned: "fever",
    })
    expect(resolveSymptomText("đau đầu")).toEqual({
      kind: "preset",
      key: "headache",
      cleaned: "đau đầu",
    })
  })

  it("suggests headache for Vietnamese typo đau dao", () => {
    const result = resolveSymptomText("đau dao")
    expect(result.kind).toBe("suggest")
    if (result.kind === "suggest") {
      expect(result.key).toBe("headache")
      expect(result.score).toBeGreaterThan(0)
    }
  })

  it("suggests a preset for near-miss typos", () => {
    const result = resolveSymptomText("fevr")
    expect(result.kind).toBe("suggest")
    if (result.kind === "suggest") {
      expect(result.key).toBe("fever")
      expect(result.score).toBeGreaterThan(0)
    }
  })

  it("returns custom for unrecognized text", () => {
    expect(resolveSymptomText("random ache")).toEqual({
      kind: "custom",
      cleaned: "random ache",
    })
  })
})

describe("normalizeSymptomsForAi", () => {
  const validItem = (
    overrides: Partial<SelectedSymptomInput> = {}
  ): SelectedSymptomInput => ({
    name: "fever",
    severity: "moderate",
    duration: "1to3days",
    ...overrides,
  })

  it("outputs canonical English names for preset symptoms", () => {
    expect(normalizeSymptomsForAi([validItem({ name: "fever" })])).toEqual([
      { name: "Fever", severity: "moderate", duration: "1to3days" },
    ])
    expect(normalizeSymptomsForAi([validItem({ name: "soreThroat" })])).toEqual([
      { name: "Sore Throat", severity: "moderate", duration: "1to3days" },
    ])
  })

  it("dedupes preset and alias duplicates keeping the latest entry", () => {
    const result = normalizeSymptomsForAi([
      validItem({ name: "fever", severity: "mild", duration: "less24h" }),
      validItem({ name: "sốt", severity: "severe", duration: "3to7days" }),
    ])
    expect(result).toEqual([
      { name: "Fever", severity: "severe", duration: "3to7days" },
    ])
  })

  it("filters items that are too short or have invalid severity/duration", () => {
    expect(
      normalizeSymptomsForAi([
        validItem({ name: "a", severity: "moderate", duration: "1to3days" }),
        validItem({ name: "custom", severity: "bad" as SelectedSymptomInput["severity"], duration: "1to3days" }),
        validItem({ name: "custom", severity: "moderate", duration: "bad" as SelectedSymptomInput["duration"] }),
      ])
    ).toEqual([])
  })

  it("keeps trimmed custom symptom text", () => {
    expect(
      normalizeSymptomsForAi([
        validItem({ name: "  itchy skin  ", severity: "mild", duration: "moreThanWeek" }),
      ])
    ).toEqual([
      { name: "itchy skin", severity: "mild", duration: "moreThanWeek" },
    ])
  })
})
