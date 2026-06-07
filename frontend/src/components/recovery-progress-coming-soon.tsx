"use client"

import { TrendingUp } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Card, CardContent } from "@/components/ui/card"
import { CollapsibleSection } from "@/components/collapsible-section"

export function RecoveryProgressComingSoon() {
  const { t } = useTranslation()

  return (
    <CollapsibleSection
      title={t("patient.dashboard.recoveryProgress")}
      icon={<TrendingUp className="h-5 w-5" />}
      defaultOpen={true}
    >
      <Card className="card-feature-group overflow-hidden rounded-xl border border-slate-200/80 shadow-sm">
        <CardContent className="p-8 text-center">
          <p className="text-sm font-medium text-slate-600">{t("patient.dashboard.recoveryComingSoon")}</p>
        </CardContent>
      </Card>
    </CollapsibleSection>
  )
}
