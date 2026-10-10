import { useTranslation } from "react-i18next"
import { Trash2 } from "lucide-react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { medicationUnitLabelVi } from "@/lib/medication-units-vi"
import { MedicineNameCombobox } from "./medicine-name-combobox"
import { UsageTypeaheadInput } from "./usage-typeahead-input"
import {
  applyPickedMedicine,
  dropRowIfEmpty,
  removeMedication,
  setMedicationField,
  type Medication,
  type UiPrescription,
} from "./medications"

const INPUT = "h-7 w-full box-border rounded border border-slate-200 px-1.5 text-xs leading-tight"

/** Lines of a prescription: editable rows for the draft, read-only rows (and the doctor) for a saved one. */
export function MedicationTable({
  rx,
  draft,
  onDraftChange,
  editable,
  saving,
}: {
  rx: UiPrescription
  draft: Medication[]
  /** Receives an updater so quick successive edits compose. */
  onDraftChange: (update: (meds: Medication[]) => Medication[]) => void
  /** False without an active visit. */
  editable: boolean
  saving: boolean
}) {
  const { t } = useTranslation()
  const set = (index: number, field: keyof Medication, value: string) =>
    onDraftChange((meds) => setMedicationField(meds, index, field, value))
  const textCell = (index: number, field: "quantity" | "note", value: string | undefined, placeholder: string) => (
    <input
      className={INPUT}
      value={value}
      placeholder={placeholder}
      disabled={!editable}
      onChange={(e) => set(index, field, e.target.value)}
      onInput={(e) => set(index, field, (e.target as HTMLInputElement).value)}
      onBlur={(e) => set(index, field, e.target.value)}
    />
  )

  return (
    <div className="relative overflow-x-hidden border rounded-lg">
      <Table className="relative z-0 w-full table-fixed text-xs">
        <TableHeader>
          <TableRow style={{ background: "linear-gradient(135deg, #06b6d4 0%, #0891b2 50%, #06b6d4 100%)" }}>
            <TableHead className="w-8 p-1.5 text-center text-white">{t("doctor.prescription.tableNo")}</TableHead>
            <TableHead className="w-[18%] min-w-0 p-1.5 text-left text-white">
              {t("doctor.prescription.medication")} <span className="text-red-500">*</span>
            </TableHead>
            <TableHead className="w-[9%] p-1.5 text-white">
              {t("doctor.prescription.qty")} <span className="text-red-500">*</span>
            </TableHead>
            <TableHead className="w-[10%] p-1.5 text-white">{t("doctor.prescription.unit")}</TableHead>
            <TableHead className="w-[9%] p-1.5 text-white">
              {t("doctor.prescription.duration")} <span className="text-red-500">*</span>
            </TableHead>
            <TableHead className="min-w-0 p-1.5 text-white">
              {t("doctor.prescription.usage")} <span className="text-red-500">*</span>
            </TableHead>
            <TableHead className="min-w-0 p-1.5 text-white">{t("doctor.prescription.note")}</TableHead>
            <TableHead className="w-7 p-1 text-center text-white" aria-label={t("doctor.prescription.removeRow")} />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rx.isDraft
            ? draft.map((med, index) => (
                <TableRow key={index} className="border-t" onBlur={() => onDraftChange((meds) => dropRowIfEmpty(meds, index))}>
                  <TableCell className="p-0.5 text-center align-middle text-xs tabular-nums">{index + 1}</TableCell>
                  <TableCell className="max-w-0 p-0.5 align-middle">
                    <MedicineNameCombobox
                      value={med.name}
                      onChange={(v) => set(index, "name", v)}
                      onMedicinePickOrResolve={(m) => onDraftChange((meds) => applyPickedMedicine(meds, index, m))}
                      disabled={saving || !editable}
                    />
                  </TableCell>
                  <TableCell className="p-0.5 align-middle">
                    {textCell(index, "quantity", med.quantity, t("doctor.prescription.qtyPlaceholder"))}
                  </TableCell>
                  <TableCell className="p-0.5 align-middle">
                    <input
                      readOnly
                      disabled
                      className={`${INPUT} cursor-not-allowed bg-slate-100 text-slate-700`}
                      value={medicationUnitLabelVi(med.unit)}
                      title={t("doctor.prescription.unitFromCatalogHint")}
                    />
                  </TableCell>
                  <TableCell className="p-0.5 align-middle">
                    <input
                      type="number"
                      min={1}
                      className={INPUT}
                      value={med.duration}
                      placeholder={t("doctor.prescription.daysPlaceholder")}
                      title={t("doctor.prescription.durationDaysHint")}
                      disabled={!editable}
                      onChange={(e) => set(index, "duration", e.target.value)}
                      onInput={(e) => set(index, "duration", (e.target as HTMLInputElement).value)}
                      onBlur={(e) => set(index, "duration", e.target.value)}
                    />
                  </TableCell>
                  <TableCell className="p-0.5 align-middle">
                    <UsageTypeaheadInput
                      value={med.usage}
                      onChange={(v) => set(index, "usage", v)}
                      quantity={med.quantity}
                      duration={med.duration}
                      unit={med.unit}
                      disabled={!editable}
                    />
                  </TableCell>
                  <TableCell className="p-0.5 align-middle">
                    {textCell(index, "note", med.note, t("doctor.prescription.notePlaceholder"))}
                  </TableCell>
                  <TableCell className="w-7 p-0.5 text-center align-middle">
                    {index !== draft.length - 1 && (
                      <button
                        type="button"
                        onClick={() => onDraftChange((meds) => removeMedication(meds, index))}
                        disabled={!editable}
                        className="inline-flex h-7 w-6 shrink-0 items-center justify-center rounded text-red-500 hover:bg-red-50 disabled:opacity-40"
                        title={t("doctor.prescription.removeMedHint")}
                      >
                        <Trash2 className="h-3.5 w-3.5 " strokeWidth={2} aria-hidden />
                      </button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            : rx.medications.map((med, index) => (
                <TableRow key={index} className="border-t hover:bg-slate-50">
                  <TableCell className="p-0.5 text-center align-middle text-xs tabular-nums">{index + 1}</TableCell>
                  <TableCell className="p-0.5 align-middle text-xs">{med.name}</TableCell>
                  <TableCell className="p-0.5 text-center align-middle text-xs">{med.quantity}</TableCell>
                  <TableCell className="p-0.5 align-middle text-xs">{medicationUnitLabelVi(med.unit)}</TableCell>
                  <TableCell className="p-0.5 text-center align-middle text-xs tabular-nums">
                    {med.duration || t("common.notAvailable")}
                  </TableCell>
                  <TableCell className="p-0.5 align-middle text-xs">{med.usage}</TableCell>
                  <TableCell className="p-0.5 align-middle text-xs">{med.note ?? t("common.notAvailable")}</TableCell>
                  <TableCell className="w-7 p-0.5" />
                </TableRow>
              ))}
        </TableBody>
      </Table>
      {!rx.isDraft ? (
        <div className="relative z-[1] flex items-start gap-3 border-t border-slate-200 bg-cyan-50/80 px-4 py-3">
          <div className="min-w-0">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{t("doctor.prescription.doctorLabel")}</div>
            <div className="text-base font-semibold text-slate-900">{rx.doctor}</div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
