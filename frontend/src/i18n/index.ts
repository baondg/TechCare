import i18n from "i18next"
import { initReactI18next } from "react-i18next"
import en from "./locales/en"
import vi from "./locales/vi"

export const LANGUAGE_STORAGE_KEY = "techcare-language"

export const getInitialLanguage = (): "vi" | "en" => {
  try {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY)
    if (stored === "vi" || stored === "en") {
      return stored
    }
  } catch {
    // ignore storage errors
  }
  return "vi"
}

void i18n.use(initReactI18next).init({
  resources: {
    vi: { translation: vi },
    en: { translation: en },
  },
  lng: getInitialLanguage(),
  fallbackLng: "vi",
  interpolation: {
    escapeValue: false,
  },
  returnNull: false,
})

i18n.on("languageChanged", (lng) => {
  if (lng !== "vi" && lng !== "en") return
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, lng)
  } catch {
    // ignore storage errors
  }
})

export default i18n
