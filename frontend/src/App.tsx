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
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
import FeedbackManagement from "./admin/feedback"
import DoctorDashboard from "./doctor/dashboard"
import DoctorPatients from "./doctor/patients"
import { DoctorLayout2 } from "@/components/doctor-layout-2"
import Doctor_EMRManagement from "./doctor/medical_records/dashboard"
import DoctorAppointment from "./doctor/appointment"
import DoctorFeedback from "./doctor/feedback"
import DoctorProfile from "./doctor/profile"
import { ProtectedRoute } from "@/components/ProtectedRoute"
import NurseDashboard from './nurse/dashboard'
import NursePatients from "./nurse/patients"
import { NurseLayout2 } from "@/components/nurse-layout-2"
import Nurse_EMRManagement from "./nurse/medical_records/dashboard"
import NurseAppointment from "./nurse/appointment"
import NurseFeedback from "./nurse/feedback"
import TechnicianDashboard from './technician/dashboard'
import TechnicianPatients from './technician/patients'
import { TechnicianLayout2 } from "@/components/technician-layout-2"
import Technician_EMRManagement from "./technician/medical_records/lab"
import TechnicianFeedback from "./doctor/feedback"
=======
import { AuthProvider } from "@/contexts/AuthContext"
=======
import FeedbackManagement from "./admin/feedback"
import DoctorDashboard from "./doctor/dashboard"
import DoctorPatients from "./doctor/patients"
<<<<<<< HEAD

import { PatientLayout } from "@/components/patient-layout-onclick"
import ViewingPatientDashboard from "./doctor/medical_records/dashboard"
>>>>>>> 0d84f273 (Add doctor portal)
=======
import RateLimitConfig from "./admin/ratelimit"
import BackupManagement from "./admin/backup"
>>>>>>> 9d41cd19 (TC-2801: Fix the FE branch and modify gitignore)


<<<<<<< HEAD
>>>>>>> 3a5e23be (upgrade UI for all patient portal)

<<<<<<< HEAD
=======
>>>>>>> eca8cbaa (add some page in doctor portal)
function App() {
  return (
    <FadeTransition>
<<<<<<< HEAD
<<<<<<< HEAD
      <div className="inset-0 -z-50 pointer-events-none">
        <NetworkBackground />
      </div>

=======
=======
import { DoctorLayout2 } from "@/components/doctor-layout-2"
import Doctor_EMRManagement from "./doctor/medical_records/dashboard"
import DoctorFeedback from "./doctor/feedback"
>>>>>>> 2a3e1294 (Add nurse portal and Technician portal)
import { ProtectedRoute } from "@/components/ProtectedRoute"
import NurseDashboard from './nurse/dashboard'
import NursePatients from "./nurse/patients"
import { NurseLayout2 } from "@/components/nurse-layout-2"
import Nurse_EMRManagement from "./nurse/medical_records/dashboard"
import NurseAppointment from "./nurse/appointment"
import NurseFeedback from "./nurse/feedback"
import TechnicianDashboard from './technician/dashboard'
import TechnicianPatients from './technician/patients'
import { TechnicianLayout2 } from "@/components/technician-layout-2"
import Technician_EMRManagement from "./technician/medical_records/lab"
import TechnicianFeedback from "./doctor/feedback"

function App() {
  return (
    <FadeTransition>
      <div className="fixed inset-0 z-0 pointer-events-none">
        <NetworkBackground />
      </div>
      <div className="relative z-10 min-h-screen">
>>>>>>> 9d41cd19 (TC-2801: Fix the FE branch and modify gitignore)
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          {/* Protected Patient Routes */}
<<<<<<< HEAD
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
<<<<<<< HEAD
          <Route path="/doctor/medical_records/:patientId/:tab" element={<DoctorLayout2 />}>
            <Route index element={<Doctor_EMRManagement />} />
          </Route>
          <Route path="/doctor/appointments" element={<DoctorAppointment />} />
          <Route path="/doctor/feedback" element={<DoctorFeedback />} />
          <Route path="/doctor/profile" element={<DoctorProfile />} />

          {/* Protected nurse Routes */}
          <Route path="/nurse/dashboard" element={<NurseDashboard />} />
          <Route path="/nurse/patients" element={<NursePatients />} />
          <Route path="/nurse/medical_records/:patientId/:tab" element={<NurseLayout2 />}>
            <Route index element={<Nurse_EMRManagement />} />
          </Route>
          <Route path="/nurse/appointments" element={<NurseAppointment />} />
          <Route path="/nurse/feedback" element={<NurseFeedback />} />

          {/* Protected technician Routes */}
          <Route path="/technician/dashboard" element={<TechnicianDashboard />} />
          <Route path="/technician/patients" element={<TechnicianPatients />} />
          <Route path="/technician/medical_records/:patientId/:tab" element={<TechnicianLayout2 />}>
            <Route index element={<Technician_EMRManagement />} />
          </Route>
          <Route path="/technician/feedback" element={<TechnicianFeedback />} />
        </Routes>

=======
      <div className="absolute inset-0 z-0 pointer-events-none">
=======
      <div className="inset-0 -z-50 pointer-events-none">
>>>>>>> 0d84f273 (Add doctor portal)
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
<<<<<<< HEAD
          <Route path="/doctor/medical_records/:patientId" element={<PatientLayout />}>
=======
          <Route path="/doctor/medical_records/:patientId/:tab" element={<PatientLayout />}>
>>>>>>> eca8cbaa (add some page in doctor portal)
            <Route index element={<ViewingPatientDashboard />} />
=======
          <Route path="/doctor/medical_records/:patientId/:tab" element={<DoctorLayout2 />}>
            <Route index element={<Doctor_EMRManagement />} />
          </Route>
          <Route path="/doctor/appointments" element={<DoctorAppointment />} />
          <Route path="/doctor/feedback" element={<DoctorFeedback />} />

          {/* Protected nurse Routes */}
          <Route path="/nurse/dashboard" element={<NurseDashboard />} />
          <Route path="/nurse/patients" element={<NursePatients />} />
          <Route path="/nurse/medical_records/:patientId/:tab" element={<NurseLayout2 />}>
            <Route index element={<Nurse_EMRManagement />} />
          </Route>
          <Route path="/nurse/appointments" element={<NurseAppointment />} />
          <Route path="/nurse/feedback" element={<NurseFeedback />} />

          {/* Protected technician Routes */}
          <Route path="/technician/dashboard" element={<TechnicianDashboard />} />
          <Route path="/technician/patients" element={<TechnicianPatients />} />
          <Route path="/technician/medical_records/:patientId/:tab" element={<TechnicianLayout2 />}>
            <Route index element={<Technician_EMRManagement />} />
>>>>>>> 2a3e1294 (Add nurse portal and Technician portal)
          </Route>
          <Route path="/technician/feedback" element={<TechnicianFeedback />} />
        </Routes>
<<<<<<< HEAD
      </AuthProvider>
>>>>>>> 3a5e23be (upgrade UI for all patient portal)
=======

>>>>>>> 0d84f273 (Add doctor portal)
=======
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
>>>>>>> 9d41cd19 (TC-2801: Fix the FE branch and modify gitignore)
    </FadeTransition>
  )
}

export default App