import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button"
import { Activity } from "lucide-react"


export function Header() {
  return (
    <header className="sticky top-0 z-50 w-screen border-b border-border/40 bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60">
      <div className="w-full max-w-8xl mx-auto flex h-16 items-center justify-between px-4">
        
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
            <Activity className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="text-xl font-bold">TechCare</span>
        </div>

        <nav className="hidden md:flex items-center gap-8">
          <Link
            to="#features"
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Features
          </Link>
          <Link
            to="#how-it-works"
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            How It Works
          </Link>
          <Link
            to="#users"
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            For Users
          </Link>
          <Link
            to="#ai"
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            AI Features
          </Link>
        </nav>

        <div className="flex items-center gap-4">
          <Button size="default" variant="outline" className="bg-transparent" asChild>
            <Link to="/login">Sign In</Link>
          </Button>
          <Button size="default" asChild>
            <Link to="/login">Get Started</Link>
          </Button>
        </div>
      </div>
    </header>
  )
}
