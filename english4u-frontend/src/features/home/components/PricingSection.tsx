import { useState } from 'react'
import { Badge } from '@/shared/ui/Badge'
import { FadeIn } from './FeaturesSection'

type BillingCycle = 'monthly' | 'yearly'

interface Plan {
    id: string; name: string; price: { monthly: number; yearly: number }; description: string; features: string[]; popular?: boolean; highlight?: string; cta: string; color: string; gradientFrom: string
}

const PLANS: Plan[] = [
    { id: 'basic', name: 'Basic', price: { monthly: 0, yearly: 0 }, description: 'Perfect for beginners exploring AI-powered English learning.', features: ['5 AI lessons / month', 'Basic listening exercises', 'Reading comprehension tests', 'Progress tracking', 'Community forum access'], cta: 'Start Free', color: '#5a6a7e', gradientFrom: 'rgba(90,106,126,0.06)' },
    { id: 'pro', name: 'Pro', price: { monthly: 12, yearly: 9 }, description: 'The ultimate IELTS prep toolkit with unlimited AI practice.', features: ['Unlimited AI lessons', 'AI Speaking with scoring', 'AI Writing band scorer', 'Mock IELTS exams', 'Flashcard AI generator', 'Priority support', 'Offline downloads'], popular: true, highlight: 'Most Popular', cta: 'Get Pro Now', color: '#137dc5', gradientFrom: 'rgba(19,125,197,0.08)' },
    { id: 'premium', name: 'Premium', price: { monthly: 28, yearly: 22 }, description: 'For serious learners who want 1-on-1 human tutor sessions.', features: ['Everything in Pro', '4 live tutor sessions / month', 'Personalised study plan', 'IELTS exam guarantee', 'Certificate of completion', 'Dedicated success coach', 'Early access to new features'], cta: 'Go Premium', color: '#7c3aed', gradientFrom: 'rgba(124,58,237,0.06)' },
]

export function PricingSection() {
    const [billing, setBilling] = useState<BillingCycle>('monthly')
    return (
        <section id="pricing" style={{ padding: '100px 24px', position: 'relative', background: 'linear-gradient(180deg, var(--color-bg) 0%, rgba(19,125,197,0.04) 50%, var(--color-bg) 100%)' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'linear-gradient(90deg, transparent, var(--color-border-strong), transparent)' }} />
            <div className="container-app">
                <FadeIn>
                    <div style={{ textAlign: 'center', marginBottom: 56 }}>
                        <p className="text-label" style={{ marginBottom: 12 }}>Transparent Pricing</p>
                        <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(2rem, 3.5vw, 2.75rem)', fontWeight: 700, letterSpacing: '-0.025em', marginBottom: 16, color: 'var(--color-text-primary)' }}>
                            Choose your path to<span style={{ color: 'var(--color-primary)' }}> fluency</span>
                        </h2>
                        <p style={{ fontSize: '1.0625rem', color: 'var(--color-text-secondary)', maxWidth: 460, margin: '0 auto 28px', lineHeight: 1.7 }}>Start free, upgrade when you're ready. Cancel anytime.</p>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'rgba(255,255,255,0.8)', border: '1.5px solid var(--color-border)', borderRadius: 'var(--radius-full)', padding: 4 }}>
                            {(['monthly', 'yearly'] as const).map((cycle) => (
                                <button key={cycle} onClick={() => setBilling(cycle)}
                                    style={{ padding: '7px 20px', borderRadius: 'var(--radius-full)', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: '0.875rem', transition: 'all 0.2s', background: billing === cycle ? 'var(--color-primary)' : 'transparent', color: billing === cycle ? '#fff' : 'var(--color-text-secondary)' }}>
                                    {cycle === 'monthly' ? 'Monthly' : <>Yearly <span style={{ fontSize: '0.6875rem', background: 'rgba(250,207,57,0.9)', color: '#7a4800', padding: '1px 6px', borderRadius: 99, fontWeight: 700 }}>−25%</span></>}
                                </button>
                            ))}
                        </div>
                    </div>
                </FadeIn>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: 20, alignItems: 'stretch' }}>
                    {PLANS.map((plan, i) => <FadeIn key={plan.id} delay={i * 120}><PlanCard plan={plan} billing={billing} /></FadeIn>)}
                </div>
                <FadeIn delay={400}>
                    <div style={{ marginTop: 48, textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
                        <span>✅ No credit card required for Basic</span><span style={{ margin: '0 16px' }}>·</span>
                        <span>✅ SSL Secure Checkout</span><span style={{ margin: '0 16px' }}>·</span>
                        <span>✅ Cancel anytime</span>
                    </div>
                </FadeIn>
            </div>
        </section>
    )
}

