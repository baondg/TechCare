"use client"

import { Button } from "@/components/ui/button"
import { PatientRegistrationForm } from "@/components/patient-registration-form"
import { useAuth } from "@/contexts/auth-context"
import { Link, useNavigate } from "react-router-dom"
import { useTranslation } from "react-i18next"

export default function RegisterPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { register } = useAuth()

  return (
    <PatientRegistrationForm
      showPublicBranding
      submitButtonLabel={t("auth.register")}
      submitLoadingLabel={t("auth.registering")}
      successMessage={t("auth.registerSuccess")}
      leftFooter={
        <Button
          size="default"
          className="btn-outline transition-transform duration-500 text-sm px-7 py-4"
          asChild
          type="button"
        >
          <Link to="/login">{t("auth.backToLogin")}</Link>
        </Button>
      }
      submitFn={register}
      onSuccess={() => {
        window.setTimeout(() => navigate("/patient/dashboard"), 1500)
      }}
    />
  )
}
