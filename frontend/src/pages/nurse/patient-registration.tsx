"use client"

import { Button } from "@/components/ui/button"
import { PatientRegistrationForm } from "@/components/patient-registration-form"
import { PauseableCornerToastPortal } from "@/components/pauseable-corner-toast"
import { NurseLayout } from "@/components/nurse-layout"
import { usePauseableToast } from "@/hooks/use-pauseable-toast"
import { Link } from "react-router-dom"

import { authService } from "@/services/auth-service"

export default function NursePatientRegistrationPage() {
  const { toast, isExiting, showSuccess, showError, onMouseEnter, onMouseLeave } = usePauseableToast()

  return (
    <NurseLayout>
      <>
        <div className="w-full px-2 md:px-4">
          <h1 className="sr-only">Patient registration</h1>
          <PatientRegistrationForm
            submitFn={authService.registerPatient}
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
