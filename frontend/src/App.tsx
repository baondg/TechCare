// import { useState } from 'react'
import FadeTransition from "@/components/FadeTransition"
import NetworkBackground from "@/components/NetworkBackground";
import './App.css'
import AuthLayout from "@/components/AuthLayout"
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
import FeedbackPage from "./admin/feedback"
import { AuthProvider } from "./contexts/AuthContext"
import { ProtectedRoute } from "./components/ProtectedRoute"

function App() {
  // const [count, setCount] = useState(0)

  return (
    <div className="relative">
      <div className="relative">
        <FadeTransition>
          <Routes>
            <Route element={<AuthLayout />}>
              <Route path="/" element={<LandingPage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
            </Route>
            <Route path="/patient/dashboard" element={<DashBoardPage />} />
            <Route path="/patient/feedback" element={<FeedBackPage />} />
            <Route path="/patient/profile" element={<ProfilePage />} />
            <Route path="/patient/chatbot" element={<ChatbotPage />} />
            <Route path="/patient/appointments" element={<AppointmentsPage />} />
            <Route path="/patient/appointments/book-appointment" element={<BookAppointmentPage />} />
            <Route path="/patient/health-info" element={<HealthInfoPage />} />
            <Route path="/patient/records" element={<RecordsPage />} />
            <Route path="/patient/symptom-checker" element={<SymptomCheckerPage />} />
            <Route path="/admin/dashboard" element={<AdminDashboardPage />} />
            <Route path="/admin/system-config" element={<SystemConfig />} />
            <Route path="/admin/user-management" element={<UserManagement />} />
            <Route path="/admin/feedback" element={<FeedbackPage />} />
          </Routes>
        </FadeTransition>
      </div>
    </div>
    <AuthProvider>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        
        {/* Protected Patient Routes */}
        <Route path="/patient/dashboard" element={<ProtectedRoute><DashBoardPage /></ProtectedRoute>} />
        <Route path="/patient/feedback" element={<ProtectedRoute><FeedBackPage /></ProtectedRoute>} />
        <Route path="/patient/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
        <Route path="/patient/chatbot" element={<ProtectedRoute><ChatbotPage /></ProtectedRoute>} />
        <Route path="/patient/appointments" element={<ProtectedRoute><AppointmentsPage /></ProtectedRoute>} />
        <Route path="/patient/appointments/book-appointment" element={<ProtectedRoute><BookAppointmentPage /></ProtectedRoute>} />
        <Route path="/patient/health-info" element={<ProtectedRoute><HealthInfoPage /></ProtectedRoute>} />
        <Route path="/patient/records" element={<ProtectedRoute><RecordsPage /></ProtectedRoute>} />
        <Route path="/patient/symptom-checker" element={<ProtectedRoute><SymptomCheckerPage /></ProtectedRoute>} />
        
        {/* Protected Admin Routes */}
        <Route path="/admin/dashboard" element={<ProtectedRoute requiredRole="admin"><AdminDashboardPage /></ProtectedRoute>} />
        <Route path="/admin/system-config" element={<ProtectedRoute requiredRole="admin"><SystemConfig /></ProtectedRoute>} />
        <Route path="/admin/hospital-info" element={<ProtectedRoute requiredRole="admin"><HospitalInfo /></ProtectedRoute>} />
        <Route path="/admin/users" element={<ProtectedRoute requiredRole="admin"><UserManagement /></ProtectedRoute>} />
      </Routes>
    </AuthProvider>
  )
}

export default App
