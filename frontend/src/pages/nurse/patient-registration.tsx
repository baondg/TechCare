"use client"

import { Button } from "@/components/ui/button"
import { PatientRegistrationForm } from "@/components/patient-registration-form"
import { PauseableCornerToastPortal } from "@/components/pauseable-corner-toast"
import type { RegisterData } from "@/contexts/AuthContext"
import { NurseLayout } from "@/components/nurse-layout"
import { usePauseableToast } from "@/hooks/usePauseableToast"
import { Link } from "react-router-dom"

import { API_BASE_URL as API_BASE } from "@/lib/api-base"

async function registerPatientAsNurse(data: RegisterData): Promise<{ success: boolean; error?: string }> {
  const token = localStorage.getItem("authToken")
  if (!token) {
    return { success: false, error: "You are not logged in. Please sign in again." }
  }

  const res = await fetch(`${API_BASE}/api/auth/register-patient`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  })

  let json: { success?: boolean; error?: string } = {}
  try {
    json = (await res.json()) as typeof json
  } catch {
    /* ignore */
  }

  if (res.ok && json.success) {
    return { success: true }
  }
  return {
    success: false,
    error: json.error || `Could not create account (${res.status})`,
  }
}

export default function NursePatientRegistrationPage() {
  const { toast, isExiting, showSuccess, showError, onMouseEnter, onMouseLeave } = usePauseableToast()

  return (
    <NurseLayout>
      <>
        <div className="w-full px-2 md:px-4">
          <h1 className="sr-only">Patient registration</h1>
          <PatientRegistrationForm
            submitFn={registerPatientAsNurse}
            submitButtonLabel="Accept"
            submitLoadingLabel="Saving…"
            successMessage="Patient account created. You can register another patient or go to check-in."
            clearOnSuccess
            onSuccess={() => showSuccess("Patient account created successfully.")}
            onErrorNotification={(message) => showError(message)}
            leftFooter={
              <Button
                size="default"
                variant="outline"
                className="transition-transform duration-500 text-sm px-7 py-4"
                asChild
                type="button"
              >
                <Link to="/nurse/patients">Back to Patient check-in</Link>
              </Button>
            }
          />
        </div>
        <PauseableCornerToastPortal
          toast={toast}
          isExiting={isExiting}
          onMouseEnter={onMouseEnter}
          onMouseLeave={onMouseLeave}
        />
      </>
    </NurseLayout>
  )
}
