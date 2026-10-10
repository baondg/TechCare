import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/services/doctor-service", () => ({
  doctorService: {
    getHealthInfo: vi.fn(),
    getHealthInfoHistory: vi.fn(),
    createHealthInfo: vi.fn(),
    updateHealthInfo: vi.fn(),
    deleteHealthInfo: vi.fn(),
    confirmHealthInfo: vi.fn(),
    getPatient: vi.fn(),
    addHealthTrackingSlipToMedicalRecord: vi.fn(),
  },
}))
vi.mock("@/lib/export-health-info-tracking-pdf", () => ({ generateHealthInfoTrackingPdfBlob: vi.fn() }))
// Charts (recharts) and the portal frame are not what this page test is about.
vi.mock("@/components/patient-health-charts", () => ({
  PatientHealthChartsHeader: () => null,
  PatientHealthChartsPanel: () => null,
}))
vi.mock("@/components/patient-layout", () => ({ PatientLayout: ({ children }: { children: React.ReactNode }) => <>{children}</> }))

import { doctorService } from "@/services/doctor-service"
import { generateHealthInfoTrackingPdfBlob } from "@/lib/export-health-info-tracking-pdf"
import HealthInfoPage from "./health-info"

const svc = vi.mocked(doctorService)
const pdfBlob = vi.mocked(generateHealthInfoTrackingPdfBlob)

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

/** Raw MEDICAL_RECORD rows as the backend sends them (snake_case model JSON). */
const draft = {
  id: 31,
  time: "2026-10-10T02:00:00.000Z",
  condition: "Headache",
  height: 170,
  weight: 65,
  blood_pressure: "120/80",
  heart_rate: 72,
  respiratory_rate: 16,
  temperature: 36.8,
  spo2: 98,
  status: "draft",
}
const confirmed = {
  id: 30,
  time: "2026-10-09T02:00:00.000Z",
  condition: "Cough",
  height: 170,
  weight: 66,
  blood_pressure: "130/85",
  heart_rate: 80,
  respiratory_rate: 18,
  temperature: 37.4,
  spo2: 94,
  status: "signed",
  // A record carrying its own list wins over the patient's.
  allergic_info: { drugAllergies: ["Aspirin"] },
}
const patientInfo = {
  blood_type: "O+",
  allergic_info: { drugAllergies: ["Penicillin"], food_allergies: ["Peanut"] },
  medical_history: '{"chronicConditions":["Hypertension"],"vaccinations":["BCG"]}',
}

let container: HTMLDivElement
let root: Root

async function flush() {
  for (let i = 0; i < 5; i++) await act(async () => {})
}

async function renderPage(mode?: "doctor" | "nurse") {
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={["/doctor/medical_records/OP000000012/health-info"]}>
        <Routes>
          <Route path="/doctor/medical_records/:patientId/:tab" element={<HealthInfoPage mode={mode} />} />
        </Routes>
      </MemoryRouter>,
    )
  })
  await flush()
}

const text = () => document.body.textContent ?? ""
const input = (id: string) => document.getElementById(id) as HTMLInputElement
const bodyRows = () => [...document.querySelectorAll("tbody tr")]
const listValues = (label: string) => {
  const section = [...document.querySelectorAll("label")].find((l) => l.textContent === label)!.parentElement!
  return [...section.querySelectorAll("input")].map((i) => i.value)
}

function button(name: string): HTMLButtonElement {
  const found = [...document.querySelectorAll("button")].filter((b) => b.textContent?.trim() === name)
  if (!found.length) throw new Error(`no button "${name}"`)
  return found[found.length - 1] as HTMLButtonElement
}

async function click(el: HTMLElement) {
  await act(async () => el.click())
  await flush()
}

async function type(el: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!
  await act(async () => {
    setter.call(el, value)
    el.dispatchEvent(new Event("input", { bubbles: true }))
  })
}

