import { Suspense, lazy } from 'react';
import { Routes, Route, Link } from 'react-router-dom';
import { AuthProvider } from './lib/auth/context';
import { LoginPage } from './pages/auth/login';
import { RegisterPage } from './pages/auth/register';
import { LandingPage } from './pages/landing';
import { ProtectedRoute } from './components/ProtectedRoute';
import { ErrorBoundary } from './components/ErrorBoundary';

const AstronautDashboard = lazy(() => import('./pages/astronaut').then((m) => ({ default: m.AstronautDashboard })));
const MissionControlDashboard = lazy(() => import('./pages/mission-control').then((m) => ({ default: m.MissionControlDashboard })));
const MedicalDashboard = lazy(() => import('./pages/medical').then((m) => ({ default: m.MedicalDashboard })));
const SimulationDashboard = lazy(() => import('./pages/simulation').then((m) => ({ default: m.SimulationDashboard })));
const ResearchExplorer = lazy(() => import('./pages/research').then((m) => ({ default: m.ResearchExplorer })));
const AdminDashboard = lazy(() => import('./pages/admin').then((m) => ({ default: m.AdminDashboard })));

function RouteFallback() {
  return (
    <section className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-muted-silver text-sm">Loading…</div>
    </section>
  );
}

function NotFound() {
  return (
    <section className="min-h-screen flex items-center justify-center bg-background p-8">
      <div className="text-center">
        <h1 className="text-3xl font-serif text-warm-ivory mb-2">404</h1>
        <p className="text-muted-silver">Page not found</p>
        <Link to="/" className="text-celestial-blue hover:underline mt-4 inline-block">
          Return home
        </Link>
      </div>
    </section>
  );
}

function PlaceholderPage({ title, body }: { title: string; body: string }) {
  return (
    <section className="min-h-screen flex items-center justify-center bg-background p-8">
      <div className="text-center max-w-md">
        <h1 className="text-3xl font-serif text-warm-ivory mb-2">{title}</h1>
        <p className="text-muted-silver text-sm mb-6">{body}</p>
        <Link to="/" className="text-celestial-blue hover:underline">
          Return home
        </Link>
      </div>
    </section>
  );
}

export default function App() {  return (
    <AuthProvider>
      <ErrorBoundary>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/privacy" element={<PlaceholderPage title="Privacy" body="COSMICARE privacy policy placeholder. Contact the mission team for details." />} />
        <Route path="/terms" element={<PlaceholderPage title="Terms" body="COSMICARE terms of service placeholder." />} />
        <Route path="/contact" element={<PlaceholderPage title="Contact" body="Reach the COSMICARE team via your mission support channel." />} />

        {/* Role-aware protected routes */}
        <Route
          path="/astronaut"
          element={
            <ProtectedRoute allowedRoles={['astronaut']}>
              <AstronautDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/medical"
          element={
            <ProtectedRoute allowedRoles={['medical']}>
              <MedicalDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/mission-control"
          element={
            <ProtectedRoute allowedRoles={['mission_control']}>
              <MissionControlDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <AdminDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/simulation"
          element={
            <ProtectedRoute allowedRoles={['medical', 'mission_control', 'admin']}>
              <SimulationDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/research"
          element={
            <ProtectedRoute allowedRoles={['astronaut', 'medical', 'mission_control', 'admin']}>
              <ResearchExplorer />
            </ProtectedRoute>
          }
        />        {/* Fallback for unknown routes */}
        <Route path="*" element={<NotFound />} />
      </Routes>
        </Suspense>
      </ErrorBoundary>
    </AuthProvider>
  );
}
