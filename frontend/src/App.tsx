import "./App.css"

import { lazy, Suspense } from "react"
import { Route, Routes, useLocation } from "react-router-dom"

const LandingPage = lazy(() => import("./LandingPage"))
const FadeTransition = lazy(() => import("@/components/FadeTransition"))
const NetworkBackground = lazy(() => import("@/components/NetworkBackground"))
const LoginPage = lazy(() => import("./authentication/login"))
const RegisterPage = lazy(() => import("./authentication/register"))
const DashBoardPage = lazy(() => import("./pages/patient/dashboard"))
const FeedBackPage = lazy(() => import("./pages/patient/feedback"))
const ProfilePage = lazy(() => import("./pages/patient/profile"))
const ChatbotPage = lazy(() => import("./pages/patient/chatbot"))
const AppointmentsPage = lazy(() => import("./pages/patient/appointments"))
const BookAppointmentPage = lazy(() => import("./pages/patient/appointments/book-appointment"))
const HealthInfoPage = lazy(() => import("./pages/patient/healthInfo"))
const RecordsPage = lazy(() => import("./pages/patient/records"))
const SymptomCheckerPage = lazy(() => import("./pages/patient/symptomchecker"))
const AdminDashboardPage = lazy(() => import("./pages/admin/dashboard"))
const SystemConfig = lazy(() => import("./pages/admin/config"))
const RateLimitConfig = lazy(() => import("./pages/admin/ratelimit"))
const UserManagement = lazy(() => import("./pages/admin/accountMng"))
const FeedbackManagement = lazy(() => import("./pages/admin/feedback"))
const DoctorDashboard = lazy(() => import("./pages/doctor/dashboard"))
const DoctorPatients = lazy(() => import("./pages/doctor/patients"))
const DoctorLayout2 = lazy(() =>
  import("@/components/doctor-layout-2").then((m) => ({ default: m.DoctorLayout2 })),
)
const Doctor_EMRManagement = lazy(() => import("./pages/doctor/medical_records/dashboard"))
const DoctorAppointment = lazy(() => import("./pages/doctor/appointment"))
const DoctorWorkShifts = lazy(() => import("./pages/doctor/work-shifts"))
const DoctorFeedback = lazy(() => import("./pages/doctor/feedback"))
const NurseDashboard = lazy(() => import("./pages/nurse/dashboard"))
const NursePatients = lazy(() => import("./pages/nurse/patients"))
const NurseLayout2 = lazy(() =>
  import("@/components/nurse-layout-2").then((m) => ({ default: m.NurseLayout2 })),
)
const Nurse_EMRManagement = lazy(() => import("./pages/nurse/medical_records/dashboard"))
const NurseAppointment = lazy(() => import("./pages/nurse/appointment"))
const NurseWorkShifts = lazy(() => import("./pages/nurse/work-shifts"))
const NurseFeedback = lazy(() => import("./pages/nurse/feedback"))
const NursePatientRegistration = lazy(() => import("./pages/nurse/patient-registration"))
const NursePatientProfilePage = lazy(() => import("./pages/nurse/patient-profile"))
const TechnicianDashboard = lazy(() => import("./pages/technician/dashboard"))
const TechnicianPatients = lazy(() => import("./pages/technician/patients"))
const TechnicianLayout2 = lazy(() =>
  import("@/components/technician-layout-2").then((m) => ({ default: m.TechnicianLayout2 })),
)
const Technician_EMRManagement = lazy(() => import("./pages/technician/medical_records/lab"))
const TechnicianWorkShifts = lazy(() => import("./pages/technician/work-shifts"))
const TechnicianFeedback = lazy(() => import("./pages/technician/feedback"))

const PatientPortalNotificationsPage = lazy(() =>
  import("./pages/portal-notifications").then((m) => ({ default: m.PatientPortalNotificationsPage })),
)
const DoctorPortalNotificationsPage = lazy(() =>
  import("./pages/portal-notifications").then((m) => ({ default: m.DoctorPortalNotificationsPage })),
)
const NursePortalNotificationsPage = lazy(() =>
  import("./pages/portal-notifications").then((m) => ({ default: m.NursePortalNotificationsPage })),
)
const TechnicianPortalNotificationsPage = lazy(() =>
  import("./pages/portal-notifications").then((m) => ({
    default: m.TechnicianPortalNotificationsPage,
  })),
)

