import { Button } from "@/components/ui/button"
import { ArrowRight } from "lucide-react"
import { Link } from "react-router-dom";

export function CTA() {
  return (
    <section className="border-b border-border/40 bg-background py-24 md:py-32">
      <div className="container px-4">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl md:text-5xl mb-6">
            Ready to Transform Your Hospital?
          </h2>
          <p className="text-lg text-muted-foreground text-pretty leading-relaxed mb-10">
            Join leading healthcare institutions using TechCare to deliver better patient care with AI-powered
            efficiency.
          </p>
          <div className="flex flex-col gap-4 sm:flex-row sm:justify-center">
            <Button size="lg" className="gap-2 text-base" asChild>
              <Link to="/login">
                Get Started Free
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" className="text-base bg-transparent">
              Schedule a Demo
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}
