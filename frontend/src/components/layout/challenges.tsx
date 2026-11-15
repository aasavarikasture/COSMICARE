

export const ChallengesSection = () => {
  return (
    <section id="challenges" className="py-16 relative overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <p className="text-xs uppercase tracking-[0.24em] text-celestial-blue mb-3">Why deep space is hard on the body</p>
          <h2 className="text-4xl md:text-5xl font-serif font-bold text-warm-ivory mb-4">
            Spaceflight health challenges
          </h2>
          <p className="text-lg text-muted-silver max-w-2xl mx-auto">
            Extended time beyond Earth changes how the body and mind function. COSMICARE is built around the challenges that matter most in real missions.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-flow-dense lg:grid-cols-[repeat(6,minmax(0,1fr))]">
          {challenges.map((challenge) => (
            <div key={challenge.number} className="col-span-2 lg:col-span-2">
              <div className="group relative rounded-2xl border border-border/10 bg-surface/60 p-5 hover:border-border/30 transition-colors">
                <div className="absolute top-4 right-4 text-xs font-mono text-muted-silver opacity-60">
                  {challenge.number}
                </div>
                <div className="relative z-10">
                  <div className="flex items-center justify-center h-10 mb-3">
                    {challenge.icon}
                  </div>
                  <h3 className="text-lg font-serif text-warm-ivory">{challenge.title}</h3>
                  <p className="text-sm text-muted-silver mt-2 leading-relaxed">{challenge.description}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

const challenges = [
  {
    number: '01',
    title: 'Physical degradation',
    description: 'Muscle atrophy, bone density loss, and fluid shifts can change how the body performs under long-duration microgravity.',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
      </svg>
    ),
  },
  {
    number: '02',
    title: 'Mental wellness',
    description: 'Isolation, confinement, and distance from familiar support systems can strain mood, focus, and resilience over time.',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 2L2 7l10 5 10-5-10-5zM2 12l10 5 10-5" />
      </svg>
    ),
  },
  {
    number: '03',
    title: 'Radiation exposure',
    description: 'Cumulative cosmic radiation dose, dose-rate history, and solar particle event context must be tracked separately from forecasts and risk estimates.',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
      </svg>
    ),
  },
  {
    number: '04',
    title: 'Behavioral health',
    description: 'Crew cohesion, communication, and conflict handling affect group function as much as individual wellbeing.',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
      </svg>
    ),
  },
  {
    number: '05',
    title: 'Sleep and circadian disruption',
    description: 'Altered rest-wake cycles and variable sleep quality can affect alertness, recovery, and decision-making in orbital environments.',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 2L2 7l10 5 10-5-10-5zM2 12l10 5 10-5" />
      </svg>
    ),
  },
  {
    number: '06',
    title: 'Ocular health and SANS',
    description: 'Spaceflight Associated Neuro-ocular Syndrome is tracked through changes in vision and ocular findings during long-duration flight.',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
      </svg>
    ),
  },
];
