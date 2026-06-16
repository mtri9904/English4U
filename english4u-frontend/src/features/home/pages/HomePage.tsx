import { LandingHeader } from '../components/LandingHeader'
import { HeroSection } from '../components/HeroSection'
import { FeaturesSection } from '../components/FeaturesSection'
import { SpeakingCoachDemo } from '../components/SpeakingCoachDemo'
import { WritingFeedbackDemo } from '../components/WritingFeedbackDemo'
import { ExamGeneratorDemo } from '../components/ExamGeneratorDemo'
import { ExamSimulatorShowcase } from '../components/ExamSimulatorShowcase'
import { GamificationSection } from '../components/GamificationSection'
import { CallToAction } from '../components/CallToAction'
import { LandingFooter } from '../components/LandingFooter'

export function HomePage() {
    return (
        <div style={{ minHeight: '100vh', overflowX: 'hidden' }}>
            <LandingHeader />
            <HeroSection />
            <FeaturesSection />
            <SpeakingCoachDemo />
            <WritingFeedbackDemo />
            <ExamGeneratorDemo />
            <ExamSimulatorShowcase />
            <GamificationSection />
            <CallToAction />
            <LandingFooter />
        </div>
    )
}
