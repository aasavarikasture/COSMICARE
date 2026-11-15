import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

export const RadiationSection = () => {
  return (
    <section id="radiation" className="py-16 relative overflow-hidden" style={{ backgroundColor: 'var(--background)' }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-8 lg:items-center">
          <div>
            <h2 className="text-4xl md:text-5xl font-serif font-bold text-warm-ivory mb-6">
              Radiation Intelligence
            </h2>
            <p className="text-lg text-muted-silver text-opacity-60 mb-8 max-w-lg">
              Real-time cosmic radiation tracking and predictive risk assessment to protect crew health during solar events and deep space transit.
            </p>
            <div className="flex gap-3">
              <Link to="/research">
                <Button variant="outline" size="sm">View Report</Button>
              </Link>
            </div>
          </div>
          <div className="relative rounded-xl border border-border/20 bg-charcoal/40 p-4 overflow-hidden">
            <svg className="w-full h-64 md:h-80" viewBox="0 0 200 160" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
              <defs>
                <radialGradient id="radiation-glow" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="var(--soft-amber)" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="var(--soft-amber)" stopOpacity="0" />
                </radialGradient>
              </defs>
              <rect width="200" height="160" fill="var(--deepblack)" />
              <circle cx="100" cy="80" r="70" fill="url(#radiation-glow)" />
              <ellipse cx="100" cy="80" rx="78" ry="30" fill="none" stroke="var(--celestial-blue)" strokeWidth="1" opacity="0.5" />
              <ellipse cx="100" cy="80" rx="52" ry="20" fill="none" stroke="var(--desaturated-cyan)" strokeWidth="1" opacity="0.6" />
              <circle cx="100" cy="80" r="12" fill="var(--soft-amber)" opacity="0.9" />
              <g stroke="var(--muted-silver)" strokeWidth="0.8" opacity="0.7">
                <line x1="22" y1="40" x2="178" y2="40" />
                <line x1="22" y1="120" x2="178" y2="120" />
              </g>
              <g fill="var(--warm-ivory)">
                <circle cx="40" cy="34" r="1.5" />
                <circle cx="160" cy="46" r="1.5" />
                <circle cx="55" cy="126" r="1.5" />
                <circle cx="145" cy="114" r="1.5" />
              </g>
            </svg>
            <p className="text-xs text-muted-silver text-center mt-4">
              Radiation intelligence on COSMICARE is presented in the authenticated mission views. Measured dose, cumulative exposure, dose-rate history, solar particle event context, space-weather information, and estimated biological-risk indicators are kept separate, and any sample values are clearly labelled as simulated.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};