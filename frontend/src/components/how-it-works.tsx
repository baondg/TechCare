import { Card, CardContent } from "@/components/ui/card"
import { UserPlus, Stethoscope, Pill, HeartPulse } from "lucide-react"

const steps = [
  {
    icon: UserPlus,
    step: "01",
    title: "Patient Registration & Check-In",
    description:
      "Patients register online or at reception. AI verifies identity, insurance, and assigns optimal clinic based on symptoms.",
  },
  {
    icon: Stethoscope,
    step: "02",
    title: "Doctor Consultation",
    description:
      "Doctors access complete EMR, receive AI-powered suggestions, and update patient records in real-time.",
  },
  {
    icon: Pill,
    step: "03",
    title: "Treatment",
    description:
      "Patients receive comprehensive treatment include laboratory testing, surgery, prescription and so on",
  },
  {
    icon: HeartPulse,
    step: "04",
    title: "Follow-Up & Recovery",
    description:
      "Automated medication reminders, AI chatbot support, and recovery predictions keep patients engaged post-visit.",
  },
]

export function HowItWorks() {
  return (
    <section id="how-it-works" className="border-b border-border/40 bg-muted/30 py-24 md:py-32">
      <div className="container px-4">
        <div className="mx-auto max-w-2xl text-center mb-16">
          <h2 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl md:text-5xl mb-4">
            Seamless Outpatient Flow
          </h2>
          <p className="text-lg text-muted-foreground text-pretty leading-relaxed">
            From arrival to recovery, TechCare guides patients through every step with intelligent automation.
          </p>
        </div>

        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
          {steps.map((step) => (
            <Card key={step.title} className="border-border/40 bg-card relative">
              <CardContent className="pt-6">
                <div className="absolute -top-4 left-6 inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold">
                  {step.step}
                </div>
                <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-accent/10">
                  <step.icon className="h-6 w-6 text-accent" />
                </div>
                <h3 className="mb-2 text-lg font-semibold text-card-foreground">{step.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{step.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  )
}
