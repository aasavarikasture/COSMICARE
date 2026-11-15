import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

export const MissionControlSection = () => {
  return (
    <section className="py-16 relative overflow-hidden" style={{ backgroundColor: 'var(--background)' }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-8 lg:items-center">
          <div>
            <h2 className="text-4xl md:text-5xl font-serif font-bold text-warm-ivory mb-6">
              Mission Control Operations
            </h2>
            <p className="text-lg text-muted-silver text-opacity-60 mb-8 max-w-lg">
              Centralized crew health monitoring and mission oversight for flight surgeons and mission planners.
            </p>
            <div className="flex gap-3">
              <Link to="/mission-control"><Button variant="outline" size="sm">Monitor Mission</Button></Link>
            </div>
          </div>
          <div className="relative">
            <div className="rounded-2xl border border-border/20 bg-surface/80 p-6">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <p className="text-xs uppercase tracking-[0.22em] text-muted-silver">Operation center</p>
                  <h3 className="text-xl font-serif text-warm-ivory mt-2">One view for the mission team</h3>
                </div>
                <span className="rounded-full border border-celestial-blue/30 bg-surface/60 px-2.5 py-1 text-xs font-medium text-celestial-blue">
                  Authorized view
                </span>
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                {[
                  { label: 'Crew status', value: 'assigned' },
                  { label: 'Health alerts', value: 'reviewing' },
                  { label: 'Incidents', value: 'tracked' },
                  { label: 'Radiation context', value: 'available' },
                ].map((item) => (
                  <div key={item.label} className="flex items-center justify-between rounded-lg border border-border/10 bg-background/60 p-3">
                    <span className="text-xs uppercase tracking-[0.18em] text-muted-silver">{item.label}</span>
                    <span className="text-sm font-mono text-warm-ivory">{item.value}</span>
                  </div>
                ))}
              </div>

              <div className="mt-4 rounded-lg border border-border/10 bg-background/60 p-3 text-sm text-muted-silver">
                This panel is a synthetic demonstration layout. Mission-control views show authorized operational information only, not unrestricted private astronaut data.
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
