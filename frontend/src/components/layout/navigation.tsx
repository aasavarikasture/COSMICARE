import { cn } from '../../lib/cn';
import { Link } from 'react-router-dom';

interface NavigationProps {
  role?: 'astronaut' | 'medical' | 'mission_control' | 'admin';
}

export const Navigation = ({ role }: NavigationProps) => {
  const navItems = {
    astronaut: [
      { label: 'Overview', href: '/astronaut' },
      { label: 'My Health', href: '/astronaut' },
      { label: 'Physical Health', href: '/astronaut' },
      { label: 'Mental Wellness', href: '/astronaut' },
      { label: 'Radiation', href: '/astronaut' },
      { label: 'AI Companion', href: '/astronaut' },
      { label: 'Assessments', href: '/astronaut' },
      { label: 'Recommendations', href: '/astronaut' },
      { label: 'Mission Timeline', href: '/astronaut' },
      { label: 'Emergency Assistance', href: '/astronaut' },
      { label: 'Research', href: '/research' },
      { label: 'Settings', href: '/astronaut' },
    ],
    medical: [
      { label: 'Overview', href: '/medical' },
      { label: 'Assigned Astronauts', href: '/medical' },
      { label: 'Health Monitoring', href: '/medical' },
      { label: 'Assessments', href: '/medical' },
      { label: 'Alerts', href: '/medical' },
      { label: 'Incidents', href: '/medical' },
      { label: 'Interventions', href: '/medical' },
      { label: 'Communication', href: '/medical' },
      { label: 'Reports', href: '/medical' },
      { label: 'Simulation', href: '/simulation' },
      { label: 'Research', href: '/research' },
    ],
    mission_control: [
      { label: 'Mission Overview', href: '/mission-control' },
      { label: 'Crew Monitoring', href: '/mission-control' },
      { label: 'Health Intelligence', href: '/mission-control' },
      { label: 'Radiation Monitoring', href: '/mission-control' },
      { label: 'Emergency Centre', href: '/mission-control' },
      { label: 'Mission Analytics', href: '/mission-control' },
      { label: 'Mission Timeline', href: '/mission-control' },
      { label: 'Communication', href: '/mission-control' },
      { label: 'Simulation', href: '/simulation' },
      { label: 'Research', href: '/research' },
    ],
    admin: [
      { label: 'Overview', href: '/admin' },
      { label: 'Users', href: '/admin' },
      { label: 'Missions', href: '/admin' },
      { label: 'Assignments', href: '/admin' },
      { label: 'Permissions', href: '/admin' },
      { label: 'Audit Logs', href: '/admin' },
      { label: 'System Settings', href: '/admin' },
      { label: 'Simulation', href: '/simulation' },
      { label: 'Research', href: '/research' },
    ],
  };

  const safeRole = role || 'astronaut';

  return (
    <nav className="bg-charcoal/80 border-b border-border/20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-3">
            <Link to="/" className="text-xl font-serif font-bold text-warm-ivory">
              COSMICARE
            </Link>
          </div>
          <button
            aria-label="Open navigation menu"
            className="hidden sm:block p-2 rounded-md hover:bg-charcoal transition-colors"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M3 12l2-2m0 0l2-2m-2 2l2 2m2-2l-2 2m7-3v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3m3 0V5a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3" stroke="var(--warm-ivory)" />
            </svg>
          </button>
        </div>
        {/* Mobile navigation drawer would go here */}
        <div className="hidden sm:flex items-center gap-8">
          {role && (
            <div className="hidden lg:flex items-center gap-8">
              {navItems[safeRole]?.map((item, index) => (
                <Link
                  key={index}
                  to={item.href}
                  className={cn(
                    'text-sm text-muted-silver hover:text-warm-ivory transition-colors',
                    'py-2 px-3 rounded-md',
                    'border-b-2 border-transparent',
                    'data-state="active" && border-warm-ivory text-warm-ivory',
                  )}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </nav>
  );
};
