import { useCallback, useEffect, useState } from "react"
import type { JSX } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"

export default function MainCarousel({ slides }: { slides: JSX.Element[] }) {
  const [index, setIndex] = useState(0)

  const next = useCallback(() => {
    setIndex((prev) => (prev + 1) % slides.length)
  }, [slides.length])
  const prev = useCallback(() => {
    setIndex((prev) => (prev - 1 + slides.length) % slides.length)
  }, [slides.length])

  const previousIndex = (index - 1 + slides.length) % slides.length
  const nextIndex = (index + 1) % slides.length

  useEffect(() => {
    const timer = setInterval(() => next(), 10000)
    return () => clearInterval(timer)
  }, [next])

  return (
    <div className="relative w-full overflow-hidden h-[calc(100vh-4rem)]">
      {/* Slide wrapper */}
      <div
        className="flex transition-transform duration-700 ease-out"
        style={{ transform: `translateX(-${index * 100}%)` }}
      >
        {slides.map((Slide, i) => (
          <div
            key={i}
            className="flex h-[calc(100vh-4rem)] w-full shrink-0 items-start justify-center pt-4 md:pt-6"
          >
            {i === index || i === previousIndex || i === nextIndex ? Slide : null}
          </div>
        ))}
      </div>

      {/* Nav arrows: do NOT use btn-gradient — it applies text-9xl / huge padding in App.css */}
      <button
        type="button"
        onClick={prev}
        aria-label="Previous slide"
        className="absolute left-2 top-1/2 z-30 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-cyan-600/20 bg-white/90 text-cyan-700 shadow-md backdrop-blur-sm transition hover:bg-cyan-50 hover:shadow-lg md:left-4 md:h-11 md:w-11"
      >
        <ChevronLeft className="h-5 w-5 md:h-6 md:w-6" strokeWidth={2.25} />
      </button>

      <button
        type="button"
        onClick={next}
        aria-label="Next slide"
        className="absolute right-2 top-1/2 z-30 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-cyan-600/20 bg-white/90 text-cyan-700 shadow-md backdrop-blur-sm transition hover:bg-cyan-50 hover:shadow-lg md:right-4 md:h-11 md:w-11"
      >
        <ChevronRight className="h-5 w-5 md:h-6 md:w-6" strokeWidth={2.25} />
      </button>

      {/* Dot indicators */}
      <div className="absolute bottom-8 z-50 w-full flex justify-center gap-2">
        {slides.map((_, i) => (
          <div
            key={i}
            onClick={() => setIndex(i)}
            className={`h-3 w-3 rounded-full cursor-pointer transition ${
              i === index ? "bg-cyan-500" : "bg-gray-300"
            }`}
          />
        ))}
      </div>
    </div>
  )
}
