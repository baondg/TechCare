import { Link } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Activity, ChevronDown, Menu, X } from "lucide-react"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { LanguageToggle } from "@/components/language-toggle"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"

export function Header() {
  const { t } = useTranslation()
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const [mobileOpen, setMobileOpen] = useState(false)
  const menuItems = [
    {
      title: t("header.platform"),
      links: [
        { label: t("header.features"), href: "#features" },
        { label: t("header.howItWorks"), href: "#how-it-works" },
        { label: t("header.aiFeatures"), href: "#ai-features" },
        { label: t("header.forHospitals"), href: "#users" },
      ],
    },
    {
      title: t("header.resources"),
      links: [
        { label: t("header.documentation"), href: "#" },
        { label: t("header.apiReference"), href: "#" },
        { label: t("header.helpCenter"), href: "#" },
        { label: t("header.community"), href: "#" },
      ],
    },
    {
      title: t("header.aboutUs"),
      links: [
        { label: t("header.vision"), href: "#" },
        { label: t("header.partners"), href: "#" },
        { label: t("header.careers"), href: "#" },
        { label: t("header.contact"), href: "#" },
      ],
    },
  ]

  useEffect(() => {
    if (!mobileOpen) return
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = originalOverflow
    }
  }, [mobileOpen])

  const handleMobileNavigate = () => setMobileOpen(false)

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
          <nav className="hidden lg:flex items-center gap-10">
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
        <div className="hidden lg:flex items-center gap-4">
          <LanguageToggle compact />
          <Button size="default" className="btn-outline transition-transform duration-500 text-xl px-7 py-4" asChild>
            <Link to="/login">{t("header.signIn")}</Link>
          </Button>
          <Button size="default" className="btn-gradient transition-transform duration-500 text-xl px-7 py-4" asChild>
            <Link to="/register">{t("header.getStarted")}</Link>
          </Button>
        </div>

        <div className="flex items-center gap-2 lg:hidden">
          <LanguageToggle compact />
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-10 w-10 rounded-xl"
            aria-label={t("header.menu")}
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>
        </div>
      </div>

      <Dialog open={mobileOpen} onOpenChange={setMobileOpen}>
        <DialogContent
          className="!left-auto !right-0 !top-0 !translate-x-0 !translate-y-0 h-screen w-[min(92vw,380px)] max-w-none !rounded-none border-l border-border bg-white p-0 [&>button]:hidden"
          aria-describedby={undefined}
        >
          <DialogTitle className="sr-only">{t("header.menu")}</DialogTitle>
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between border-b px-4 py-4">
              <div className="flex items-center gap-2">
                <div className="relative flex h-8 w-8 items-center justify-center rounded-xl bg-linear-to-br from-[#06b6d4] to-[#0891b2] p-0.5 shadow-lg">
                  <div className="flex h-full w-full items-center justify-center rounded-lg">
                    <Activity className="h-5 w-5 text-[#FFFFFF]" />
                  </div>
                </div>
                <span className="text-lg font-bold bg-linear-to-r from-[#06b6d4] to-[#0891b2] bg-clip-text text-transparent">
                  TechCare
                </span>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-lg"
                aria-label={t("header.closeMenu")}
                onClick={() => setMobileOpen(false)}
              >
                <X className="h-5 w-5" />
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
              {menuItems.map((item) => (
                <section key={item.title} className="space-y-2">
                  <h3 className="text-sm font-semibold text-slate-800">{item.title}</h3>
                  <div className="space-y-1">
                    {item.links.map((link) => (
                      <a
                        key={link.label}
                        href={link.href}
                        onClick={handleMobileNavigate}
                        className="block rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                      >
                        {link.label}
                      </a>
                    ))}
                  </div>
                </section>
              ))}
            </div>

            <div className="border-t px-4 py-4 space-y-3">
              <Button size="default" className="w-full btn-outline" asChild>
                <Link to="/login" onClick={handleMobileNavigate}>{t("header.signIn")}</Link>
              </Button>
              <Button size="default" className="w-full btn-gradient" asChild>
                <Link to="/register" onClick={handleMobileNavigate}>{t("header.getStarted")}</Link>
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </header>
  )
}