import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

export const MissionLifecycleSection = () => {
  return (
    <section id="mission-lifecycle" className="py-16 relative overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-14">
          <p className="text-xs uppercase tracking-[0.24em] text-celestial-blue mb-3">One platform, the whole mission</p>
          <h2 className="text-4xl md:text-5xl font-serif font-bold text-warm-ivory mb-4">
            The complete mission lifecycle
          </h2>
          <p className="text-lg text-muted-silver max-w-2xl mx-auto">
            Every phase of a space mission has different health questions. COSMICARE connects them into one continuous story, from preflight baselines to post-mission recovery.
          </p>
        </div>

        <div className="relative">
          <div className="absolute top-1/2 left-[10%] right-[10%] h-px bg-gradient-to-r from-transparent via-celestial-blue/40 to-transparent" aria-hidden="true" />

          <div className="relative grid md:grid-cols-3 gap-8 lg:gap-6">
            <div className="relative">
              <div className="text-center mb-5">
                <span className="text-xs font-mono text-muted-silver">PHASE 01</span>
                <div className="mx-auto mt-2 w-14 h-14 rounded-full border border-border/20 bg-surface/70 flex items-center justify-center">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" className="text-celestial-blue" aria-hidden="true">
                    <path d="M0 0h24v24H0V0zm12 7l5 5v11h-5v-11zM12 2c5 7 5 7 5 7s2 4 5 4v5h2V7c0-3-2-3-5-3zm0 14c-3 3-5 3-5 3s-2-2-5-2v-5h2v5z" />
                  </svg>
                </div>
              </div>
              <div className="rounded-2xl border border-border/10 bg-surface/60 p-6">
                <h3 className="text-xl font-serif font-medium text-warm-ivory mb-3">Pre-Mission</h3>
                <ul className="space-y-2">
                  {[
                    'Health baselines',
                    'Physical and mental readiness assessments',
                    'Individual risk profiles',
                    'Preflight health reports',
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-3 text-sm text-muted-silver">
                      <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-celestial-blue flex-shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="relative">
              <div className="text-center mb-5">
                <span className="text-xs font-mono text-muted-silver">PHASE 02</span>
                <div className="mx-auto mt-2 w-14 h-14 rounded-full border border-celestial-blue/30 bg-surface/70 flex items-center justify-center">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" className="text-warm-ivory" aria-hidden="true">
                    <path d="M12 3L2 5l10 5 10-5M2 12l10 5 10-5M2 19l10 5 10-5" />
                  </svg>
                </div>
              </div>
              <div className="rounded-2xl border border-border/10 bg-surface/60 p-6">
                <h3 className="text-xl font-serif font-medium text-warm-ivory mb-3">In-Mission</h3>
                <ul className="space-y-2">
                  {[
                    'Physical health monitoring',
                    'Mental wellness tracking',
                    'Radiation intelligence',
                    'AI-assisted support',
                    'Emergency detection and response',
                    'Personalized interventions',
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-3 text-sm text-muted-silver">
                      <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-celestial-blue flex-shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="relative">
              <div className="text-center mb-5">
                <span className="text-xs font-mono text-muted-silver">PHASE 03</span>
                <div className="mx-auto mt-2 w-14 h-14 rounded-full border border-border/20 bg-surface/70 flex items-center justify-center">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" className="text-desaturated-cyan" aria-hidden="true">
                    <path d="M12 7l5-5h-5l-5 5zM12 2c5 7 5 7 5 7s2 4 5 4v5h2V7c0-3-2-3-5-3zm0 14c-3 3-5 3-5 3s-2-2-5-2v-5h2v5z" />
                  </svg>
                </div>
              </div>
              <div className="rounded-2xl border border-border/10 bg-surface/60 p-6">
                <h3 className="text-xl font-serif font-medium text-warm-ivory mb-3">Post-Mission</h3>
                <ul className="space-y-2">
                  {[
                    'Recovery assessments',
                    'Pre/post health comparisons',
                    'Longitudinal monitoring',
                    'Recovery reports',
                    'Research contribution where permitted',
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-3 text-sm text-muted-silver">
                      <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-celestial-blue flex-shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          <div className="mt-12 flex justify-center">
            <Link to="/register">
              <Button variant="outline" size="lg">
                See the mission in action
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
};
