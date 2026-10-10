import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/services/doctor-service", () => ({
  doctorService: {
    getPrescriptions: vi.fn(),
    getPatient: vi.fn(),
    getDiagnoses: vi.fn(),
    getMedicines: vi.fn(),
    getHealthInfo: vi.fn(),
    createPrescription: vi.fn(),
    getAiMedicineSuggestions: vi.fn(),
    getSignature: vi.fn(),
    saveSignature: vi.fn(),
  },
}))
vi.mock("@/services/profile-service", () => ({ profileService: { getProfile: vi.fn() } }))
vi.mock("@/lib/export-prescription-pdf", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/export-prescription-pdf")>()),
  generatePrescriptionPdfBlob: vi.fn(),
}))
// jsdom has no canvas: a pad with plain Save / Cancel buttons.
vi.mock("@/components/signature-pad", () => ({
  SignaturePad: ({ onSave, onCancel }: { onSave: (url: string) => void; onCancel: () => void }) => (
    <div>
      <button type="button" onClick={() => onSave("data:image/png;base64,SIG")}>pad-save</button>
      <button type="button" onClick={onCancel}>pad-cancel</button>
    </div>
  ),
}))

import { doctorService } from "@/services/doctor-service"
import { profileService } from "@/services/profile-service"
import { generatePrescriptionPdfBlob } from "@/lib/export-prescription-pdf"
import { EmrSessionProvider } from "@/contexts/emr-session-context"
import PatientPrescription from "./prescription"

const svc = vi.mocked(doctorService)
const profile = vi.mocked(profileService)
const pdfBlob = vi.mocked(generatePrescriptionPdfBlob)

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const patient = {
  id: 12,
  firstName: "An",
  lastName: "Nguyen",
  age: 40,
  gender: "M",
  bmi: 22.1,
  dateOfBirth: "1985-03-04",
  phone: "0901234567",
  idCard: "079085000123",
  healthInsuranceId: "DN4797912345678",
  latestDiagnosis: { icd10: "I10", interpretation: "Hypertension", department: "Cardiology" },
}
const saved = {
  id: 7,
  createdAt: "2026-10-01T03:00:00.000Z",
  doctorName: "Dr. Binh",
  medications: [{ name: "Amlodipine 5mg", quantity: "30", unit: "Tablet", duration: 30, usage: "1 tablet daily", note: "" }],
  byt: { code: "TC001-ABC", prescriptionType: "C", facilityCode: "TC001", facilityPhone: "0281234567", advice: "Low salt" },
}

let container: HTMLDivElement
let root: Root
const events: { type: string; detail: unknown }[] = []
const record = (e: Event) => events.push({ type: e.type, detail: (e as CustomEvent).detail })

async function flush() {
  for (let i = 0; i < 6; i++) await act(async () => {})
}

async function renderPage(mutationsAllowed = true) {
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={["/doctor/medical_records/OP000000012/prescription"]}>
        <EmrSessionProvider value={{ visitLoading: false, visitActive: mutationsAllowed, mutationsAllowed, refreshPatientBanner: () => {} }}>
          <Routes>
            <Route path="/doctor/medical_records/:patientId/:tab" element={<PatientPrescription />} />
          </Routes>
        </EmrSessionProvider>
      </MemoryRouter>,
    )
  })
  await flush()
}

const text = () => document.body.textContent ?? ""

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

/** Inputs of draft row `i`: name (combobox), qty, unit, duration, usage, note. */
function draftRow(i: number) {
  const row = document.querySelectorAll("tbody")[1].querySelectorAll("tr")[i]
  const inputs = [...row.querySelectorAll("input")] as HTMLInputElement[]
  return { name: inputs[0], qty: inputs[1], unit: inputs[2], duration: inputs[3], usage: inputs[4], note: inputs[5] }
}
const draftRowCount = () => document.querySelectorAll("tbody")[1].querySelectorAll("tr").length

async function fillRow(i: number, name: string, qty: string, usage: string) {
  await type(draftRow(i).name, name)
  await type(draftRow(i).qty, qty)
  await type(draftRow(i).usage, usage)
}

beforeEach(() => {
  vi.clearAllMocks()
  events.length = 0
  window.addEventListener("emr:prescription-draft-state", record)
  window.addEventListener("emr:prescription-saved", record)
  svc.getPrescriptions.mockResolvedValue({ success: true, prescriptions: [saved] } as never)
  svc.getPatient.mockResolvedValue({ success: true, patient } as never)
  svc.getDiagnoses.mockResolvedValue({
    success: true,
    diagnoses: [
      { icd10: "J06", interpretation: "Upper respiratory infection", createdAt: "2026-10-10T01:00:00Z" },
      { icd10: "I10", interpretation: "Hypertension", createdAt: "2026-09-01T01:00:00Z" },
    ],
  } as never)
  svc.getMedicines.mockResolvedValue({ success: true, medicines: [] } as never)
  svc.getHealthInfo.mockResolvedValue({ success: true, healthInfo: { weight: 65 } } as never)
  svc.createPrescription.mockResolvedValue({ success: true, prescription: { id: 8 } } as never)
  svc.getSignature.mockResolvedValue({ success: true, signature: "data:image/png;base64,SAVED" })
  svc.saveSignature.mockResolvedValue({ success: true })
  profile.getProfile.mockResolvedValue({ userId: 12, relativeName: "Nguyen Mai", relativePhone: "0907654321" })
  pdfBlob.mockResolvedValue({ blob: new Blob(["%PDF"]), filename: "rx.pdf" } as never)
  URL.createObjectURL = vi.fn(() => "blob:rx")
  URL.revokeObjectURL = vi.fn()
})

