import { Button } from "@/components/ui/button"
import { ArrowRight } from "lucide-react"
import { Link } from "react-router-dom";

export function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-border/40 bg-background">
      <div className="container px-4 py-24 md:py-10 lg:py-10">
        <div className="mx-auto max-w-4xl text-center">
          <div className="mb-6 inline-block rounded-full border border-border/40 bg-muted/50 px-4 py-1.5">
            <span className="text-sm font-medium text-muted-foreground">AI-Powered Smart Hospital Management</span>
          </div>

          <h1 className="mb-6 text-4xl font-bold tracking-tight text-balance sm:text-5xl md:text-6xl lg:text-7xl">
            Transform Healthcare with <span className="text-primary">AI-Powered</span> Hospital Management
          </h1>

          <p className="mx-auto mb-10 max-w-2xl text-lg text-muted-foreground text-pretty md:text-xl leading-relaxed">
            Streamline patient flow, optimize appointments, and enhance care quality with intelligent automation.
            TechCare empowers all group of user with seamless digital healthcare.
          </p>

          <div className="flex flex-col gap-4 sm:flex-row sm:justify-center">
            <Button size="lg" className="gap-2 text-base" asChild>
              <Link to="/login">
                Get Started Free
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" className="text-base bg-transparent">
              Watch Demo
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}
