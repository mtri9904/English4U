import { LandingHeader } from '../components/LandingHeader'
import { HeroSection } from '../components/HeroSection'
import { FeaturesSection } from '../components/FeaturesSection'
import { PricingSection } from '../components/PricingSection'
import { LandingFooter } from '../components/LandingFooter'

export function HomePage() {
    return (
        <div style={{ minHeight: '100vh', overflowX: 'hidden' }}>
            <LandingHeader />
            <HeroSection />
            <FeaturesSection />
            <PricingSection />
            <LandingFooter />
        </div>
    )
}