function RouteFallback() {
  return (
    <div
      className="flex min-h-[40vh] w-full items-center justify-center text-muted-foreground text-sm"
      role="status"
      aria-live="polite"
    >
      Loading…
    </div>
  )
}

function App() {
  const location = useLocation()
  const transitionRoutes = new Set(["/", "/login", "/register"])
  const withTransition = transitionRoutes.has(location.pathname)

  const routes = (
    <Suspense fallback={<RouteFallback />}>
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
        <Route path="/patient/history" element={<RecordsPage />} />
        <Route path="/patient/symptom-checker" element={<SymptomCheckerPage />} />
        <Route path="/patient/notifications" element={<PatientPortalNotificationsPage />} />

        {/* Protected Admin Routes */}
        <Route path="/admin/dashboard" element={<AdminDashboardPage />} />
        <Route path="/admin/config" element={<SystemConfig />} />
        <Route path="/admin/ratelimit" element={<RateLimitConfig />} />
        <Route path="/admin/users" element={<UserManagement />} />
        <Route path="/admin/feedback" element={<FeedbackManagement />} />

        {/* Protected doctor Routes */}
        <Route path="/doctor/dashboard" element={<DoctorDashboard />} />
        <Route path="/doctor/patients" element={<DoctorPatients />} />
        <Route path="/doctor/medical_records/:patientId/:tab" element={<DoctorLayout2 />}>
          <Route index element={<Doctor_EMRManagement />} />
        </Route>
        <Route path="/doctor/appointments" element={<DoctorAppointment />} />
        <Route path="/doctor/work-shifts" element={<DoctorWorkShifts />} />
        <Route path="/doctor/patients/:patientId/profile" element={<NursePatientProfilePage />} />
        <Route path="/doctor/feedback" element={<DoctorFeedback />} />
        <Route path="/doctor/notifications" element={<DoctorPortalNotificationsPage />} />

        {/* Protected nurse Routes */}
        <Route path="/nurse/dashboard" element={<NurseDashboard />} />
        <Route path="/nurse/patient-registration" element={<NursePatientRegistration />} />
        <Route path="/nurse/patients" element={<NursePatients />} />
        <Route path="/nurse/medical_records/:patientId/:tab" element={<NurseLayout2 />}>
          <Route index element={<Nurse_EMRManagement />} />
        </Route>
        <Route path="/nurse/appointments" element={<NurseAppointment />} />
        <Route path="/nurse/work-shifts" element={<NurseWorkShifts />} />
        <Route path="/nurse/patients/:patientId/profile" element={<NursePatientProfilePage />} />
        <Route path="/nurse/feedback" element={<NurseFeedback />} />
        <Route path="/nurse/notifications" element={<NursePortalNotificationsPage />} />

        {/* Protected technician Routes */}
        <Route path="/technician/dashboard" element={<TechnicianDashboard />} />
        <Route path="/technician/patients" element={<TechnicianPatients />} />
        <Route path="/technician/medical_records/:patientId/:tab" element={<TechnicianLayout2 />}>
          <Route index element={<Technician_EMRManagement />} />
        </Route>
        <Route path="/technician/work-shifts" element={<TechnicianWorkShifts />} />
        <Route path="/technician/feedback" element={<TechnicianFeedback />} />
        <Route path="/technician/notifications" element={<TechnicianPortalNotificationsPage />} />
      </Routes>
    </Suspense>
  )

  const routedContent = withTransition ? (
    <Suspense fallback={routes}>
      <FadeTransition>{routes}</FadeTransition>
    </Suspense>
  ) : (
    routes
  )

  return (
    <>
      <Suspense fallback={null}>
        <div className="inset-0 -z-50 pointer-events-none">
          <NetworkBackground />
        </div>
      </Suspense>
      {routedContent}
    </>
  )
}

export default App
