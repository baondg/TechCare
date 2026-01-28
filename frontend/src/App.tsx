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
// import SymptomCheckerPage from "./patient/symptomchecker"
import AdminDashboardPage from "./admin/dashboard"
import SystemConfig from "./admin/config"
import UserManagement from "./admin/accountMng"
import FeedbackManagement from "./admin/feedback"
import DoctorDashboard from "./doctor/dashboard"
import DoctorPatients from "./doctor/patients"

import { PatientLayout } from "@/components/patient-layout-onclick"
import ViewingPatientDashboard from "./doctor/medical_records/dashboard"



import { ProtectedRoute } from "@/components/ProtectedRoute"

function App() {
  return (
    <FadeTransition>
      <div className="inset-0 -z-50 pointer-events-none">
        <NetworkBackground />
      </div>

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
          {/* <Route path="/patient/symptom-checker" element={<SymptomCheckerPage />} /> */}

          {/* Protected Admin Routes */}
          <Route path="/admin/dashboard" element={<AdminDashboardPage />} />
          <Route path="/admin/config" element={<SystemConfig />} />
          <Route path="/admin/users" element={<UserManagement />} />
          <Route path="/admin/feedback" element={<FeedbackManagement />} />

          {/* Protected doctor Routes */}
          <Route path="/doctor/dashboard" element={<DoctorDashboard />} />
          <Route path="/doctor/patients" element={<DoctorPatients />} />
          <Route path="/doctor/medical_records/:patientId" element={<PatientLayout />}>
            <Route index element={<ViewingPatientDashboard />} />
            {/* <Route path="health-info" element={<div>ViewingHealthInfoPage</div>} />
            <Route path="laboratory" element={<div>Laboratory</div>} />
            <Route path="diagnosis" element={<div>Diagnosis</div>} />
            <Route path="surgery" element={<div>Surgery</div>} />
            <Route path="prescription" element={<div>Prescription</div>} />
            <Route path="history" element={<div>History</div>} /> */}
          </Route>
        </Routes>

    </FadeTransition>
  )
}

export default App