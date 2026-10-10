import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"

type Language = "vi" | "en"

export function LanguageToggle() {
  const { i18n, t } = useTranslation()
  const current = (i18n.resolvedLanguage || i18n.language || "vi") as Language

  const setLanguage = (lang: Language) => {
    if (lang === current) return
    void i18n.changeLanguage(lang)
  }

  return (
    <div className="flex items-center gap-2">
      <div
        className="inline-flex rounded-full border border-slate-200 bg-white/80 p-0.5 shadow-sm backdrop-blur"
        role="group"
        aria-label={t("common.language")}
      >
        <button
          type="button"
          onClick={() => setLanguage("vi")}
          className={cn(
            "h-7 rounded-full px-3 text-xs font-medium transition-all duration-200",
            current === "vi"
              ? "bg-linear-to-r from-[#06b6d4] to-[#0891b2] text-white shadow-sm"
              : "text-slate-600 hover:text-slate-800"
          )}
          aria-pressed={current === "vi"}
        >
          VI
        </button>
        <button
          type="button"
          onClick={() => setLanguage("en")}
          className={cn(
            "h-7 rounded-full px-3 text-xs font-medium transition-all duration-200",
            current === "en"
              ? "bg-linear-to-r from-[#06b6d4] to-[#0891b2] text-white shadow-sm"
              : "text-slate-600 hover:text-slate-800"
          )}
          aria-pressed={current === "en"}
        >
          EN
        </button>
      </div>
    </div>
  )
}