afterEach(() => {
  window.removeEventListener("emr:prescription-draft-state", record)
  window.removeEventListener("emr:prescription-saved", record)
  act(() => root.unmount())
  container.remove()
  document.body.innerHTML = ""
})

describe("EMR prescription page", () => {
  it("lists the patient's prescriptions; a row shows its medications and doctor", async () => {
    await renderPage()
    expect(svc.getPrescriptions).toHaveBeenCalledWith("OP000000012")
    expect(svc.getPatient).toHaveBeenCalledWith("OP000000012")
    const historyRow = document.querySelectorAll("tbody")[0].querySelector("tr") as HTMLElement
    expect(historyRow.textContent).toContain("Dr. Binh")
    await click(historyRow)
    expect(text()).toContain("Amlodipine 5mg")
    expect(text()).toContain("1 tablet daily")
    // The most recent diagnosis, not the patient's banner one.
    expect(text()).toContain("J06 — Upper respiratory infection")
  })

  it("add + save: rows grow as names are typed; payload, duration = longest line, events", async () => {
    await renderPage()
    await click(button("doctor.prescription.add"))
    expect(draftRowCount()).toBe(1)
    await fillRow(0, "Paracetamol 500mg", "20", "2 tablets daily")
    expect(draftRowCount()).toBe(2)
    await type(draftRow(0).duration, "5")
    await fillRow(1, "Loratadine 10mg", "10", "1 tablet daily")
    await type(draftRow(1).duration, "10")
    expect(events.filter((e) => e.type === "emr:prescription-draft-state").at(-1)?.detail).toMatchObject({
      patientId: "OP000000012",
      hasUnsavedChanges: true,
    })
    await click(button("doctor.prescription.save"))
    expect(svc.createPrescription).toHaveBeenCalledTimes(1)
    const [id, body] = svc.createPrescription.mock.calls[0]
    expect(id).toBe("OP000000012")
    expect(body).toMatchObject({
      department: "Upper respiratory infection",
      duration: 10,
      medications: [
        { name: "Paracetamol 500mg", quantity: "20", unit: "tablet", duration: "5", usage: "2 tablets daily" },
        { name: "Loratadine 10mg", quantity: "10", unit: "tablet", duration: "10", usage: "1 tablet daily" },
      ],
      byt: { contactPhone: expect.any(String), patientWeightKg: expect.any(String) },
    })
    expect(Object.keys(body.medications[0])).not.toContain("note")
    expect(events.some((e) => e.type === "emr:prescription-saved" && (e.detail as { prescriptionId: string }).prescriptionId === "8")).toBe(true)
    expect(text()).toContain("doctor.prescription.saveSuccess")
    expect(svc.getPrescriptions).toHaveBeenCalledTimes(2)
  })

  it("save refuses a line without usage", async () => {
    await renderPage()
    await click(button("doctor.prescription.add"))
    await type(draftRow(0).name, "Paracetamol 500mg")
    await type(draftRow(0).qty, "20")
    await click(button("doctor.prescription.save"))
    expect(svc.createPrescription).not.toHaveBeenCalled()
    expect(text()).toContain("Please complete Medication, Qty, and Usage on row 1")
  })

  it("inherit copies the selected prescription into a new draft; cancel goes back to it", async () => {
    await renderPage()
    await click(document.querySelectorAll("tbody")[0].querySelector("tr") as HTMLElement)
    await click(button("doctor.prescription.inherit"))
    expect(draftRowCount()).toBe(2)
    expect(draftRow(0).name.value).toBe("Amlodipine 5mg")
    expect(draftRow(0).duration.value).toBe("30")
    expect(draftRow(0).usage.value).toBe("1 tablet daily")
    await click(button("doctor.prescription.cancel"))
    expect(text()).toContain("Dr. Binh")
    expect(document.querySelectorAll("tbody")[1].querySelectorAll("input")).toHaveLength(0)
  })

  it("AI suggestion fills the draft from the most recent diagnosis", async () => {
    svc.getAiMedicineSuggestions.mockResolvedValue({
      success: true,
      suggestions: [{ name: "Cetirizine 10mg", quantity: 7, unit: "Tablet", duration: "0", usage: "1 at night", note: "" }],
    } as never)
    await renderPage()
    await click(button("doctor.prescription.add"))
    await click(button("doctor.prescription.aiSuggest"))
    expect(svc.getAiMedicineSuggestions).toHaveBeenCalledWith(
      expect.objectContaining({ diagnosis: "J06 — Upper respiratory infection", symptoms: "J06 — Upper respiratory infection" }),
    )
    expect(draftRowCount()).toBe(2)
    expect(draftRow(0).name.value).toBe("Cetirizine 10mg")
    expect(draftRow(0).qty.value).toBe("7")
    // A duration under 1 day becomes the default 7.
    expect(draftRow(0).duration.value).toBe("7")
  })

  it("export PDF of a saved prescription uses the saved signature", async () => {
    await renderPage()
    await click(document.querySelectorAll("tbody")[0].querySelector("tr") as HTMLElement)
    await click(button("doctor.prescription.exportPdf"))
    expect(pdfBlob).toHaveBeenCalledTimes(1)
    const args = pdfBlob.mock.calls[0][0]
    expect(args).toMatchObject({
      prescriptionDateIso: "2026-10-01T03:00:00.000Z",
      doctorName: "Dr. Binh",
      signatureStatus: "signed",
      signatureDataUrl: "data:image/png;base64,SAVED",
      medications: [{ name: "Amlodipine 5mg", quantity: "30", duration: "30", usage: "1 tablet daily" }],
      byt: { code: "TC001-ABC", prescriptionType: "C", facilityCode: "TC001", advice: "Low salt", patientIdCard: "079085000123" },
    })
    expect(args.patient.latestDiagnosis).toMatchObject({ icd10: "J06", interpretation: "Upper respiratory infection" })
    expect(text()).toContain("doctor.prescription.pdfPreviewSuccess")
  })

  it("export without a saved signature asks for one; cancelling stops the export", async () => {
    svc.getSignature.mockResolvedValue({ success: true, signature: null })
    await renderPage()
    await click(document.querySelectorAll("tbody")[0].querySelector("tr") as HTMLElement)
    await click(button("doctor.prescription.exportPdf"))
    expect(text()).toContain("doctor.prescription.signatureDialogTitle")
    await click(button("pad-cancel"))
    expect(pdfBlob).not.toHaveBeenCalled()
    expect(text()).toContain("doctor.prescription.signatureExportCancelled")
  })

  it("export without a saved signature: drawing one saves it and continues the export", async () => {
    svc.getSignature.mockResolvedValue({ success: true, signature: null })
    await renderPage()
    await click(document.querySelectorAll("tbody")[0].querySelector("tr") as HTMLElement)
    await click(button("doctor.prescription.exportPdf"))
    await click(button("pad-save"))
    expect(svc.saveSignature).toHaveBeenCalledWith("data:image/png;base64,SIG")
    expect(pdfBlob.mock.calls[0][0].signatureDataUrl).toBe("data:image/png;base64,SIG")
  })

  it("change signature: opens with the saved one, saving shows a success toast", async () => {
    await renderPage()
    await click(button("doctor.prescription.editSignature"))
    expect(text()).toContain("doctor.prescription.signatureEditDialogTitle")
    await click(button("pad-save"))
    expect(svc.saveSignature).toHaveBeenCalledWith("data:image/png;base64,SIG")
    expect(text()).toContain("doctor.prescription.signatureUpdateSuccess")
  })

  it("a child under 72 months needs a weight before saving", async () => {
    svc.getPatient.mockResolvedValue({ success: true, patient: { ...patient, dateOfBirth: "2024-01-01" } } as never)
    svc.getHealthInfo.mockResolvedValue({ success: true, healthInfo: null } as never)
    await renderPage()
    await click(button("doctor.prescription.add"))
    await fillRow(0, "Paracetamol 250mg", "10", "1 sachet")
    await click(button("doctor.prescription.save"))
    expect(svc.createPrescription).not.toHaveBeenCalled()
    expect(text()).toContain("Cập nhật cân nặng bệnh nhân trong Health Info (trẻ dưới 72 tháng)")
  })

  it("a child under 72 months with a weight is saved (BYT data fetched once)", async () => {
    svc.getPatient.mockResolvedValue({ success: true, patient: { ...patient, dateOfBirth: "2024-01-01" } } as never)
    await renderPage()
    await click(button("doctor.prescription.add"))
    await fillRow(0, "Paracetamol 250mg", "10", "1 sachet")
    await click(button("doctor.prescription.save"))
    expect(svc.createPrescription).toHaveBeenCalledTimes(1)
    expect(svc.createPrescription.mock.calls[0][1].byt).toMatchObject({ patientWeightKg: "65", contactPhone: expect.any(String) })
    expect(svc.getHealthInfo).toHaveBeenCalledTimes(1)
    expect(profile.getProfile).toHaveBeenCalledTimes(1)
  })

  it("without an active visit nothing can be added", async () => {
    await renderPage(false)
    expect(button("doctor.prescription.add").disabled).toBe(true)
  })
})
