import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

const healthCapabilities = [
  {
    field: 'Cardiovascular',
    detail: 'Heart rate, rhythm, and exertion context over the course of daily activity and mission events.',
  },
  {
    field: 'Oxygenation',
    detail: 'SpO₂ trends help describe how the body maintains oxygen delivery across sleep, work, and recovery periods.',
  },
  {
    field: 'Sleep and recovery',
    detail: 'Sleep duration, sleep quality, and recovery signals are tracked so patterns can be compared against each astronaut’s own baseline.',
  },
  {
    field: 'Baseline comparison',
    detail: 'COSMICARE compares current readings against individual baselines rather than treating every number in isolation.',
  },
  {
    field: 'Trend and anomaly analysis',
    detail: 'Changes over time and unusual readings can be surfaced for review instead of waiting for a single snapshot.',
  },
  {
    field: 'Predictive estimates with uncertainty',
    detail: 'Where enough data exists, the platform can present projections and risk indicators, always with uncertainty and limitations stated clearly.',
  },
];

export const PhysicalHealthSection = () => {
  return (
    <section className="py-16 relative overflow-hidden bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <div className="order-2 lg:order-none">
            <div className="rounded-2xl border border-border/10 bg-surface/70 p-6">
              <div className="flex items-center space-x-2 mb-4">
                <span className="text-xs font-mono text-muted-silver">DEMONSTRATION SNAPSHOT</span>
                <span className="text-xs text-soft-amber">/ simulated</span>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="rounded-lg border border-border/10 bg-background/70 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-silver">Heart rate</p>
                  <p className="mt-2 text-2xl font-mono text-warm-ivory">62 bpm</p>
                  <p className="mt-1 text-xs text-muted-silver">Simulated telemetry for presentation</p>
                </div>
                <div className="rounded-lg border border-border/10 bg-background/70 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-silver">SpO₂</p>
                  <p className="mt-2 text-2xl font-mono text-warm-ivory">98.4%</p>
                  <p className="mt-1 text-xs text-muted-silver">Simulated mission sensor stream</p>
                </div>
                <div className="rounded-lg border border-border/10 bg-background/70 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-silver">Sleep</p>
                  <p className="mt-2 text-2xl font-mono text-warm-ivory">7.8 h</p>
                  <p className="mt-1 text-xs text-muted-silver">Last 24 hours / simulated</p>
                </div>
                <div className="rounded-lg border border-border/10 bg-background/70 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-silver">Recovery</p>
                  <p className="mt-2 text-2xl font-mono text-warm-ivory">88%</p>
                  <p className="mt-1 text-xs text-muted-silver">Modelled readiness / simulated</p>
                </div>
              </div>

              <div className="mt-5 rounded-lg border border-amber-400/30 bg-amber-500/5 p-3 text-sm text-amber-100">
                These values are synthetic demonstration data shown for presentation only. No real astronaut measurement is represented here.
              </div>
            </div>

            <div className="mt-6">
              <Link to="/login">
                <Button size="sm">Open astronaut dashboard</Button>
              </Link>
              <Link to="/research" className="ml-3 inline-block">
                <Button variant="outline" size="sm">Review mission data</Button>
              </Link>
            </div>
          </div>

          <div className="order-1 lg:order-none">
            <p className="text-xs uppercase tracking-[0.24em] text-celestial-blue mb-3">Physical health</p>
            <h2 className="text-4xl md:text-5xl font-serif font-bold text-warm-ivory mb-6 leading-tight">
              Monitoring the body in flight.
            </h2>
            <p className="text-lg text-muted-silver mb-8 leading-relaxed max-w-xl">
              COSMICARE tracks cardiovascular load, oxygenation, sleep, and recovery through the authenticated astronaut health dashboard. The goal is not just to collect readings, but to understand how each astronaut’s body is changing over time.
            </p>

            <ul className="space-y-5">
              {healthCapabilities.map((item) => (
                <li key={item.field} className="flex gap-4 last:mb-0">
                  <span className="mt-1 text-celestial-blue text-sm font-mono font-medium flex-shrink-0">
                    01.
                  </span>
                  <div>
                    <p className="text-warm-ivory font-medium">{item.field}</p>
                    <p className="text-sm text-muted-silver mt-1">{item.detail}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
};
