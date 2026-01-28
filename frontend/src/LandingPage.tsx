// import { useState } from 'react'
import { Header } from "@/components/header"
import { Footer } from "@/components/footer"
import { Hero } from "@/components/hero"
import { Features } from "@/components/features"
import { HowItWorks } from "@/components/how-it-works"
import { AIFeatures } from "@/components/ai-features"
import './App.css'
import MainCarousel from "@/components/MainCarousel";


function App() {
  return (
    <div className="relative max-h-screen">

      <div className="relative z-10">
        <Header />

        <MainCarousel
          slides={[
            <Hero key="hero" />,
            <Features key="features" />,
            <HowItWorks key="how" />,
            <AIFeatures key="ai" />,
          ]}
        />

        <Footer />
      </div>
    </div>
  );
}

export default App