const rowCheckbox = (rowIndex: number) => bodyRows()[rowIndex].querySelector('input[type="checkbox"]') as HTMLInputElement

beforeEach(() => {
  vi.clearAllMocks()
  svc.getHealthInfo.mockResolvedValue({ success: true, healthInfo: draft, patientInfo } as never)
  svc.getHealthInfoHistory.mockResolvedValue({ success: true, history: [draft, confirmed] } as never)
  svc.createHealthInfo.mockResolvedValue({ success: true } as never)
  svc.updateHealthInfo.mockResolvedValue({ success: true } as never)
  svc.deleteHealthInfo.mockResolvedValue({ success: true, message: "ok" })
  svc.confirmHealthInfo.mockResolvedValue({ success: true, id: 31, status: "confirmed" })
  svc.getPatient.mockResolvedValue({
    success: true,
    patient: { firstName: "An", lastName: "Nguyen", age: 40, gender: "M", latestDiagnosis: { icd10: "I10", interpretation: "Hypertension" } },
  } as never)
  svc.addHealthTrackingSlipToMedicalRecord.mockResolvedValue({ success: true } as never)
  pdfBlob.mockResolvedValue({ blob: new Blob(["%PDF"]), filename: "tracking.pdf" } as never)
  URL.createObjectURL = vi.fn(() => "blob:preview")
  URL.revokeObjectURL = vi.fn()
  vi.stubGlobal("confirm", vi.fn(() => true))
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  document.body.innerHTML = ""
  vi.unstubAllGlobals()
})