function PlanCard({ plan, billing }: { plan: Plan; billing: BillingCycle }) {
    const [hovered, setHovered] = useState(false)
    const price = plan.price[billing]
    const isPopular = plan.popular
    return (
        <div onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
            style={{ position: 'relative', background: isPopular ? `linear-gradient(160deg, rgba(19,125,197,0.06) 0%, rgba(255,255,255,0.95) 60%)` : 'rgba(255,255,255,0.85)', border: isPopular ? `2px solid ${plan.color}50` : `1.5px solid ${hovered ? plan.color + '30' : 'var(--color-border)'}`, borderRadius: 22, padding: '32px 28px', display: 'flex', flexDirection: 'column', transition: 'all 0.3s cubic-bezier(0.4,0,0.2,1)', boxShadow: isPopular ? '0 20px 56px rgba(19,125,197,0.16)' : hovered ? 'var(--shadow-md)' : 'var(--shadow-sm)', transform: isPopular ? 'scale(1.03)' : hovered ? 'translateY(-4px)' : 'translateY(0)' }}>
            {isPopular && (
                <div style={{ position: 'absolute', top: -14, left: '50%', transform: 'translateX(-50%)' }}>
                    <Badge variant="accent" dot>{plan.highlight}</Badge>
                </div>
            )}
            <div style={{ position: 'relative', flex: 1 }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: `${plan.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
                        {plan.id === 'basic' ? '🌱' : plan.id === 'pro' ? '⚡' : '👑'}
                    </div>
                    <span style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)' }}>{plan.name}</span>
                </div>
                <div style={{ marginBottom: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                        <span style={{ fontSize: '2.5rem', fontWeight: 800, color: isPopular ? plan.color : 'var(--color-text-primary)', fontFamily: 'var(--font-sans)', lineHeight: 1 }}>{price === 0 ? 'Free' : `$${price}`}</span>
                        {price > 0 && <span style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', fontWeight: 500 }}>/ mo</span>}
                    </div>
                    {billing === 'yearly' && price > 0 && <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', marginTop: 4 }}>Billed ${price * 12}/year</div>}
                </div>
                <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', lineHeight: 1.6, marginBottom: 24, minHeight: 48 }}>{plan.description}</p>
                <hr style={{ border: 'none', borderTop: '1px solid var(--color-border)', marginBottom: 20 }} />
                <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 28 }}>
                    {plan.features.map((f) => (
                        <li key={f} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.875rem', color: 'var(--color-text-secondary)', fontWeight: 500 }}>
                            <span style={{ width: 18, height: 18, borderRadius: '50%', background: `${plan.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: plan.color, fontSize: 10, fontWeight: 900, flexShrink: 0 }}>✓</span>
                            {f}
                        </li>
                    ))}
                </ul>
                <button style={{ width: '100%', padding: '12px 24px', borderRadius: 12, border: isPopular ? 'none' : `1.5px solid ${plan.color}40`, background: isPopular ? `linear-gradient(135deg, ${plan.color} 0%, #0c5a92 100%)` : 'transparent', color: isPopular ? '#fff' : plan.color, fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: '0.9375rem', cursor: 'pointer', transition: 'all 0.2s', boxShadow: isPopular ? `0 8px 24px ${plan.color}40` : 'none', marginTop: 'auto' }}
                    onMouseEnter={(e) => { if (!isPopular) e.currentTarget.style.background = `${plan.color}10`; else e.currentTarget.style.transform = 'translateY(-1px)' }}
                    onMouseLeave={(e) => { if (!isPopular) e.currentTarget.style.background = 'transparent'; else e.currentTarget.style.transform = 'translateY(0)' }}>
                    {plan.cta} →
                </button>
            </div>
        </div>
    )
}
