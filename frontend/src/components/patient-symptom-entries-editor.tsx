"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  createEmptySymptomEntry,
  SYMPTOM_DURATION_VALUES,
  SYMPTOM_SEVERITY_VALUES,
  type SymptomDuration,
  type SymptomEntry,
  type SymptomSeverity,
} from "@/lib/health-info-symptoms"
import { Plus, X } from "lucide-react"
import { useTranslation } from "react-i18next"

const UNSET = "__unset__"

function fieldShellClass(filled: boolean) {
  return [
    "flex min-h-[3.25rem] w-full items-center rounded-lg border px-0 text-sm transition-colors",
    filled ? "border-slate-200 bg-white shadow-sm" : "border-dashed border-slate-300 bg-slate-50/70",
  ].join(" ")
}

function SymptomColumnLabel({ children }: { children: string }) {
  return (
    <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
      {children}
    </span>
  )
}

function EmptySlotPreview({
  symptomLabel,
  severityLabel,
  durationLabel,
  emptySymptom,
  emptySeverity,
  emptyDuration,
}: {
  symptomLabel: string
  severityLabel: string
  durationLabel: string
  emptySymptom: string
  emptySeverity: string
  emptyDuration: string
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <div className="min-w-0 space-y-1.5">
        <SymptomColumnLabel>{symptomLabel}</SymptomColumnLabel>
        <div className={`${fieldShellClass(false)} px-3 py-2.5 text-slate-400`}>{emptySymptom}</div>
      </div>
      <div className="min-w-0 space-y-1.5">
        <SymptomColumnLabel>{severityLabel}</SymptomColumnLabel>
        <div className={`${fieldShellClass(false)} px-3 py-2.5 text-slate-400`}>{emptySeverity}</div>
      </div>
      <div className="min-w-0 space-y-1.5">
        <SymptomColumnLabel>{durationLabel}</SymptomColumnLabel>
        <div className={`${fieldShellClass(false)} px-3 py-2.5 text-slate-400`}>{emptyDuration}</div>
      </div>
    </div>
  )
}

function SymptomEntryRow({
  entry,
  onChange,
  onRemove,
  canRemove,
  disabled,
}: {
  entry: SymptomEntry
  onChange: (next: SymptomEntry) => void
  onRemove: () => void
  canRemove: boolean
  disabled?: boolean
}) {
  const { t } = useTranslation()
  const p = "patient.healthInfo.sections.symptoms"

  const nameFilled = Boolean(entry.name.trim())
  const severityFilled = Boolean(entry.severity)
  const durationFilled = Boolean(entry.duration)

  return (
    <div className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200/80 bg-white/80 p-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
      <div className="min-w-0 space-y-1.5">
        <SymptomColumnLabel>{t(`${p}.columns.symptom`)}</SymptomColumnLabel>
        <div className={fieldShellClass(nameFilled)}>
          <Input
            value={entry.name}
            onChange={(e) => onChange({ ...entry, name: e.target.value })}
            placeholder={t(`${p}.emptySymptom`)}
            disabled={disabled}
            className="h-11 border-0 bg-transparent shadow-none focus-visible:ring-0"
          />
        </div>
      </div>

      <div className="min-w-0 space-y-1.5">
        <SymptomColumnLabel>{t(`${p}.columns.severity`)}</SymptomColumnLabel>
        <div className={fieldShellClass(severityFilled)}>
          <Select
            value={entry.severity || UNSET}
            disabled={disabled}
            onValueChange={(v) =>
              onChange({ ...entry, severity: v === UNSET ? "" : (v as SymptomSeverity) })
            }
          >
            <SelectTrigger className="h-11 w-full border-0 bg-transparent shadow-none focus:ring-0" disabled={disabled}>
              <SelectValue placeholder={t(`${p}.emptySeverity`)} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={UNSET} disabled>
                {t(`${p}.emptySeverity`)}
              </SelectItem>
              {SYMPTOM_SEVERITY_VALUES.map((level) => (
                <SelectItem key={level} value={level}>
                  {t(`${p}.severityLevels.${level}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="min-w-0 space-y-1.5">
        <SymptomColumnLabel>{t(`${p}.columns.duration`)}</SymptomColumnLabel>
        <div className={fieldShellClass(durationFilled)}>
          <Select
            value={entry.duration || UNSET}
            disabled={disabled}
            onValueChange={(v) =>
              onChange({ ...entry, duration: v === UNSET ? "" : (v as SymptomDuration) })
            }
          >
            <SelectTrigger className="h-11 w-full border-0 bg-transparent shadow-none focus:ring-0" disabled={disabled}>
              <SelectValue placeholder={t(`${p}.emptyDuration`)} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={UNSET} disabled>
                {t(`${p}.emptyDuration`)}
              </SelectItem>
              {SYMPTOM_DURATION_VALUES.map((value) => (
                <SelectItem key={value} value={value}>
                  {t(`${p}.duration.${value}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-10 w-10 shrink-0 text-slate-500 hover:bg-red-50 hover:text-red-600 sm:mb-0.5"
        onClick={onRemove}
        disabled={disabled || !canRemove}
        aria-label={t(`${p}.removeAria`)}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  )
}

export function PatientSymptomEntriesEditor({
  entries,
  onChange,
  disabled = false,
}: {
  entries: SymptomEntry[]
  onChange: (entries: SymptomEntry[]) => void
  disabled?: boolean
}) {
  const { t } = useTranslation()
  const p = "patient.healthInfo.sections.symptoms"

  const hasFilledRow = entries.some((e) => e.name.trim())
  const columnLabels = {
    symptomLabel: t(`${p}.columns.symptom`),
    severityLabel: t(`${p}.columns.severity`),
    durationLabel: t(`${p}.columns.duration`),
    emptySymptom: t(`${p}.emptySymptom`),
    emptySeverity: t(`${p}.emptySeverity`),
    emptyDuration: t(`${p}.emptyDuration`),
  }

  const updateEntry = (id: string, next: SymptomEntry) => {
    onChange(entries.map((e) => (e.id === id ? next : e)))
  }

  const removeEntry = (id: string) => {
    const next = entries.filter((e) => e.id !== id)
    onChange(next.length > 0 ? next : [createEmptySymptomEntry()])
  }

  const addEntry = () => {
    onChange([...entries, createEmptySymptomEntry()])
  }

  return (
    <div className="space-y-4 rounded-xl border border-cyan-200/60 bg-gradient-to-br from-slate-50/80 to-white p-4 shadow-sm">
      {!hasFilledRow && (
        <>
          <EmptySlotPreview {...columnLabels} />
          <p className="text-center text-sm text-slate-500">{t(`${p}.emptyHint`)}</p>
        </>
      )}

      <div className="space-y-3">
        {entries.map((entry) => (
          <SymptomEntryRow
            key={entry.id}
            entry={entry}
            onChange={(next) => updateEntry(entry.id, next)}
            onRemove={() => removeEntry(entry.id)}
            canRemove={entries.length > 1 || Boolean(entry.name.trim())}
            disabled={disabled}
          />
        ))}
      </div>

      <Button type="button" variant="outline" size="sm" className="gap-2" onClick={addEntry} disabled={disabled}>
        <Plus className="h-4 w-4" />
        {t(`${p}.addRow`)}
      </Button>
    </div>
  )
}
