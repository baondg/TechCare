import { useState, useEffect } from "react";
import type { JSX } from "react";

export default function MainCarousel({ slides }: { slides: JSX.Element[] }) {
  const [index, setIndex] = useState(0);

  const next = () => setIndex((prev) => (prev + 1) % slides.length);
  const prev = () =>
    setIndex((prev) => (prev - 1 + slides.length) % slides.length);
  useEffect(() => {
    const timer = setInterval(() => next(), 10000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="relative overflow-hidden w-full -top-48 min-h-screen">
      {/* Slide wrapper */}
      <div
        className="flex transition-transform duration-700 ease-out"
        style={{ transform: `translateX(-${index * 100}%)` }}
      >
        {slides.map((Slide, i) => (
          <div
            key={i}
            className="w-full shrink-0 min-h-screen flex items-center justify-center"
          >
            {Slide}
          </div>
        ))}
      </div>

      {/* Left Arrow */}
      <button
        onClick={prev}
        className="btn-gradient transition-transform duration-500 absolute left-6 top-1/2 -translate-y-1/2 bg-white/60 hover:bg-white shadow-md p-3 rounded-full backdrop-blur"
      >
        ←
      </button>

      {/* Right Arrow */}
      <button
        onClick={next}
        className="btn-gradient transition-transform duration-500 absolute right-6 top-1/2 -translate-y-1/2 bg-white/60 hover:bg-white shadow-md p-3 rounded-full backdrop-blur"
      >
        →
      </button>

      {/* Dot indicators */}
      <div className="absolute bottom-25 w-full flex justify-center gap-2">
        {slides.map((_, i) => (
          <div
            key={i}
            onClick={() => setIndex(i)}
            className={`h-3 w-3 rounded-full cursor-pointer transition ${
              i === index ? "bg-cyan-500" : "bg-gray-300"
            }`}
          ></div>
        ))}
      </div>
    </div>
  );
}
