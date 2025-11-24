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
import LoginPage from "./authentication/login"
import RegisterPage from "./authentication/register"
import DashBoardPage from "./patient/dashboard"
import FeedBackPage from "./patient/feedback"
import ProfilePage from "./patient/profile"
import ChatbotPage from "./patient/chatbot"

function App() {
  // const [count, setCount] = useState(0)

  return (
    <div>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/patient/dashboard" element={<DashBoardPage />} />
        <Route path="/patient/feedback" element={<FeedBackPage />} />
        <Route path="/patient/profile" element={<ProfilePage />} />
        <Route path="/patient/chatbot" element={<ChatbotPage />} />
      </Routes>
    </div>
  )
}

export default App
