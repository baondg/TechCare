import { Calendar, FileText, Brain, Clock } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"

const features = [
  {
    icon: Calendar,
    title: "Online Appointment",
    description:
      "Can choose appointment slots, reduces wait times, and suggests the best time for patient visits based on historical data.",
  },
  {
    icon: FileText,
    title: "Electronic Medical Records",
    description:
      "Comprehensive EMR system with ICD-10 diagnosis codes, vital signs tracking, allergies, and complete patient history accessible in real-time.",
  },
  {
    icon: Brain,
    title: "AI Decision Support",
    description:
      "Intelligent recommendations for clinic assignment, prescription suggestions, and department transfers based on patient symptoms and diagnosis.",
  },
  {
    icon: Clock,
    title: "Real-Time Patient Flow",
    description:
      "Track patient journey from check-in to discharge. Optimize clinic assignments and reduce bottlenecks with live monitoring and analytics.",
  },
]

export function Features() {
  return (
    <section id="features" className="py-24 md:py-32 relative bg-transparent top-10">
      <div className="container px-4">
        <div className="mx-auto max-w-2xl text-center mb-16">
          <h2 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl md:text-5xl mb-4">
            Comprehensive Hospital Management
          </h2>
          <p className="text-lg text-muted-foreground text-pretty leading-relaxed">
            Powerful features designed to streamline healthcare delivery and improve patient outcomes.
          </p>
        </div>

        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
          {features.map((feature) => (
            <Card key={feature.title} className="card-feature card-feature-hover border-r border-white/40 sticky top-16 bg-white/80 backdrop-blur-xl shadow-[4px_0_20px_rgba(0,0,0,0.05)] z-40">
              <CardContent className="pt-6">
                <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-accent/10 text-accent">
                  <feature.icon className="h-6 w-6 text-accent" />
                </div>
                <h3 className="mb-2 text-xl font-semibold text-card-foreground">{feature.title}</h3>
                <p className="text-muted-foreground leading-relaxed">{feature.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  )
}
