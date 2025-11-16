// import { useState } from 'react'
import { Header } from "@/components/header"
import { Footer } from "@/components/footer"
import { Hero } from "@/components/hero"
import { Features } from "@/components/features"
import { HowItWorks } from "@/components/how-it-works"
import { UserRoles } from "@/components/user-roles"
import { AIFeatures } from "@/components/ai-features"
import './App.css'
import { Routes, Route } from "react-router-dom"
import LandingPage from "./LandingPage" 
import LoginPage from "./login/page"

function App() {
  // const [count, setCount] = useState(0)

  return (
    <div>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
      </Routes>

    </div>
  )
}

export default App
