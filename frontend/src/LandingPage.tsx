// import { useState } from 'react'
import { Header } from "@/components/header"
import { Footer } from "@/components/footer"
import { Hero } from "@/components/hero"
import { Features } from "@/components/features"
import { HowItWorks } from "@/components/how-it-works"
import { UserRoles } from "@/components/user-roles"
import { AIFeatures } from "@/components/ai-features"
import './App.css'

function App() {
  // const [count, setCount] = useState(0)

  return (
    <div>
      <Header />
      <main>
        <Hero />
        <Features />
        <HowItWorks />
        <UserRoles />
        <AIFeatures />
      </main>
      <Footer />
    </div>
  )
}

export default App
