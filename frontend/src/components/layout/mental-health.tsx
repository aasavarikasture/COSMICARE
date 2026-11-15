import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

const wellnessCapabilities = [
  {
    title: 'Mood and stress assessments',
    detail: 'Short self-reported check-ins can describe mood, stress, fatigue, sleep quality, and related wellbeing signals over time.',
  },
  {
    title: 'Isolation and behavioral wellness',
    detail: 'COSMICARE looks at how an astronaut is coping with isolation, change, and sustained performance demands, not just single symptom snapshots.',
  },
  {
    title: 'Private astronaut AI companion',
    detail: 'The AI companion can help astronauts understand their own wellbeing data in plain language, within the privacy and access rules of the platform.',
  },
  {
    title: 'Personal assessment trends',
    detail: 'Longer arcs of self-reported data can reveal patterns that matter for readiness, recovery, and day-to-day focus.',
  },
  {
    title: 'Privacy and access controls',
    detail: 'Private conversations and sensitive mental-health information are not freely shared with medical staff or mission control. Privacy is part of the design, not an afterthought.',
  },
];

export const MentalHealthSection = () => {
  return (
    <section className="py-16 relative overflow-hidden bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <div className="lg:order-none">
            <div className="rounded-2xl border border-border/10 bg-surface/70 p-6">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <p className="text-xs uppercase tracking-[0.22em] text-muted-silver">Demo wellness snapshot</p>
                  <p className="text-xl font-serif text-warm-ivory mt-2">Current self-report</p>
                </div>
                <span className="rounded-full border border-violet-400/40 bg-violet-500/10 px-2.5 py-1 text-xs font-medium text-violet-200">
                  Private
                </span>
              </div>

              <div className="grid sm:grid-cols-2 gap-3 mb-5">
                <div className="rounded-lg border border-border/10 bg-background/70 p-3">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-silver">Mood</p>
                  <p className="mt-2 text-xl font-semibold text-celestial-blue">7.6/10</p>
                  <p className="mt-1 text-xs text-muted-silver">Simulated self-report</p>
                </div>
                <div className="rounded-lg border border-border/10 bg-background/70 p-3">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-silver">Stress</p>
                  <p className="mt-2 text-xl font-semibold text-emerald-300">3/10</p>
                  <p className="mt-1 text-xs text-muted-silver">Simulated self-report</p>
                </div>
                <div className="rounded-lg border border-border/10 bg-background/70 p-3">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-silver">Fatigue</p>
                  <p className="mt-2 text-xl font-semibold text-soft-amber">2/10</p>
                  <p className="mt-1 text-xs text-muted-silver">Simulated self-report</p>
                </div>
                <div className="rounded-lg border border-border/10 bg-background/70 p-3">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-silver">Sleep quality</p>
                  <p className="mt-2 text-xl font-semibold text-violet-300">8.1/10</p>
                  <p className="mt-1 text-xs text-muted-silver">Simulated self-report</p>
                </div>
              </div>

              <div className="mt-5 rounded-lg border border-amber-400/30 bg-amber-500/5 p-3 text-sm text-amber-100">
                These values are synthetic demonstration data for presentation only. Actual self-assessments are private to the astronaut and become visible only after authenticated access.
              </div>
            </div>

            <div className="mt-6">
              <Link to="/login">
                <Button size="sm">Review wellness</Button>
              </Link>
              <Link to="/research" className="ml-3 inline-block">
                <Button variant="outline" size="sm">View mission context</Button>
              </Link>
            </div>
          </div>

          <div className="lg:order-none">
            <p className="text-xs uppercase tracking-[0.24em] text-violet-300 mb-3">Mental wellness</p>
            <h2 className="text-4xl md:text-5xl font-serif font-bold text-warm-ivory mb-6 leading-tight">
              Private support for sustained focus.
            </h2>
            <p className="text-lg text-muted-silver mb-8 leading-relaxed max-w-xl">
              Spaceflight puts pressure on more than physiology. COSMICARE supports mood, fatigue, sleep quality, isolation, and behavioral wellness with private check-ins, trend review, and AI-assisted guidance designed for the astronaut, not the audience.
            </p>

            <ul className="space-y-5">
              {wellnessCapabilities.map((item, index) => (
                <li key={item.title} className="flex gap-4 last:mb-0">
                  <span className="mt-1 text-violet-300 text-sm font-mono font-medium flex-shrink-0">
                    {String(index + 1).padStart(2, '0')}.
                  </span>
                  <div>
                    <p className="text-warm-ivory font-medium">{item.title}</p>
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
