import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth/context';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: Array<'astronaut' | 'medical' | 'mission_control' | 'admin'>;
}

export const ProtectedRoute = ({ children, allowedRoles }: ProtectedRouteProps) => {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <section className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-muted-silver text-sm">Restoring session…</div>
      </section>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return (
      <section className="min-h-screen flex items-center justify-center bg-background p-8">
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-serif text-warm-ivory mb-2">Access Restricted</h1>
          <p className="text-muted-silver text-sm">
            Your account does not have permission to view this page.
          </p>
        </div>
      </section>
    );
  }

  return <>{children}</>;
};

export default ProtectedRoute;
