import { Card, CardContent } from "@/components/ui/card"
import { Bot, Calendar, Pill, TrendingUp } from "lucide-react"

const aiFeatures = [
  {
    icon: Bot,
    title: "AI Chatbot",
    description:
      "24/7 intelligent assistant answers patient questions about medications, appointments, and post-treatment care.",
    color: "bg-accent/10 text-accent",
  },
  {
    icon: Calendar,
    title: "Smart Transfer Suggestion",
    description:
      "Predicts optimal transfer based on patient diagnosis.",
    color: "bg-accent/10 text-accent",
  },
  {
    icon: Pill,
    title: "Prescription Intelligence",
    description:
      "Suggests medications based on diagnosis, checks for allergies and interactions, follows national guidelines.",
    color: "bg-accent/10 text-accent",
  },
  {
    icon: TrendingUp,
    title: "Recovery Prediction",
    description:
      "Estimates patient recovery timeline and suggests follow-up schedules based on diagnosis and treatment.",
    color: "bg-accent/10 text-accent",
  },
]

export function AIFeatures() {
  return (
    <section id="ai" className="py-24 md:py-32 relative bg-transparent">
      <div className="container px-4">
        <div className="mx-auto max-w-2xl text-center mb-16">
          <div className="group mb-8 inline-flex items-center gap-2 rounded-full  px-5 py-2.5 
                   border border-cyan-400/30 backdrop-blur-md
                   transition-all duration-300 hover:scale-105 hover:border-cyan-400/60 
                   hover:shadow-xl hover:shadow-cyan-500/25">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-cyan-300"></span>
            </span>
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
            <Card key={feature.title} className="card-feature card-feature-hover border-border/40 bg-card w-150">
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
