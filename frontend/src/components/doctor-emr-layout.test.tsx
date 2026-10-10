import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/services/doctor-service", () => ({
  doctorService: {
    getPatient: vi.fn(),
    getActiveRegimen: vi.fn(),
    getDepartments: vi.fn(),
    getActiveRegimenDocuments: vi.fn(),
    createFollowUpReexamSlip: vi.fn(),
    createPatientTransfer: vi.fn(),
    closeOpenVisitRegimen: vi.fn(),
  },
}))
vi.mock("@/services/appointment-service", () => ({
  appointmentService: { getClinicRooms: vi.fn() },
}))
// The layout is under test, not the portal chrome or the tab pages (each loads its own data).
vi.mock("./doctor-layout", () => ({ DoctorLayout: ({ children }: { children: React.ReactNode }) => <>{children}</> }))
vi.mock("@/pages/doctor/medical-records/dashboard", () => ({ default: () => <div>tab:dashboard</div> }))
vi.mock("@/pages/doctor/medical-records/health-info", () => ({ default: () => <div>tab:health-info</div> }))
vi.mock("@/pages/doctor/medical-records/prescription", () => ({ default: () => <div>tab:prescription</div> }))
vi.mock("@/pages/doctor/medical-records/diagnosis", () => ({ default: () => <div>tab:diagnosis</div> }))
vi.mock("@/pages/doctor/medical-records/surgery", () => ({ default: () => <div>tab:surgery</div> }))
vi.mock("@/pages/doctor/medical-records/lab", () => ({ default: () => <div>tab:lab</div> }))
vi.mock("@/pages/doctor/medical-records/history", () => ({ default: () => <div>tab:history</div> }))

import { doctorService } from "@/services/doctor-service"
import { appointmentService } from "@/services/appointment-service"
import { DoctorEmrLayout } from "./doctor-emr-layout"

const svc = vi.mocked(doctorService)
const rooms = vi.mocked(appointmentService)

// Node ≥ 25 ships its own (disabled) global localStorage, which hides jsdom's: use an in-memory one.
function memoryStorage(): Storage {
  const items = new Map<string, string>()
  return {
    get length() {
      return items.size
    },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (index) => [...items.keys()][index] ?? null,
    removeItem: (key) => void items.delete(key),
    setItem: (key, value) => void items.set(key, String(value)),
  }
}

const patient = {
  id: 12,
  username: "pat12",
  firstName: "An",
  lastName: "Nguyen",
  age: 40,
  gender: "M",
  bmi: 22.1,
  inDepartment: "Cardiology",
  latestDiagnosis: { icd10: "I10", interpretation: "Hypertension", department: "Cardiology" },
  dateOfBirth: "1985-03-04",
  healthInsuranceId: "DN4797912345678",
  healthInsuranceExpiredDate: "2027-12-31",
}

// Tell React these renders are wrapped in act().
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

let container: HTMLDivElement
let root: Root

async function flush() {
  for (let i = 0; i < 5; i++) await act(async () => {})
}

async function renderLayout() {
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={["/doctor/medical_records/OP000000012/dashboard"]}>
        <Routes>
          <Route path="/doctor/medical_records/:patientId/:tab" element={<DoctorEmrLayout />} />
        </Routes>
      </MemoryRouter>,
    )
  })
  await flush()
}

function button(name: string): HTMLButtonElement {
  const found = [...document.querySelectorAll("button")].filter((b) => b.textContent?.trim() === name)
  if (!found.length) throw new Error(`no button "${name}"`)
  return found[found.length - 1] as HTMLButtonElement
}

async function click(name: string) {
  await act(async () => button(name).click())
  await flush()
}

