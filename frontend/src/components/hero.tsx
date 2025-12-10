import { Button } from "@/components/ui/button"
import { ArrowRight } from "lucide-react"
import { Link } from "react-router-dom";

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-transparent">
      <div className="container px-4 py-24 md:py-10 lg:py-10">
        <div className="mx-auto max-w-4xl text-center">
          <div className="group mb-8 inline-flex items-center gap-2 rounded-full  px-5 py-2.5 
                   border border-cyan-400/30 backdrop-blur-md
                   transition-all duration-300 hover:scale-105 hover:border-cyan-400/60 
                   hover:shadow-xl hover:shadow-cyan-500/25">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-cyan-300"></span>
            </span>
            <span className="bg-linear-to-r from-[#06b6d4] to-[#0891b2] bg-clip-text text-transparent 
                            text-sm font-semibold tracking-wider">
              AI-Powered Smart Hospital Management
            </span>
          </div>

          <h1 className="mb-6 text-4xl font-bold tracking-tight text-balance sm:text-5xl md:text-6xl lg:text-7xl">
            Transform Healthcare with{" "}
            {/* CHỮ "AI-POWERED" CÓ GRADIENT ĐỈNH CAO */}
            <span
              className="inline-block bg-linear-to-r from-[#06b6d4] via-[#0891b2] to-[#06b6d4] bg-clip-text text-transparent
                        bg-size-[200%_200%] animate-gradient-shift font-bold"
              style={{
                backgroundImage: "linear-gradient(90deg, #06b6d4 0%, #0891b2 50%, #06b6d4 100%)",
              }}
            >
              AI-Powered
            </span>{" "}
            Hospital Management
          </h1>

          <p className="mx-auto mb-10 max-w-2xl text-lg text-muted-foreground text-pretty md:text-xl leading-relaxed">
            Streamline patient flow, optimize appointments, and enhance care quality with intelligent automation.
            TechCare empowers all group of user with seamless digital healthcare.
          </p>

          <div className="flex flex-col gap-4 sm:flex-row sm:justify-center">
            <Button size="lg" className="text-xl btn-gradient transition-transform duration-500" asChild>
              <Link to="/login">
                Get Started Free
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}
