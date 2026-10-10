import { useTranslation } from "react-i18next"
import { Activity, AlertCircle, FileText, Heart, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { CollapsibleSection } from "@/components/collapsible-section"
import { PatientSymptomEntriesEditor } from "@/components/patient-symptom-entries-editor"
import { PATIENT_BLOOD_TYPES, PATIENT_BLOOD_TYPE_UNSET } from "@/lib/patient-blood-types"
import { vitalNumericError } from "@/lib/vital-signs-limits"
import { LIST_FIELDS, bmiOf, type HealthForm, type ListKey, type Vitals } from "./health-records"

function VitalWarning({ message }: { message: string | null }) {
  if (!message) return null
  return <span className="text-sm text-red-600 block mt-0.5">{message}</span>
}

function InputList({
  label,
  values,
  onChange,
  disabled,
}: {
  label: string
  values: string[]
  onChange: (v: string[]) => void
  disabled: boolean
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="space-y-2">
        {values.map((v, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input
              value={v}
              disabled={disabled}
              onChange={(e) => onChange(values.map((old, j) => (j === i ? e.target.value : old)))}
              className="flex-1"
            />
            {!disabled && (
              <button
                type="button"
                onClick={() => onChange(values.filter((_, j) => j !== i))}
                className="p-2 rounded-md hover:bg-red-100 text-red-600 transition"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}
      </div>
      {!disabled && (
        <Button type="button" variant="outline" size="sm" className="mt-1 flex items-center gap-2" onClick={() => onChange([...values, ""])}>
          + Add
        </Button>
      )}
    </div>
  )
}

/** Single-value vitals, in the order they are laid out (blood pressure is a pair, shown first). */
const VITAL_INPUTS: { key: keyof Vitals; id: string; label: string; number?: boolean }[] = [
  { key: "spo2", id: "oxygen", label: "Blood Oxygen (SpO2 %)" },
  { key: "temperature", id: "temperature", label: "Body Temperature (°C)" },
  { key: "height", id: "height", label: "Height (cm)", number: true },
  { key: "respiratoryRate", id: "respiratory", label: "Respiratory Rate (breaths/min)" },
  { key: "weight", id: "weight", label: "Weight (kg)", number: true },
  { key: "heartRate", id: "heart-rate", label: "Heart Rate (bpm)" },
]

/** Vital signs, blood type, allergies, symptoms and medical history of one health record. */
export function HealthInfoForm({
  form,
  onChange,
  disabled,
}: {
  form: HealthForm
  onChange: (patch: Partial<HealthForm>) => void
  disabled: boolean
}) {
  const { t } = useTranslation()

  const vitalInput = (key: keyof Vitals, id: string, type?: string) => (
    <Input
      id={id}
      value={form[key]}
      onChange={(e) => onChange({ [key]: e.target.value })}
      onInput={(e) => onChange({ [key]: (e.target as HTMLInputElement).value })}
      onBlur={(e) => onChange({ [key]: e.target.value })}
      disabled={disabled}
      type={type}
    />
  )
  const setList = (key: ListKey, values: string[]) => onChange({ lists: { ...form.lists, [key]: values } })
  const lists = (blob: "allergic" | "history") =>
    LIST_FIELDS.filter((f) => f.blob === blob).map((f) => (
      <InputList key={f.key} label={f.label} values={form.lists[f.key]} onChange={(v) => setList(f.key, v)} disabled={disabled} />
    ))

  return (
    <>
      <CollapsibleSection title="Vital Signs" icon={<Activity className="h-5 w-5" />} description="Your current vital measurements" defaultOpen={true}>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Blood Pressure (mmHg)</Label>
            <div className="flex gap-2 text-sm font-normal bg-background text-muted-foreground">
              <div className="flex-1 min-w-0 space-y-0">
                {vitalInput("bpSys", "bpSys")}
                <VitalWarning message={vitalNumericError("bpSys", form.bpSys)} />
              </div>
              <div className="flex-1 min-w-0 space-y-0">
                {vitalInput("bpDia", "bpDia")}
                <VitalWarning message={vitalNumericError("bpDia", form.bpDia)} />
              </div>
            </div>
          </div>

          {VITAL_INPUTS.map(({ key, id, label, number }) => (
            <div key={key} className="space-y-2 text-sm font-normal bg-background text-muted-foreground">
              <Label htmlFor={id}>{label}</Label>
              {vitalInput(key, id, number ? "number" : undefined)}
              <VitalWarning message={vitalNumericError(key, form[key])} />
            </div>
          ))}

          <div className="space-y-2 text-sm font-normal bg-background text-muted-foreground">
            <Label htmlFor="bmi">BMI</Label>
            <Input id="bmi" value={bmiOf(form.height, form.weight)} disabled />
          </div>

          <div className="space-y-2">
            <Label>Blood Type</Label>
            <Select value={form.bloodType} onValueChange={(bloodType) => onChange({ bloodType })} disabled={disabled}>
              <SelectTrigger>
                <div className="text-sm font-normal bg-background text-muted-foreground">
                  <SelectValue placeholder="Select blood type" />
                </div>
              </SelectTrigger>
              <SelectContent>
                {PATIENT_BLOOD_TYPES.map((bt) => (
                  <SelectItem key={bt} value={bt}>
                    {bt}
                  </SelectItem>
                ))}
                <SelectItem value={PATIENT_BLOOD_TYPE_UNSET}>Not specified</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Allergic Information" icon={<AlertCircle className="h-5 w-5" />} description="List any known allergies" defaultOpen={true}>
        <div className="space-y-4 text-sm font-normal bg-background text-muted-foreground">{lists("allergic")}</div>
      </CollapsibleSection>

      <CollapsibleSection
        title={t("patient.healthInfo.sections.symptoms.title")}
        icon={<Heart className="h-5 w-5" />}
        description={t("patient.healthInfo.sections.symptoms.description")}
        defaultOpen={true}
      >
        <div className="space-y-3">
          <PatientSymptomEntriesEditor entries={form.symptoms} onChange={(symptoms) => onChange({ symptoms })} disabled={disabled} />
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Medical History" icon={<FileText className="h-5 w-5" />} description="Your past medical conditions and treatments" defaultOpen={true}>
        <div className="space-y-4 text-sm font-normal bg-background text-muted-foreground">{lists("history")}</div>
      </CollapsibleSection>
    </>
  )
}
