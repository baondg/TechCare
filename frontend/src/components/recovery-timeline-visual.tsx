import { useTranslation } from "react-i18next"

type Props = {
  pct: number
  numeratorDays: number
  denominatorDays: number
}

export function RecoveryTimelineVisual({ pct, numeratorDays, denominatorDays }: Props) {
  const { t } = useTranslation()
  const safePct = Math.min(100, Math.max(0, Math.round(pct)))

  return (
    <div className="w-full min-w-0 space-y-2">
      <div
        className="h-3 w-full rounded-full bg-slate-200 overflow-hidden"
        role="progressbar"
        aria-valuenow={safePct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full rounded-full bg-linear-to-r from-cyan-500 to-cyan-600 transition-all duration-700 ease-out"
          style={{ width: `${safePct}%` }}
        />
      </div>
      <p className="text-lg font-semibold tabular-nums text-slate-900">
        {t("patient.dashboard.recoveryDaysFraction", {
          numerator: numeratorDays,
          denominator: denominatorDays,
        })}
      </p>
    </div>
  )
}
