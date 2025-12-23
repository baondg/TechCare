import './App.css'

import FadeTransition from "@/components/FadeTransition"
import NetworkBackground from "@/components/NetworkBackground";
import { Routes, Route } from "react-router-dom"
import LandingPage from "./LandingPage" 
import LoginPage from "./authentication/login"
import RegisterPage from "./authentication/register"
import DashBoardPage from "./patient/dashboard"
import FeedBackPage from "./patient/feedback"
import ProfilePage from "./patient/profile"
import ChatbotPage from "./patient/chatbot"
import AppointmentsPage from "./patient/appointments"
import BookAppointmentPage from "./patient/appointments/book-appointment"
import HealthInfoPage from "./patient/healthInfo"
import RecordsPage from "./patient/records"
import SymptomCheckerPage from "./patient/symptomchecker"
import AdminDashboardPage from "./admin/dashboard"
import SystemConfig from "./admin/config"
import UserManagement from "./admin/accountMng"
import { AuthProvider } from "@/contexts/AuthContext"



function App() {
  return (
    <FadeTransition>
      <div className="absolute inset-0 z-0 pointer-events-none">
        <NetworkBackground />
      </div>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          {/* Protected Patient Routes */}
          <Route path="/patient/dashboard" element={<DashBoardPage />} />
          <Route path="/patient/feedback" element={<FeedBackPage />} />
          <Route path="/patient/profile" element={<ProfilePage />} />
          <Route path="/patient/chatbot" element={<ChatbotPage />} />
          <Route path="/patient/appointments" element={<AppointmentsPage />} />
          <Route path="/patient/appointments/book-appointment" element={<BookAppointmentPage />} />
          <Route path="/patient/health-info" element={<HealthInfoPage />} />
          <Route path="/patient/records" element={<RecordsPage />} />
          <Route path="/patient/symptom-checker" element={<SymptomCheckerPage />} />

          {/* Protected Admin Routes */}
          <Route path="/admin/dashboard" element={<AdminDashboardPage />} />
          <Route path="/admin/system-config" element={<SystemConfig />} />
          <Route path="/admin/users" element={<UserManagement />} />
        </Routes>
      </AuthProvider>
    </FadeTransition>
  )
}

export default App