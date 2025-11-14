import { Card, CardContent } from "@/components/ui/card"
import { Bot, Calendar, Pill, TrendingUp } from "lucide-react"

const aiFeatures = [
  {
    icon: Bot,
    title: "AI Chatbot",
    description:
      "24/7 intelligent assistant answers patient questions about medications, appointments, and post-treatment care.",
    color: "bg-blue-500/10 text-blue-600",
  },
  {
    icon: Calendar,
    title: "Smart Transfer Suggestion",
    description:
      "Predicts optimal transfer based on patient diagnosis.",
    color: "bg-purple-500/10 text-purple-600",
  },
  {
    icon: Pill,
    title: "Prescription Intelligence",
    description:
      "Suggests medications based on diagnosis, checks for allergies and interactions, follows national guidelines.",
    color: "bg-green-500/10 text-green-600",
  },
  {
    icon: TrendingUp,
    title: "Recovery Prediction",
    description:
      "Estimates patient recovery timeline and suggests follow-up schedules based on diagnosis and treatment.",
    color: "bg-orange-500/10 text-orange-600",
  },
]

export function AIFeatures() {
  return (
    <section id="ai" className="border-b border-border/40 bg-muted/30 py-24 md:py-32">
      <div className="container px-4">
        <div className="mx-auto max-w-2xl text-center mb-16">
          <div className="mb-4 inline-block rounded-full border border-primary/20 bg-primary/10 px-4 py-1.5">
            <span className="text-sm font-medium text-primary">Powered by AI</span>
          </div>
          <h2 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl md:text-5xl mb-4">
            Intelligent Healthcare Automation
          </h2>
          <p className="text-lg text-muted-foreground text-pretty leading-relaxed">
            Advanced AI modules that enhance decision-making, reduce errors, and improve patient outcomes.
          </p>
        </div>

        <div className="grid gap-8 md:grid-cols-2">
          {aiFeatures.map((feature) => (
            <Card key={feature.title} className="border-border/40 bg-card">
              <CardContent className="pt-6">
                <div className={`mb-4 inline-flex h-14 w-14 items-center justify-center rounded-lg ${feature.color}`}>
                  <feature.icon className="h-7 w-7" />
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
