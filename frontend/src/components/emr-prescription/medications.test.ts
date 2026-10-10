import { describe, expect, it } from "vitest"
import {
  applyPickedMedicine,
  dropRowIfEmpty,
  emptyMed,
  prescriptionDuration,
  removeMedication,
  setMedicationField,
  validateDraft,
  type Medication,
} from "./medications"

const med = (name: string, extra: Partial<Medication> = {}): Medication => ({ ...emptyMed(), name, ...extra })

describe("prescription draft rows", () => {
  it("naming the blank last row adds a new blank row; other edits do not", () => {
    expect(setMedicationField([emptyMed()], 0, "name", "A")).toHaveLength(2)
    expect(setMedicationField([emptyMed()], 0, "quantity", "3")).toHaveLength(1)
    expect(setMedicationField([med("A"), emptyMed()], 0, "name", "B")).toHaveLength(2)
  })

  it("a catalogue pick sets name and lower-cased unit", () => {
    const [first] = applyPickedMedicine([emptyMed()], 0, { id: 1, name: "Saline", unit: " ML " } as never)
    expect(first).toMatchObject({ name: "Saline", unit: "ml" })
  })

  it("the blank last row cannot be removed; an emptied row is dropped on blur", () => {
    const rows = [med("A"), emptyMed()]
    expect(removeMedication(rows, 1)).toBe(rows)
    expect(removeMedication(rows, 0)).toEqual([emptyMed()])
    expect(dropRowIfEmpty([emptyMed(), med("B"), emptyMed()], 0)).toEqual([med("B"), emptyMed()])
    expect(dropRowIfEmpty(rows, 0)).toBe(rows)
  })

  it("validation: needs a name, then qty and usage on every filled row; note only when given", () => {
    expect(validateDraft([emptyMed()])).toEqual({ error: "Add at least one medication with a name" })
    expect(validateDraft([med("A", { quantity: "1", usage: "u" }), med("B", { quantity: "2" })])).toEqual({
      error: "Please complete Medication, Qty, and Usage on row 2",
    })
    const ok = validateDraft([med(" A ", { quantity: " 1 ", usage: " u ", duration: " ", note: " n " }), emptyMed()])
    expect(ok).toEqual({ lines: [{ name: "A", quantity: "1", unit: "tablet", duration: "7", usage: "u", note: "n" }] })
  })

  it("prescription duration is the longest line; unreadable lines count as 7", () => {
    const line = (duration: string) => ({ name: "A", quantity: "1", unit: "tablet", duration, usage: "u" })
    expect(prescriptionDuration([line("3"), line("10")])).toBe(10)
    expect(prescriptionDuration([line("x"), line("2")])).toBe(7)
  })
})
