import { Link } from "react-router-dom";
import { Github, Twitter, Linkedin, Mail } from "lucide-react"
import { Activity } from "lucide-react"

export function Footer() {
  return (
    <footer className="bg-transparent backdrop-blur supports-backdrop-filter:bg-background/60 py-12 md:py-16 border">
      <div className="container px-4">
        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-2">
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
            <p className="text-muted-foreground mb-6 max-w-sm leading-relaxed py-3">
              AI-powered smart hospital management system transforming healthcare delivery in Vietnam and beyond.
            </p>
            <div className="flex gap-4">
              <Link
                to="#"
                className="btn-outline transition-transform duration-500 px-2.5 py-2.5"
                aria-label="Twitter"
              >
                <Twitter className="h-4 w-4" />
              </Link>
              <Link
                to="#"
                className="btn-outline transition-transform duration-500 px-2.5 py-2.5"
                aria-label="GitHub"
              >
                <Github className="h-4 w-4" />
              </Link>
              <Link
                to="#"
                className="btn-outline transition-transform duration-500 px-2.5 py-2.5"
                aria-label="LinkedIn"
              >
                <Linkedin className="h-4 w-4" />
              </Link>
              <Link
                to="#"
                className="btn-outline transition-transform duration-500 px-2.5 py-2.5"
                aria-label="Email"
              >
                <Mail className="h-4 w-4" />
              </Link>
            </div>
          </div>

          <div>
            <h3 className="font-bold text-lg mb-5 bg-linear-to-r from-cyan-600 to-cyan-400 bg-clip-text text-transparent">
              Platform
            </h3>
            <ul className="space-y-3.5">
              {["Features", "How It Works", "AI Features", "For Users"].map((item) => (
                <li key={item}>
                  <Link 
                    to={`#${item.toLowerCase().replace(/ /g, "-")}`} 
                    className="group relative inline-block text-muted-foreground/80 text-sm font-medium tracking-wide
                              transition-all duration-300 hover:text-cyan-500"
                  >
                    <span className="relative z-10">{item}</span>
                    
                    {/* Dòng gạch chân chạy từ trái sang khi hover */}
                    <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-cyan-500 rounded-full 
                                    transition-all duration-500 ease-out group-hover:w-full" />
                    
                    {/* Hiệu ứng phát sáng nhẹ */}
                    <span className="absolute -inset-1 bg-cyan-500/5 rounded-lg opacity-0 
                                    transition-opacity duration-300 group-hover:opacity-100 blur-xl" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="font-bold text-lg mb-5 bg-linear-to-r from-cyan-600 to-cyan-400 bg-clip-text text-transparent">
              Resources
            </h3>
            <ul className="space-y-5">
              {["Documentation", "API Reference", "Help Center", "Community"].map((item) => (
                <li key={item}>
                  <Link 
                    to="#" 
                    className="group flex items-center gap-2 text-muted-foreground/80 text-sm font-medium 
                              transition-all duration-300 hover:text-cyan-500">
                    
                    <span className="relative">
                      {item}
                      <span className="absolute -bottom-0.5 left-0 w-0 h-0.5 bg-linear-to-r from-cyan-400 to-cyan-600 
                                      rounded-full transition-all duration-500 group-hover:w-full" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="font-bold text-lg mb-5 bg-linear-to-r from-cyan-600 to-cyan-400 bg-clip-text text-transparent">
              About Us
            </h3>
            <ul className="space-y-3.5">
              {["Vision", "Contact", "Careers", "Partners"].map((item) => (
                <li key={item}>
                  <Link 
                    to="#" 
                    className="group relative inline-flex items-center gap-3 text-muted-foreground/80 text-sm font-medium
                              transition-all duration-400 hover:text-cyan-500 hover:translate-x-1">
                    <span className="relative">
                      {item}
                      {/* Hiệu ứng chữ "nổi lên" nhẹ */}
                      <span className="absolute inset-0 bg-cyan-500/10 blur-lg scale-0 
                                      transition-transform duration-400 group-hover:scale-100" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-border/40 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-sm text-muted-foreground">© 2025 TechCare. All rights reserved.</p>
          <div className="flex flex-wrap gap-6 text-sm">
            {["Privacy Policy", "Terms of Service", "HIPAA Compliance"].map((item) => (
              <Link 
                key={item}
                to="#" 
                className="relative overflow-hidden px-1 pb-2 font-medium text-muted-foreground/70
                          transition-all duration-300 hover:text-cyan-500"
              >
                {item}
                <span className="absolute bottom-0 left-0 w-full h-px bg-linear-to-r from-transparent via-cyan-500 to-transparent 
                                translate-y-1 transition-transform duration-500 hover:translate-y-0" />
              </Link>
            ))}
          </div>
        </div>
      </div>
    </footer>
  )
}
