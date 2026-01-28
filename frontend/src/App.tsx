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
import RateLimitConfig from "./admin/ratelimit"
import BackupManagement from "./admin/backup"



import { ProtectedRoute } from "@/components/ProtectedRoute"

function App() {
  return (
    <FadeTransition>
      <div className="fixed inset-0 z-0 pointer-events-none">
        <NetworkBackground />
      </div>
      <div className="relative z-10 min-h-screen">
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          {/* Protected Patient Routes */}
          <Route path="/patient/dashboard" element={
            <ProtectedRoute>
              <DashBoardPage />
            </ProtectedRoute>
          } />
          <Route path="/patient/feedback" element={
            <ProtectedRoute>
              <FeedBackPage />
            </ProtectedRoute>
          } />
          <Route path="/patient/profile" element={
            <ProtectedRoute>
              <ProfilePage />
            </ProtectedRoute>
          } />
          <Route path="/patient/chatbot" element={
            <ProtectedRoute>
              <ChatbotPage />
            </ProtectedRoute>
          } />
          <Route path="/patient/appointments" element={
            <ProtectedRoute>
              <AppointmentsPage />
            </ProtectedRoute>
          } />
          <Route path="/patient/appointments/book-appointment" element={
            <ProtectedRoute>
              <BookAppointmentPage />
            </ProtectedRoute>
          } />
          <Route path="/patient/health-info" element={
            <ProtectedRoute>
              <HealthInfoPage />
            </ProtectedRoute>
          } />
          <Route path="/patient/records" element={
            <ProtectedRoute>
              <RecordsPage />
            </ProtectedRoute>
          } />
          <Route path="/patient/symptom-checker" element={
            <ProtectedRoute>
              <SymptomCheckerPage />
            </ProtectedRoute>
          } />

          {/* Protected Admin Routes */}
          <Route path="/admin/dashboard" element={
            <ProtectedRoute requiredRole="admin">
              <AdminDashboardPage />
            </ProtectedRoute>
          } />
          <Route path="/admin/system-config" element={
            <ProtectedRoute requiredRole="admin">
              <SystemConfig />
            </ProtectedRoute>
          } />
          <Route path="/admin/users" element={
            <ProtectedRoute requiredRole="admin">
              <UserManagement />
            </ProtectedRoute>
          } />
          <Route path="/admin/rate-limit" element={
            <ProtectedRoute requiredRole="admin">
              <RateLimitConfig />
            </ProtectedRoute>
          } />
          <Route path="/admin/backup" element={
            <ProtectedRoute requiredRole="admin">
              <BackupManagement />
            </ProtectedRoute>
          } />
        </Routes>
      </div>
    </FadeTransition>
  )
}

export default App