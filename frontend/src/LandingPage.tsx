// import { useState } from 'react'
import { Header } from "@/components/header"
import { Footer } from "@/components/footer"
import { Hero } from "@/components/hero"
import { Features } from "@/components/features"
import { HowItWorks } from "@/components/how-it-works"
import { UserRoles } from "@/components/user-roles"
import { AIFeatures } from "@/components/ai-features"
import './App.css'
import NetworkBackground from "@/components/NetworkBackground";
import MainCarousel from "@/components/MainCarousel";

function App() {
  return (
    <div className="relative h-370">

      <div className="relative z-10min-h-screen overflow-y-auto hide-scrollbar">
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
