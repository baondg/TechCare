"use client"

import { Button } from "@/components/ui/button"
import { PatientRegistrationForm } from "@/components/patient-registration-form"
import { useAuth } from "@/contexts/AuthContext"
import { Link, useNavigate } from "react-router-dom"

export default function RegisterPage() {
  const navigate = useNavigate()
  const { register } = useAuth()

  return (
    <PatientRegistrationForm
      showPublicBranding
      submitButtonLabel="Register!"
      submitLoadingLabel="Registering..."
      successMessage="Registration successful! Redirecting..."
      leftFooter={
        <Button
          size="default"
          className="btn-outline transition-transform duration-500 text-sm px-7 py-4"
          asChild
          type="button"
        >
          <Link to="/login">Back to Login</Link>
        </Button>
      }
      submitFn={register}
      onSuccess={() => {
        window.setTimeout(() => navigate("/patient/dashboard"), 1500)
      }}
    />
  )
}
