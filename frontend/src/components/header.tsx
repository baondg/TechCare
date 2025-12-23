import { Link } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Activity } from "lucide-react"
import { useState } from "react"
import { ChevronDown } from "lucide-react"

const menuItems = [
  {
    title: "Platform",
    links: [
      { label: "Features", href: "#features" },
      { label: "How It Works", href: "#how-it-works" },
      { label: "AI Features", href: "#ai-features" },
      { label: "For Hospitals", href: "#users" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Documentation", href: "#" },
      { label: "API Reference", href: "#" },
      { label: "Help Center", href: "#" },
      { label: "Community", href: "#" },
    ],
  },
  {
    title: "About Us",
    links: [
      { label: "Vision", href: "#" },
      { label: "Partners", href: "#" },
      { label: "Careers", href: "#" },
      { label: "Contact", href: "#" },
    ],
  },
]


export function Header() {
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60">
      <div className="w-full max-w-8xl mx-auto flex h-16 items-center justify-between px-4">
        
        {/* KHỐI TRÁI: LOGO + NAV */}
        <div className="flex items-center gap-12"> {/* Tăng khoảng cách giữa Logo và Nav */}
          
          {/* LOGO */}
          <Link to="/" className="flex items-center gap-3 group">
            {/* ICON GRADIENT SIÊU ĐẸP */}
            <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-linear-to-br from-[#06b6d4] to-[#0891b2] p-0.5 shadow-lg">
              <div className="flex h-full w-full items-center justify-center rounded-lg">
                <Activity className="h-6 w-6 text-[#FFFFFF]" />
              </div>
            </div>

            {/* Chữ TechCare */}
            <span className="text-2xl font-bold bg-linear-to-r from-[#06b6d4] to-[#0891b2] bg-clip-text text-transparent">
              TechCare
            </span>
          </Link>

          {/* NAV tab */}
          <nav className="md:flex items-center gap-10">
            {menuItems.map((item) => (
              <div
                key={item.title}
                className="relative group" // Dùng group để hover con
                onMouseEnter={() => setOpenMenu(item.title)}
                onMouseLeave={() => setOpenMenu(null)}
              >
                {/* TAB CHÍNH – CÓ GẠCH CHÂN CHẠY + GLOW */}
                <button className="bg-transparent border-transparent hover:border-transparent relative flex items-center gap-1.5 px-2 py-4 text-sm font-medium text-foreground/70 transition-all duration-300">
                  {item.title}
                  <ChevronDown className={`h-4 w-4 transition-transform duration-300 ${openMenu === item.title ? "rotate-180" : ""}`} />

                  {/* Gạch chân chạy từ trái sang + glow cyan */}
                  <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-linear-to-r from-[#06b6d4] to-[#0891b2] rounded-full transition-all duration-500 ease-out group-hover:w-full" />
                  <span className="absolute -bottom-1 left-0 w-0 h-px bg-cyan-400/50 blur-sm transition-all duration-500 group-hover:w-full" />
                </button>

                {/* DROPDOWN MENU */}
                {openMenu === item.title && (
                  <div 
                    className="absolute top-full left-1/2 -translate-x-1/2 mt-0.5 z-10 w-64 rounded-2xl bg-white shadow-2xl border border-border/60 overflow-hidden animate-in fade-in slide-in-from-top-4 duration-200"
                    onMouseEnter={() => setOpenMenu(item.title)}
                    onMouseLeave={() => setOpenMenu(null)}
                  >
                    <div className="p-4 space-y-1">
                      {item.links.map((link) => (
                        <a
                          key={link.label}
                          href={link.href}
                          className="group/item origin-center block px-4 py-3 text-sm text-muted-foreground hover:text-cyan-600 rounded-xl transition-all duration-300 font-medium"
                        >
                          <span className="relative">
                            {link.label}
                            {/* Gạch chân nhỏ khi hover từng item */}
                            <span className="absolute bottom-0 left-0 w-0 h-px bg-cyan-500 transition-all duration-400 group-hover/item:w-full" />
                          </span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </nav>
        </div>

        {/* KHỐI PHẢI: BUTTONS */}
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