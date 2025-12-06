import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button"
import { Activity } from "lucide-react"


export function Header() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60">
      <div className="w-full max-w-8xl mx-auto flex h-16 items-center justify-between px-4">
        
        <div className="flex items-center gap-3">
          {/* ICON GRADIENT SIÊU ĐẸP */}
          <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-linear-to-br from-[#06b6d4] to-[#0891b2] p-0.5 shadow-lg">
            {/* Viền sáng nhẹ bên ngoài */}
            <div className="flex h-full w-full items-center justify-center rounded-lg">
              <Activity className="h-6 w-6 text-[#FFFFFF]" />
            </div>
            
            {/* Hiệu ứng sáng nhẹ khi hover toàn bộ header */}
            <div className="absolute inset-0 rounded-xl opacity-0 transition-opacity duration-300 group-hover:opacity-100 bg-white/20" />
          </div>

          {/* Chữ TechCare */}
          <span className="text-2xl font-bold bg-linear-to-r from-[#06b6d4] to-[#0891b2] bg-clip-text text-transparent">
            TechCare
          </span>
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
          <Button size="default" className="btn-outline transition-transform duration-500 text-xl px-7 py-4" asChild>
            <Link to="/login">Sign In</Link>
          </Button>
          <Button size="default" className="btn-gradient transition-transform duration-500 text-xl px-7 py-4" asChild>
            <Link to="/register">Get Started</Link>
          </Button>
        </div>
      </div>
    </header>
  )
}
