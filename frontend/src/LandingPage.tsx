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

<<<<<<< HEAD
      <div className="relative z-10">
=======
      <div className="relative z-10 min-h-screen overflow-y-auto hide-scrollbar">
>>>>>>> 9d41cd19 (TC-2801: Fix the FE branch and modify gitignore)
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
