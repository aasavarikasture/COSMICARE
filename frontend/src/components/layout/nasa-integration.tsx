import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

export const NASAIntegrationSection = () => {
  return (
    <section className="py-16 relative overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-8 lg:items-center">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-celestial-blue mb-3">Research foundation</p>
            <h2 className="text-4xl md:text-5xl font-serif font-bold text-warm-ivory mb-6 leading-tight">
              Research and scientific foundation.
            </h2>
            <p className="text-lg text-muted-silver mb-8 leading-relaxed max-w-lg">
              COSMICARE is built with research alignment to publicly documented spaceflight health challenges and commonly cited research programs, including the NASA Human Research Program and the NASA Open Science Data Repository. It is a standalone platform and is not an official NASA product.
            </p>
            <div className="flex gap-3">
              <Link to="/research">              <Button variant="outline" size="sm">View Research</Button></Link>
            </div>
          </div>
          <div className="mt-6 rounded-2xl border border-border/10 bg-surface/80 p-6">
            {/* Earth-inspired graphic */}
            <svg className="w-full h-64 md:h-80 rounded-xl overflow-hidden bg-charcoal/40 border border-border/10" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
              <path
                fill="var(--celestial-blue)"
                opacity="0.1"
                d="M50 20 Q 50 50, 90 80 Q 70 100, 50 70 Q 30 100, 10 80 Q 30 50, 50 20 Z"
              />
              <circle cx="50" cy="50" r="80" fill="none" stroke="var(--muted-silver)" stroke-width="1" />
              <circle cx="50" cy="50" r="20" fill="var(--deepblack)" />
            </svg>
            <div className="absolute -bottom-2 -left-2 flex items-center gap-2 text-xs">
              <Link to="/research">
                <span className="text-celestial-blue">Explore research</span>
              </Link>
              <span className="text-muted-silver">and public datasets</span>
            </div>
            <p className="text-xs text-muted-silver text-center mt-4">
              COSMICARE is designed with research alignment to publicly documented spaceflight health challenges and commonly cited research programs, including the NASA Human Research Program and the NASA Open Science Data Repository. It is a standalone platform and is not an official NASA product.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};
