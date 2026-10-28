import { useEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, RequireAuth, GuestOnly, FullScreenLoader } from './auth.jsx';
import { ToastProvider, ConfirmProvider } from './components/ui.jsx';
import Layout from './components/Layout.jsx';

// Public
import Landing from './pages/public/Landing.jsx';
import Login from './pages/public/Login.jsx';
import Register from './pages/public/Register.jsx';
import Privacy from './pages/public/Privacy.jsx';
import NotFound from './pages/public/NotFound.jsx';

// Client
import ClientDashboard from './pages/client/Dashboard.jsx';
import BookAppointment from './pages/client/BookAppointment.jsx';
import ClientAppointments from './pages/client/Appointments.jsx';
import ClientAppointmentDetail from './pages/client/AppointmentDetail.jsx';
import ClientProjects from './pages/client/Projects.jsx';
import ClientProjectDetail from './pages/client/ProjectDetail.jsx';
import ClientDocuments from './pages/client/Documents.jsx';
import ClientBlueprints from './pages/client/Blueprints.jsx';
import ClientMessages from './pages/client/Messages.jsx';
import ClientNotifications from './pages/client/Notifications.jsx';
import ClientProfile from './pages/client/Profile.jsx';

// Admin
import AdminDashboard from './pages/admin/Dashboard.jsx';
import AdminAppointments from './pages/admin/Appointments.jsx';
import AdminAppointmentDetail from './pages/admin/AppointmentDetail.jsx';
import AdminCalendar from './pages/admin/Calendar.jsx';
import AdminProjects from './pages/admin/Projects.jsx';
import AdminProjectDetail from './pages/admin/ProjectDetail.jsx';
import AdminDocuments from './pages/admin/Documents.jsx';
import AdminBlueprints from './pages/admin/Blueprints.jsx';
import AdminClients from './pages/admin/Clients.jsx';
import AdminClientDetail from './pages/admin/ClientDetail.jsx';
import AdminStaff from './pages/admin/Staff.jsx';
import AdminServices from './pages/admin/Services.jsx';
import AdminReports from './pages/admin/Reports.jsx';
import AdminActivity from './pages/admin/Activity.jsx';
import AdminInquiries from './pages/admin/Inquiries.jsx';
import AdminMessages from './pages/admin/Messages.jsx';
import AdminNotifications from './pages/admin/Notifications.jsx';
import AdminSettings from './pages/admin/Settings.jsx';
import AdminProfile from './pages/admin/Profile.jsx';

// Staff
import StaffDashboard from './pages/staff/Dashboard.jsx';
import StaffSchedule from './pages/staff/Schedule.jsx';
import StaffProjects from './pages/staff/Projects.jsx';
import StaffProjectDetail from './pages/staff/ProjectDetail.jsx';
import StaffMessages from './pages/staff/Messages.jsx';
import StaffNotifications from './pages/staff/Notifications.jsx';
import StaffProfile from './pages/staff/Profile.jsx';

function ScrollToTop() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) {
      const target = document.getElementById(hash.slice(1));
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
    }
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [pathname, hash]);
  return null;
}

function LandingFallback() {
  return <FullScreenLoader label="Opening the office website…" />;
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <ConfirmProvider>
          <ScrollToTop />
          <a href="#main-content" className="sr-only">
            Skip to main content
          </a>
          <Routes>
            {/* Public website */}
            <Route path="/" element={<Landing />} />
            <Route path="/privacy" element={<Privacy />} />

            <Route element={<GuestOnly />}>
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
            </Route>

            {/* Client portal */}
            <Route element={<RequireAuth roles={['client']} />}>
              <Route element={<Layout />}>
                <Route path="/app" element={<ClientDashboard />} />
                <Route path="/app/book" element={<BookAppointment />} />
                <Route path="/app/appointments" element={<ClientAppointments />} />
                <Route path="/app/appointments/:id" element={<ClientAppointmentDetail />} />
                <Route path="/app/projects" element={<ClientProjects />} />
                <Route path="/app/projects/:id" element={<ClientProjectDetail />} />
                <Route path="/app/documents" element={<ClientDocuments />} />
                <Route path="/app/blueprints" element={<ClientBlueprints />} />
                <Route path="/app/messages" element={<ClientMessages />} />
                <Route path="/app/messages/:id" element={<ClientMessages />} />
                <Route path="/app/notifications" element={<ClientNotifications />} />
                <Route path="/app/profile" element={<ClientProfile />} />
              </Route>
            </Route>

            {/* Administrator */}
            <Route element={<RequireAuth roles={['admin']} />}>
              <Route element={<Layout />}>
                <Route path="/admin" element={<AdminDashboard />} />
                <Route path="/admin/appointments" element={<AdminAppointments />} />
                <Route path="/admin/appointments/:id" element={<AdminAppointmentDetail />} />
                <Route path="/admin/calendar" element={<AdminCalendar />} />
                <Route path="/admin/projects" element={<AdminProjects />} />
                <Route path="/admin/projects/:id" element={<AdminProjectDetail />} />
                <Route path="/admin/documents" element={<AdminDocuments />} />
                <Route path="/admin/blueprints" element={<AdminBlueprints />} />
                <Route path="/admin/clients" element={<AdminClients />} />
                <Route path="/admin/clients/:id" element={<AdminClientDetail />} />
                <Route path="/admin/staff" element={<AdminStaff />} />
                <Route path="/admin/services" element={<AdminServices />} />
                <Route path="/admin/reports" element={<AdminReports />} />
                <Route path="/admin/activity" element={<AdminActivity />} />
                <Route path="/admin/inquiries" element={<AdminInquiries />} />
                <Route path="/admin/messages" element={<AdminMessages />} />
                <Route path="/admin/messages/:id" element={<AdminMessages />} />
                <Route path="/admin/notifications" element={<AdminNotifications />} />
                <Route path="/admin/settings" element={<AdminSettings />} />
                <Route path="/admin/profile" element={<AdminProfile />} />
              </Route>
            </Route>

            {/* Field staff */}
            <Route element={<RequireAuth roles={['surveyor']} />}>
              <Route element={<Layout />}>
                <Route path="/staff" element={<StaffDashboard />} />
                <Route path="/staff/schedule" element={<StaffSchedule />} />
                <Route path="/staff/projects" element={<StaffProjects />} />
                <Route path="/staff/projects/:id" element={<StaffProjectDetail />} />
                <Route path="/staff/messages" element={<StaffMessages />} />
                <Route path="/staff/messages/:id" element={<StaffMessages />} />
                <Route path="/staff/notifications" element={<StaffNotifications />} />
                <Route path="/staff/profile" element={<StaffProfile />} />
              </Route>
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
        </ConfirmProvider>
      </ToastProvider>
    </AuthProvider>
  );
}
