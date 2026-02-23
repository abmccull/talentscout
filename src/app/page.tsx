import { Hero } from "@/components/landing/Hero";
import { StatsStrip } from "@/components/landing/StatsStrip";
import { CoreLoop } from "@/components/landing/CoreLoop";
import { SpecializationShowcase } from "@/components/landing/SpecializationShowcase";
import { FeatureReel } from "@/components/landing/FeatureReel";
import { ScenarioGrid } from "@/components/landing/ScenarioGrid";
import { WorldMap } from "@/components/landing/WorldMap";
import { SocialProof } from "@/components/landing/SocialProof";
import { ComparisonStrip } from "@/components/landing/ComparisonStrip";
import { FinalCTA } from "@/components/landing/FinalCTA";
import { Footer } from "@/components/landing/Footer";

export default function LandingPage() {
  return (
    <main className="bg-[#0a0a0a]">
      <Hero />
      <StatsStrip />
      <CoreLoop />
      <SpecializationShowcase />
      <FeatureReel />
      <ScenarioGrid />
      <WorldMap />
      <SocialProof />
      <ComparisonStrip />
      <FinalCTA />
      <Footer />
    </main>
  );
}
