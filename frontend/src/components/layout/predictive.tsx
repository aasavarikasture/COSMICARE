import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

export const PredictiveSection = () => {
  return (
    <section id="predictive" className="py-16 relative overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-8 lg:items-center">
          <div>
            <h2 className="text-4xl md:text-5xl font-serif font-bold text-warm-ivory mb-6">
              Predictive Health Analysis
            </h2>
            <p className="text-lg text-muted-silver text-opacity-60 mb-8 max-w-lg">
              AI-driven predictive models that identify potential health issues before they become critical, enabling proactive interventions throughout the mission.
            </p>
            <div className="flex gap-3">
              <Link to="/research">
                <Button variant="outline" size="sm">Run Analysis</Button>
              </Link>
            </div>
          </div>
          <div className="relative">
            <div className="rounded-2xl border border-border/20 bg-surface/80 p-6">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <p className="text-xs uppercase tracking-[0.22em] text-muted-silver">Predictive intelligence</p>
                  <h3 className="text-xl font-serif text-warm-ivory mt-2">Read the arc, not just the moment</h3>
                </div>
                <span className="rounded-full border border-amber-400/30 bg-amber-500/5 px-2.5 py-1 text-xs font-medium text-soft-amber">
                  Estimate only
                </span>
              </div>

              <div className="grid sm:grid-cols-2 gap-2 mb-4">
                <div className="flex items-center justify-between rounded-lg border border-border/10 bg-background/60 p-3">
                  <span className="text-xs uppercase tracking-[0.18em] text-muted-silver">Baseline drift</span>
                  <span className="text-sm font-mono text-celestial-blue">moderate</span>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border/10 bg-background/60 p-3">
                  <span className="text-xs uppercase tracking-[0.18em] text-muted-silver">Anomaly signal</span>
                  <span className="text-sm font-mono text-soft-amber">present</span>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border/10 bg-background/60 p-3">
                  <span className="text-xs uppercase tracking-[0.18em] text-muted-silver">Risk priority</span>
                  <span className="text-sm font-mono text-warm-ivory">review</span>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border/10 bg-background/60 p-3">
                  <span className="text-xs uppercase tracking-[0.18em] text-muted-silver">Uncertainty</span>
                  <span className="text-sm font-mono text-muted-silver">notable</span>
                </div>
              </div>

              <div className="mt-4 rounded-lg border border-border/10 bg-background/60 p-3 text-sm text-muted-silver">
                This panel is a synthetic demonstration layout. Predictive outputs are decision support, not diagnoses, and any real indicator would be labeled with its source, classification, and limitations.
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};