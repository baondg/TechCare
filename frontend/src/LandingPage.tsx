import { Header } from "@/components/header"
import { Hero } from "@/components/hero"
import MainCarousel from "@/components/MainCarousel"
import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from "react"
import "./App.css"

const Features = lazy(() => import("@/components/features").then((m) => ({ default: m.Features })))
const HowItWorks = lazy(() => import("@/components/how-it-works").then((m) => ({ default: m.HowItWorks })))
const AIFeatures = lazy(() => import("@/components/ai-features").then((m) => ({ default: m.AIFeatures })))
const Footer = lazy(() => import("@/components/footer").then((m) => ({ default: m.Footer })))

function DeferredSection({
  children,
  fallback,
  rootMargin = "200px",
}: {
  children: ReactNode
  fallback: ReactNode
  rootMargin?: string
}) {
  const [visible, setVisible] = useState(false)
  const markerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const marker = markerRef.current
    if (!marker) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { rootMargin },
    )
    observer.observe(marker)
    return () => observer.disconnect()
  }, [rootMargin])

  return (
    <div ref={markerRef}>
      {visible ? children : fallback}
    </div>
  )
}

function App() {
  return (
    <div className="relative max-h-screen">
      <div className="relative z-10">
        <Header />

        <MainCarousel
          slides={[
            <Hero key="hero" />,
            <Suspense key="features" fallback={<div className="min-h-screen" />}>
              <DeferredSection fallback={<div className="min-h-screen" />}>
                <Features />
              </DeferredSection>
            </Suspense>,
            <Suspense key="how" fallback={<div className="min-h-screen" />}>
              <DeferredSection fallback={<div className="min-h-screen" />}>
                <HowItWorks />
              </DeferredSection>
            </Suspense>,
            <Suspense key="ai" fallback={<div className="min-h-screen" />}>
              <DeferredSection fallback={<div className="min-h-screen" />}>
                <AIFeatures />
              </DeferredSection>
            </Suspense>,
          ]}
        />
        <Suspense fallback={<div className="h-24" />}>
          <DeferredSection fallback={<div className="h-24" />}>
            <Footer />
          </DeferredSection>
        </Suspense>
      </div>
    </div>
  )
}

export default App