describe("EMR health info page", () => {
  it("loads the latest record and the history for the numeric patient id", async () => {
    await renderPage()
    expect(svc.getHealthInfo).toHaveBeenCalledWith(12)
    expect(svc.getHealthInfoHistory).toHaveBeenCalledWith(12, 1, 100)
    expect(bodyRows()).toHaveLength(2)
    expect(bodyRows()[0].textContent).toContain("Headache")
    expect(bodyRows()[0].textContent).toContain("22.5")
    expect(bodyRows()[0].textContent).toContain("Draft")
    expect(bodyRows()[1].textContent).toContain("Confirmed")
    expect(bodyRows()[1].textContent).toContain("94%")
    // Form shows the latest record, lists fall back to the patient's.
    expect(input("height").value).toBe("170")
    expect(input("bpSys").value).toBe("120")
    expect(input("bpDia").value).toBe("80")
    expect(input("bmi").value).toBe("22.5")
    expect(listValues("Drug Allergies")).toEqual(["Penicillin"])
    expect(listValues("Food Allergies")).toEqual(["Peanut"])
    expect(listValues("Chronic Conditions")).toEqual(["Hypertension"])
    expect(listValues("Vaccinations")).toEqual(["BCG"])
    expect(input("height").disabled).toBe(true)
  })

  it("clicking a row loads it into the form; its own list wins over the patient's", async () => {
    await renderPage()
    await click(bodyRows()[1] as HTMLElement)
    expect(input("weight").value).toBe("66")
    expect(input("bpSys").value).toBe("130")
    expect(input("temperature").value).toBe("37.4")
    expect(listValues("Drug Allergies")).toEqual(["Aspirin"])
    expect(listValues("Food Allergies")).toEqual(["Peanut"])
    // Confirmed rows cannot be edited or confirmed again.
    expect(button("Edit").disabled).toBe(true)
    expect(button("Confirm").disabled).toBe(true)
  })

  it("Add starts from the latest record and creates a new one", async () => {
    await renderPage()
    await click(button("Add"))
    expect(input("height").disabled).toBe(false)
    await type(input("weight"), "68")
    await click(button("Save"))
    expect(svc.updateHealthInfo).not.toHaveBeenCalled()
    expect(svc.createHealthInfo).toHaveBeenCalledWith(12, {
      height: 170,
      weight: 68,
      bloodPressureSys: 120,
      bloodPressureDia: 80,
      heartRate: 72,
      respiratoryRate: 16,
      temperature: 36.8,
      spo2: 98,
      // Today: a record has no blood type of its own and the patient's is not used as the fallback.
      currentSymptoms: "- Headache: moderate; 1–3 days",
      drugAllergies: ["Penicillin"],
      foodAllergies: ["Peanut"],
      otherAllergies: [],
      chronicConditions: ["Hypertension"],
      pastSurgeries: [],
      familyHistory: [],
      pastIllnesses: [],
      vaccinations: ["BCG"],
      substanceAbuse: [],
      updatedBy: "Doctor",
    })
    expect(text()).toContain("Health record created successfully.")
    expect(svc.getHealthInfo).toHaveBeenCalledTimes(2)
  })

  it("Edit a draft row updates that record; out-of-range vitals are refused", async () => {
    await renderPage()
    await click(bodyRows()[0] as HTMLElement)
    await click(button("Edit"))
    await type(input("heart-rate"), "999")
    await click(button("Save"))
    expect(svc.updateHealthInfo).not.toHaveBeenCalled()
    await type(input("heart-rate"), "75")
    await click(button("Save"))
    expect(svc.updateHealthInfo).toHaveBeenCalledWith(12, 31, expect.objectContaining({ heartRate: 75, weight: 65 }))
    expect(text()).toContain("Health record updated successfully.")
  })

  it("Confirm a draft row", async () => {
    await renderPage()
    await click(bodyRows()[0] as HTMLElement)
    await click(button("Confirm"))
    expect(svc.confirmHealthInfo).toHaveBeenCalledWith(12, 31)
    expect(text()).toContain("Health record confirmed successfully.")
  })

  it("Delete is only for selected drafts", async () => {
    await renderPage()
    await click(rowCheckbox(1))
    expect(button("Delete").disabled).toBe(true)
    await click(rowCheckbox(1))
    await click(rowCheckbox(0))
    await click(button("Delete"))
    expect(svc.deleteHealthInfo).toHaveBeenCalledTimes(1)
    expect(svc.deleteHealthInfo).toHaveBeenCalledWith(12, 31)
    expect(text()).toContain("1 record(s) deleted successfully.")
  })

  it("symptom filter narrows the table", async () => {
    await renderPage()
    const filters = [...document.querySelectorAll("thead input:not([type])")] as HTMLInputElement[]
    await type(filters[9], "cou")
    await flush()
    expect(bodyRows()).toHaveLength(1)
    expect(bodyRows()[0].textContent).toContain("Cough")
  })

  it("doctor: export the selected rows oldest first, then add the slip to the medical record", async () => {
    await renderPage("doctor")
    await click(rowCheckbox(0))
    await click(rowCheckbox(1))
    await click(button("Export"))
    expect(svc.getPatient).toHaveBeenCalledWith(12)
    const args = pdfBlob.mock.calls[0][0]
    expect(args).toMatchObject({ patientName: "Nguyen An", age: "40", gender: "Male", diagnosis: "I10 - Hypertension" })
    expect(args.rows.map((r) => r.symptoms)).toEqual(["Cough", "Headache"])
    expect(text()).toContain("Health Tracking Slip Preview (PDF)")
    await click(button("Add to Medical record"))
    expect(svc.addHealthTrackingSlipToMedicalRecord).toHaveBeenCalledWith(12, { recordIds: [31, 30] })
    expect(text()).toContain("Health tracking slip added to active medical record.")
  })

  it("nurse: export works but there is no Add to Medical record", async () => {
    await renderPage("nurse")
    await click(rowCheckbox(0))
    await click(button("Export"))
    expect(text()).toContain("Health Tracking Slip Preview (PDF)")
    expect([...document.querySelectorAll("button")].some((b) => b.textContent?.trim() === "Add to Medical record")).toBe(false)
  })
})
