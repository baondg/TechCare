import { Card, CardContent } from "@/components/ui/card"
import { User, Stethoscope, ClipboardList } from "lucide-react"


const roles = [
  {
    icon: User,
    title: "For Patients",
    features: [
      "Book and manage appointments online",
      "Update health information before visits",
      "Access medical records and prescriptions",
      "AI chatbot for health questions",
      "Medication reminders and tracking",
      "Recovery progress monitoring",
    ],
    cta: "Patient Portal",
    href: "/login?role=patient",
  },
  {
    icon: Stethoscope,
    title: "For Doctors",
    features: [
      "Complete EMR access and management",
      "AI-powered diagnosis suggestions",
      "Prescription assistance with safety checks",
      "Patient dashboard with vital signs",
      "Department transfer recommendations",
      "Follow-up appointment scheduling",
    ],
    cta: "Doctor Dashboard",
    href: "/login?role=doctor",
  },
  {
    icon: ClipboardList,
    title: "For Nurses",
    features: [
      "Patient registration and verification",
      "Clinic room assignment with AI",
      "Health information data entry",
      "Appointment management",
      "Patient flow monitoring",
      "Insurance verification",
    ],
    cta: "Nurse Portal",
    href: "/login?role=nurse",
  },
]

export function UserRoles() {
  return (
    <section id="users" className="border-b border-border/40 bg-background py-24 md:py-32">
      <div className="container px-4">
        <div className="mx-auto max-w-2xl text-center mb-16">
          <h2 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl md:text-5xl mb-4">
            Built for Every Healthcare Role
          </h2>
          <p className="text-lg text-muted-foreground text-pretty leading-relaxed">
            Tailored experiences for 3 main roles include patients, doctors, and nurses with role-specific features and workflows.
          </p>
        </div>

        <div className="grid gap-8 md:grid-cols-3">
          {roles.map((role) => (
            <Card key={role.title} className="border-border/40 bg-card">
              <CardContent className="pt-6">
                <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-lg bg-primary/10">
                  <role.icon className="h-7 w-7 text-primary" />
                </div>
                <h3 className="mb-4 text-2xl font-semibold text-card-foreground">{role.title}</h3>
                <ul className="mb-6 space-y-3">
                  {role.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <svg
                        className="h-5 w-5 shrink-0 text-primary mt-0.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      {feature}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  )
}
