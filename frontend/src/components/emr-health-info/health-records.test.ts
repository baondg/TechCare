import { describe, expect, it } from "vitest"
import { patientDefaults, toHealthRecord } from "./health-records"

describe("health records", () => {
  it("list fields: own field (array or JSON-array string) wins, else the blob, snake_case accepted", () => {
    const r = toHealthRecord({
      id: 1,
      time: "2026-10-01T00:00:00.000Z",
      drug_allergies: '[" Aspirin ", "", 3]',
      allergic_info: '{"drugAllergies":["Ignored"],"other_allergies":"Latex"}',
      medicalHistory: { pastSurgeries: ["Appendectomy"] },
    })
    expect(r.drugAllergies).toEqual(["Aspirin"])
    expect(r.otherAllergies).toEqual(["Latex"])
    expect(r.pastSurgeries).toEqual(["Appendectomy"])
    expect(r.foodAllergies).toEqual([])
  })

  it("an unreadable blob counts as empty", () => {
    expect(patientDefaults({ blood_type: "o", allergic_info: "{not json" })).toMatchObject({
      bloodType: "O+",
      lists: { drugAllergies: [], vaccinations: [] },
    })
  })

  it("record status: signed / confirmed → confirmed, anything else → draft", () => {
    expect(toHealthRecord({ id: 1, status: "SIGNED" }).status).toBe("confirmed")
    expect(toHealthRecord({ id: 1, status: "pending" }).status).toBe("draft")
  })
})