async function type(selector: string, value: string) {
  const el = document.querySelector(selector) as HTMLTextAreaElement
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!
  await act(async () => {
    setter.call(el, value)
    el.dispatchEvent(new Event("input", { bubbles: true }))
  })
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(new Date("2026-10-11T08:30:00"))
  vi.stubGlobal("localStorage", memoryStorage())
  localStorage.setItem("user", JSON.stringify({ id: 5, firstName: "Binh", lastName: "Tran", role: "doctor" }))
  vi.clearAllMocks()
  svc.getPatient.mockResolvedValue({ success: true, patient } as never)
  svc.getActiveRegimen.mockResolvedValue({ success: true, active: { regimenId: 9, startAt: "2026-10-11T08:00:00" }, checkInRoom: { id: 3, name: "Room 3" } } as never)
  svc.getDepartments.mockResolvedValue({ success: true, departments: [{ id: 1, name: "Cardiology" }] } as never)
  svc.getActiveRegimenDocuments.mockResolvedValue({
    success: true,
    regimen: { prescriptions: [], diagnoses: [{ id: 1, icd10: "I10", interpretation: "Hypertension", diagnosedAt: "2026-10-11T08:10:00" }], labTests: [], surgeries: [], hospitalTransfers: [], followUpReexamSlips: [], healthTrackingSlips: [], treatments: [] },
  } as never)
  svc.createFollowUpReexamSlip.mockResolvedValue({ success: true } as never)
  svc.createPatientTransfer.mockResolvedValue({ success: true } as never)
  svc.closeOpenVisitRegimen.mockResolvedValue({ success: true, regimenId: 9 })
  rooms.getClinicRooms.mockResolvedValue([
    { id: 3, name: "Room 3", departmentId: 1, departmentName: "Cardiology" },
    { id: 4, name: "Room 4", departmentId: 2, departmentName: "Neurology" },
  ])
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  document.body.innerHTML = ""
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe("DoctorEmrLayout", () => {
  it("loads the patient banner, visit state and departments for the route patient", async () => {
    await renderLayout()
    expect(svc.getPatient).toHaveBeenCalledWith("OP000000012")
    expect(svc.getActiveRegimen).toHaveBeenCalledWith("OP000000012")
    expect(svc.getDepartments).toHaveBeenCalledTimes(2)
    expect(document.body.textContent).toContain("Nguyen An | 40 Male | BMI: 22.1")
    expect(document.body.textContent).toContain("Diagnosis: I10 - Hypertension")
    expect(document.body.textContent).toContain("tab:dashboard")
    expect(button("Finish examination").disabled).toBe(false)
  })

  it("finish with no extra document: step 2 lists the regimen documents, then closes the visit", async () => {
    await renderLayout()
    await click("Finish examination")
    expect(document.body.textContent).toContain("Finish examination (1/2)")
    await click("Continue")
    expect(svc.getActiveRegimenDocuments).toHaveBeenCalledWith("OP000000012")
    expect(document.body.textContent).toContain("Finish examination (2/2)")
    expect(document.body.textContent).toContain("I10 - Hypertension")
    expect(document.body.textContent).toContain("No additional document added.")
    await click("Finish examination")
    expect(svc.closeOpenVisitRegimen).toHaveBeenCalledWith("OP000000012")
    expect(svc.createFollowUpReexamSlip).not.toHaveBeenCalled()
    expect(svc.createPatientTransfer).not.toHaveBeenCalled()
  })

  it("follow-up slip: saved with next week's date, 09:00 and the patient's department", async () => {
    await renderLayout()
    await click("Finish examination")
    await click("Add follow-up slip")
    await type("#fu-symptoms", "Recheck blood pressure")
    await click("Continue")
    expect(svc.createFollowUpReexamSlip).toHaveBeenCalledTimes(1)
    const [id, slip] = svc.createFollowUpReexamSlip.mock.calls[0]
    expect(id).toBe("OP000000012")
    expect(slip).toEqual({
      patientName: "Nguyen An",
      genderLabel: "Nam",
      dateOfBirthDisplay: "04/03/1985",
      address: "—",
      insuranceCardParts: expect.any(Array),
      insuranceValidFromDisplay: "..../..../........",
      insuranceValidToDisplay: "31/12/2027",
      examDateDisplay: "11/10/2026",
      admissionDateDisplay: "..../..../........",
      dischargeDateDisplay: "..../..../........",
      diagnosis: "I10 — Hypertension",
      comorbidities: "Recheck blood pressure",
      revisitDay: "18",
      revisitMonth: "10",
      revisitYear: "2026",
      appointmentTimeLabel: "09:00",
      departmentLabel: "Cardiology",
      footerPlaceLine: "………………",
      footerDay: "11",
      footerMonth: "10",
      footerYear: "2026",
      doctorDisplayName: "Tran Binh",
    })
    expect(document.body.textContent).toContain("Follow-up slip saved: 2026-10-18 09:00 — Cardiology")
  })

  it("hospital transfer without a reason is refused", async () => {
    await renderLayout()
    await click("Finish examination")
    await click("Transfer to other hospital")
    await click("Continue")
    expect(svc.createPatientTransfer).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain("Reason is required.")
  })

  it("clinic transfer: from the check-in room to the other room", async () => {
    await renderLayout()
    await click("Transfer clinic")
    expect(rooms.getClinicRooms).toHaveBeenCalled()
    await type("#tr-reason", "Needs neurology review")
    await click("Save transfer")
    expect(svc.createPatientTransfer).toHaveBeenCalledWith("OP000000012", {
      kind: "clinic",
      reason: "Needs neurology review",
      note: undefined,
      fromRoomId: 3,
      toRoomId: 4,
    })
    expect(document.body.textContent).toContain("Transfer recorded.")
  })
})
