import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';

export const HeroSection = () => {
  return (
    <section className="relative min-h-[92vh] overflow-hidden">
      <div className="absolute inset-0" aria-hidden="true">
        <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice">
          <path d="M0 20 Q25 10 50 20 T100 20" fill="none" stroke="var(--celestial-blue)" strokeWidth="0.5" opacity="0.4" />
          <path d="M0 40 Q25 50 50 40 T100 40" fill="none" stroke="var(--muted-silver)" strokeWidth="0.5" opacity="0.3" />
          <path d="M0 60 Q25 70 50 60 T100 60" fill="none" stroke="var(--celestial-blue)" strokeWidth="0.5" opacity="0.4" />
          <path d="M0 80 Q25 70 50 80 T100 80" fill="none" stroke="var(--muted-silver)" strokeWidth="0.5" opacity="0.3" />
        </svg>
      </div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-28">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-celestial-blue mb-4">Astronaut health intelligence</p>
            <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-serif font-bold text-warm-ivory leading-[1.1] mb-6">
              Intelligent Care<br />
              for the Final<br />
              Frontier
            </h1>
            <p className="text-lg md:text-xl text-muted-silver mb-10 leading-relaxed max-w-xl">
              COSMICARE is an AI-powered astronaut health intelligence platform designed to monitor, understand, and protect crew wellbeing throughout the entire space mission lifecycle.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link to="/register">
                <Button variant="default" size="lg">
                  Get Started
                </Button>
              </Link>
              <Link to="#mission-lifecycle">
                <Button variant="outline" size="lg">
                  Explore the Platform
                </Button>
              </Link>
              <Link to="/mission-control">
                <Button variant="secondary" size="lg">
                  Mission Control
                </Button>
              </Link>
            </div>
          </div>

          <div className="relative">
            <div className="absolute inset-0 rounded-3xl border border-border/20 bg-surface/60 p-4 overflow-hidden">
              <div className="absolute inset-x-0 -bottom-9 inset-y-16 flex justify-center z-10" aria-hidden="true">
                <span className="rounded-full border border-border/20 bg-surface/90 px-3 py-1.5 text-xs font-mono text-muted-silver">
                  COSMICARE / LIFECYCLE
                </span>
              </div>
              <svg className="w-full h-auto max-w-xs" viewBox="0 0 200 200" aria-hidden="true">
                <circle cx="100" cy="100" r="86" fill="none" stroke="var(--border)" strokeWidth="0.6" opacity="0.6" />
                <circle cx="100" cy="100" r="62" fill="none" stroke="var(--celestial-blue)" strokeWidth="0.6" opacity="0.5" />
                <circle cx="100" cy="100" r="38" fill="none" stroke="var(--desaturated-cyan)" strokeWidth="0.6" opacity="0.5" />
                <g fill="none" stroke="var(--muted-silver)" strokeWidth="0.6" opacity="0.55">
                  <path d="M54 54 Q78 78 54 100" />
                  <path d="M146 54 Q122 78 146 100" />
                  <path d="M54 146 Q78 122 100 122" />
                  <path d="M146 146 Q122 122 100 122" />
                </g>
                <circle cx="100" cy="62" r="3.2" fill="var(--celestial-blue)" />
                <circle cx="52" cy="100" r="2.6" fill="var(--warm-ivory)" />
                <circle cx="148" cy="100" r="2.6" fill="var(--warm-ivory)" />
                <circle cx="100" cy="138" r="2.6" fill="var(--soft-amber)" />
                <circle cx="68" cy="76" r="1.6" fill="var(--dusty-violet)" />
                <circle cx="132" cy="76" r="1.6" fill="var(--dusty-violet)" />
                <circle cx="68" cy="124" r="1.6" fill="var(--dusty-violet)" />
                <circle cx="132" cy="124" r="1.6" fill="var(--dusty-violet)" />
              </svg>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};