import './App.css'

import FadeTransition from "@/components/FadeTransition"
import NetworkBackground from "@/components/NetworkBackground";
import { Routes, Route } from "react-router-dom"
import LandingPage from "./LandingPage" 
import LoginPage from "./authentication/login"
import RegisterPage from "./authentication/register"
import DashBoardPage from "./pages/patient/dashboard"
import FeedBackPage from "./pages/patient/feedback"
import ProfilePage from "./pages/patient/profile"
import ChatbotPage from "./pages/patient/chatbot"
import AppointmentsPage from "./pages/patient/appointments"
import BookAppointmentPage from "./pages/patient/appointments/book-appointment"
import HealthInfoPage from "./pages/patient/healthInfo"
import RecordsPage from "./pages/patient/records"
import SymptomCheckerPage from "./pages/patient/symptomchecker"
import AdminDashboardPage from "./pages/admin/dashboard"
import SystemConfig from "./pages/admin/config"
import UserManagement from "./pages/admin/accountMng"
import FeedbackManagement from "./pages/admin/feedback"
import DoctorDashboard from "./pages/doctor/dashboard"
import DoctorPatients from "./pages/doctor/patients"
import { DoctorLayout2 } from "@/components/doctor-layout-2"
import Doctor_EMRManagement from "./pages/doctor/medical_records/dashboard"
import DoctorAppointment from "./pages/doctor/appointment"
import DoctorFeedback from "./pages/doctor/feedback"
import NurseDashboard from './pages/nurse/dashboard'
import NursePatients from "./pages/nurse/patients"
import { NurseLayout2 } from "@/components/nurse-layout-2"
import Nurse_EMRManagement from "./pages/nurse/medical_records/dashboard"
import NurseAppointment from "./pages/nurse/appointment"
import NurseFeedback from "./pages/nurse/feedback"
import NursePatientProfilePage from "./pages/nurse/patient-profile"
import TechnicianDashboard from './pages/technician/dashboard'
import TechnicianPatients from './pages/technician/patients'
import { TechnicianLayout2 } from "@/components/technician-layout-2"
import Technician_EMRManagement from "./pages/technician/medical_records/lab"
import TechnicianFeedback from "./pages/technician/feedback"

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
          <Route path="/patient/symptom-checker" element={<SymptomCheckerPage />} />

          {/* Protected Admin Routes */}
          <Route path="/admin/dashboard" element={<AdminDashboardPage />} />
          <Route path="/admin/config" element={<SystemConfig />} />
          <Route path="/admin/users" element={<UserManagement />} />
          <Route path="/admin/feedback" element={<FeedbackManagement />} />

          {/* Protected doctor Routes */}
          <Route path="/doctor/dashboard" element={<DoctorDashboard />} />
          <Route path="/doctor/patients" element={<DoctorPatients />} />
          <Route path="/doctor/medical_records/:patientId/:tab" element={<DoctorLayout2 />}>
            <Route index element={<Doctor_EMRManagement />} />
          </Route>
          <Route path="/doctor/appointments" element={<DoctorAppointment />} />
          <Route path="/doctor/patients/:patientId/profile" element={<NursePatientProfilePage />} />
          <Route path="/doctor/feedback" element={<DoctorFeedback />} />

          {/* Protected nurse Routes */}
          <Route path="/nurse/dashboard" element={<NurseDashboard />} />
          <Route path="/nurse/patients" element={<NursePatients />} />
          <Route path="/nurse/medical_records/:patientId/:tab" element={<NurseLayout2 />}>
            <Route index element={<Nurse_EMRManagement />} />
          </Route>
          <Route path="/nurse/appointments" element={<NurseAppointment />} />
          <Route path="/nurse/patients/:patientId/profile" element={<NursePatientProfilePage />} />
          <Route path="/nurse/feedback" element={<NurseFeedback />} />

          {/* Protected technician Routes */}
          <Route path="/technician/dashboard" element={<TechnicianDashboard />} />
          <Route path="/technician/patients" element={<TechnicianPatients />} />
          <Route path="/technician/medical_records/:patientId/:tab" element={<TechnicianLayout2 />}>
            <Route index element={<Technician_EMRManagement />} />
          </Route>
          <Route path="/technician/feedback" element={<TechnicianFeedback />} />
        </Routes>

    </FadeTransition>
  )
}

export default App
