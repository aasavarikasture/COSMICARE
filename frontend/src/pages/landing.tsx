import { HeroSection } from '../components/layout/hero';
import { ChallengesSection } from '../components/layout/challenges';
import { PhysicalHealthSection } from '../components/layout/physical-health';
import { MentalHealthSection } from '../components/layout/mental-health';
import { RadiationSection } from '../components/layout/radiation';
import { PredictiveSection } from '../components/layout/predictive';
import { MissionControlSection } from '../components/layout/mission-control';
import { MissionLifecycleSection } from '../components/layout/mission-lifecycle';
import { NASAIntegrationSection } from '../components/layout/nasa-integration';
import { Footer } from '../components/layout/footer';

export const LandingPage = () => {
  return (
    <main className="min-h-screen bg-background">
      <HeroSection />
      <ChallengesSection />
      <PhysicalHealthSection />
      <MentalHealthSection />
      <RadiationSection />
      <PredictiveSection />
      <MissionControlSection />
      <MissionLifecycleSection />
      <NASAIntegrationSection />
      <Footer />
    </main>
  );
};
