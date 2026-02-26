import { Button } from '@/shared/ui/Button/Button'
import { Card } from '@/shared/ui/Card/Card'
import { Badge } from '@/shared/ui/Badge/Badge'
import { ProgressBar } from '@/shared/ui/ProgressBar/ProgressBar'
import { SkillTag } from '@/shared/ui/SkillTag/SkillTag'
import { StatCard } from '@/shared/ui/StatCard/StatCard'

export function DesignSystemPage() {
    return (
        <div style={{ minHeight: '100vh', background: 'var(--color-bg)', fontFamily: 'var(--font-sans)' }}>
            <header
                style={{
                    background: 'rgba(255,255,255,0.8)',
                    backdropFilter: 'blur(16px)',
                    borderBottom: '1px solid var(--color-border)',
                    position: 'sticky',
                    top: 0,
                    zIndex: 100,
                    padding: '0 24px',
                }}
            >
                <div
                    className="container-app"
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        height: 64,
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div
                            style={{
                                width: 36,
                                height: 36,
                                borderRadius: 10,
                                background: 'var(--color-primary)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#fff',
                                fontWeight: 800,
                                fontSize: 18,
                                fontFamily: 'var(--font-serif)',
                            }}
                        >
                            E
                        </div>
                        <span
                            style={{
                                fontFamily: 'var(--font-serif)',
                                fontSize: '1.25rem',
                                fontWeight: 700,
                                color: 'var(--color-text-primary)',
                            }}
                        >
                            English4U
                        </span>
                    </div>
                    <nav style={{ display: 'flex', gap: 8 }}>
                        <Button variant="ghost" size="sm">Courses</Button>
                        <Button variant="ghost" size="sm">Practice</Button>
                        <Button variant="primary" size="sm">Get Started</Button>
                    </nav>
                </div>
            </header>

            <main>
                <section
                    style={{
                        position: 'relative',
                        overflow: 'hidden',
                        padding: '100px 24px 80px',
                    }}
                >
                    <div
                        style={{
                            position: 'absolute',
                            inset: 0,
                            background:
                                'radial-gradient(ellipse 70% 60% at 60% 50%, rgba(19, 125, 197, 0.12) 0%, transparent 70%), radial-gradient(ellipse 40% 40% at 20% 80%, rgba(250, 207, 57, 0.08) 0%, transparent 60%)',
                            pointerEvents: 'none',
                        }}
                    />
                    <div className="container-app" style={{ position: 'relative' }}>
                        <div style={{ maxWidth: 680 }}>
                            <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
                                <Badge variant="primary" dot>AI-Powered</Badge>
                                <Badge variant="accent">IELTS Ready</Badge>
                            </div>
                            <h1 className="text-heading-xl" style={{ marginBottom: 20 }}>
                                Master English with{' '}
                                <span style={{ color: 'var(--color-primary)' }}>Intelligent</span>{' '}
                                Practice
                            </h1>
                            <p
                                style={{
                                    fontSize: '1.125rem',
                                    color: 'var(--color-text-secondary)',
                                    lineHeight: 1.7,
                                    marginBottom: 36,
                                    maxWidth: 560,
                                }}
                            >
                                Personalized AI-driven lessons for Listening, Speaking, Reading and
                                Writing. Track your progress and compete with peers globally.
                            </p>
                            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                                <Button variant="primary" size="lg" icon={<span>🚀</span>}>
                                    Start Free Trial
                                </Button>
                                <Button variant="ghost" size="lg" icon={<span>▶</span>}>
                                    Watch Demo
                                </Button>
                            </div>
                            <div
                                style={{
                                    display: 'flex',
                                    gap: 32,
                                    marginTop: 48,
                                    padding: '20px 0',
                                    borderTop: '1px solid var(--color-border)',
                                }}
                            >
                                {[
                                    { value: '50K+', label: 'Active Learners' },
                                    { value: '95%', label: 'Pass Rate' },
                                    { value: '300+', label: 'AI Exercises' },
                                ].map((s) => (
                                    <div key={s.label}>
                                        <div
                                            style={{
                                                fontSize: '1.5rem',
                                                fontWeight: 800,
                                                color: 'var(--color-text-primary)',
                                                lineHeight: 1,
                                            }}
                                        >
                                            {s.value}
                                        </div>
                                        <div
                                            style={{
                                                fontSize: '0.8125rem',
                                                color: 'var(--color-text-secondary)',
                                                marginTop: 4,
                                            }}
                                        >
                                            {s.label}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </section>

                <section style={{ padding: '80px 24px' }}>
                    <div className="container-app">
                        <div style={{ textAlign: 'center', marginBottom: 48 }}>
                            <p className="text-label" style={{ marginBottom: 8 }}>Design System</p>
                            <h2 className="text-heading-lg">Component Library</h2>
                        </div>

                        <div style={{ display: 'grid', gap: 32 }}>
                            <ShowcaseSection title="Color Palette">
                                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                                    {[
                                        { color: '#137dc5', label: 'Digital Blue', main: true },
                                        { color: '#0f6aab', label: 'Hover Blue' },
                                        { color: '#e8f4fd', label: 'Light Blue' },
                                        { color: '#facf39', label: 'Sunny Yellow', main: true },
                                        { color: '#f4f4f7', label: 'Moonlit Grey', border: true },
                                        { color: '#0f1c2e', label: 'Dark Text' },
                                        { color: '#5a6a7e', label: 'Muted Text' },
                                        { color: '#22c55e', label: 'Success' },
                                        { color: '#ef4444', label: 'Error' },
                                    ].map((c) => (
                                        <div key={c.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                                            <div
                                                style={{
                                                    width: 56,
                                                    height: 56,
                                                    borderRadius: 12,
                                                    background: c.color,
                                                    border: c.border ? '2px solid var(--color-border-strong)' : 'none',
                                                    boxShadow: 'var(--shadow-sm)',
                                                }}
                                            />
                                            <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-secondary)', textAlign: 'center', maxWidth: 70 }}>
                                                {c.label}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </ShowcaseSection>

                            <ShowcaseSection title="Typography">
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                    <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '3rem', fontWeight: 700, lineHeight: 1.15 }}>
                                        Retro Serif H1
                                    </h1>
                                    <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '2.25rem', fontWeight: 600 }}>
                                        Retro Serif H2
                                    </h2>
                                    <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.75rem', fontWeight: 600 }}>
                                        Retro Serif H3
                                    </h3>
                                    <p style={{ fontFamily: 'var(--font-sans)', fontSize: '1rem', lineHeight: 1.7, color: 'var(--color-text-secondary)', maxWidth: 560 }}>
                                        Geometric Sans-serif body text — Inter typeface for maximum legibility and modern aesthetic. Used for all content, labels, and UI elements.
                                    </p>
                                    <p className="text-label">Uppercase Label Text</p>
                                </div>
                            </ShowcaseSection>

                            <ShowcaseSection title="Buttons">
                                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                                    <Button variant="primary">Primary Action</Button>
                                    <Button variant="accent">Accent / CTA</Button>
                                    <Button variant="ghost">Ghost Button</Button>
                                    <Button variant="primary" loading>Loading...</Button>
                                    <Button variant="primary" size="sm">Small</Button>
                                    <Button variant="primary" size="lg">Large</Button>
                                    <Button variant="primary" icon={<span>✨</span>}>With Icon</Button>
                                </div>
                            </ShowcaseSection>

                            <ShowcaseSection title="Badges & Tags">
                                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                                    <Badge variant="primary">Primary</Badge>
                                    <Badge variant="accent" dot>Gamification</Badge>
                                    <Badge variant="success" dot>Active</Badge>
                                    <Badge variant="warning">In Progress</Badge>
                                    <Badge variant="error">Error</Badge>
                                    <Badge variant="neutral">Neutral</Badge>
                                </div>
                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
                                    <SkillTag skill="listening" />
                                    <SkillTag skill="speaking" />
                                    <SkillTag skill="reading" />
                                    <SkillTag skill="writing" />
                                    <SkillTag skill="grammar" />
                                    <SkillTag skill="vocabulary" />
                                </div>
                            </ShowcaseSection>

                            <ShowcaseSection title="Cards">
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
                                    <Card variant="solid" style={{ padding: 24 }}>
                                        <div style={{ fontWeight: 600, marginBottom: 8 }}>Solid Card</div>
                                        <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
                                            Semi-transparent white background with subtle blur for depth.
                                        </p>
                                    </Card>
                                    <Card variant="glass" style={{ padding: 24 }}>
                                        <div style={{ fontWeight: 600, marginBottom: 8 }}>Glass Card</div>
                                        <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
                                            Full glassmorphism effect with more transparency and blur.
                                        </p>
                                    </Card>
                                    <Card variant="solid" hover style={{ padding: 24 }} onClick={() => { }}>
                                        <div style={{ fontWeight: 600, marginBottom: 8 }}>Hoverable Card ↗</div>
                                        <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
                                            Lift animation on hover, used for course cards and interactive items.
                                        </p>
                                    </Card>
                                </div>
                            </ShowcaseSection>

                            <ShowcaseSection title="Progress Bars">
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 560 }}>
                                    <div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
                                            <span>Listening</span><span>78%</span>
                                        </div>
                                        <ProgressBar value={78} variant="primary" showLabel={false} />
                                    </div>
                                    <div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
                                            <span>Speaking</span><span>52%</span>
                                        </div>
                                        <ProgressBar value={52} variant="accent" showLabel={false} />
                                    </div>
                                    <div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
                                            <span>Reading</span><span>91%</span>
                                        </div>
                                        <ProgressBar value={91} variant="success" showLabel={false} />
                                    </div>
                                    <ProgressBar value={65} variant="primary" size="sm" showLabel />
                                    <ProgressBar value={40} variant="accent" size="lg" showLabel />
                                </div>
                            </ShowcaseSection>

                            <ShowcaseSection title="Stat Cards (Dashboard Metrics)">
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
                                    <StatCard
                                        icon="🔥"
                                        label="Day Streak"
                                        value="14"
                                        trend={{ value: 8, positive: true }}
                                        accent
                                    />
                                    <StatCard
                                        icon="⭐"
                                        label="Total XP"
                                        value="4,820"
                                        trend={{ value: 12, positive: true }}
                                    />
                                    <StatCard
                                        icon="📝"
                                        label="Lessons Done"
                                        value="127"
                                        trend={{ value: 3, positive: true }}
                                    />
                                    <StatCard
                                        icon="🎯"
                                        label="Accuracy"
                                        value="87%"
                                        trend={{ value: 2, positive: false }}
                                    />
                                </div>
                            </ShowcaseSection>

                            <ShowcaseSection title="Glassmorphism Effects">
                                <div
                                    style={{
                                        position: 'relative',
                                        padding: 40,
                                        borderRadius: 20,
                                        background: 'linear-gradient(135deg, #137dc5 0%, #0c5a92 50%, #0d1b2a 100%)',
                                        overflow: 'hidden',
                                    }}
                                >
                                    <div
                                        style={{
                                            position: 'absolute',
                                            top: -40,
                                            right: -40,
                                            width: 200,
                                            height: 200,
                                            borderRadius: '50%',
                                            background: 'rgba(250, 207, 57, 0.2)',
                                            filter: 'blur(40px)',
                                        }}
                                    />
                                    <div
                                        style={{
                                            position: 'absolute',
                                            bottom: -60,
                                            left: -20,
                                            width: 160,
                                            height: 160,
                                            borderRadius: '50%',
                                            background: 'rgba(255, 255, 255, 0.1)',
                                            filter: 'blur(30px)',
                                        }}
                                    />
                                    <div style={{ position: 'relative', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                                        <div
                                            style={{
                                                flex: 1,
                                                minWidth: 220,
                                                padding: 24,
                                                background: 'rgba(255, 255, 255, 0.12)',
                                                backdropFilter: 'blur(16px)',
                                                border: '1px solid rgba(255, 255, 255, 0.2)',
                                                borderRadius: 16,
                                            }}
                                        >
                                            <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
                                                Current Level
                                            </div>
                                            <div style={{ color: '#fff', fontSize: '2rem', fontWeight: 800 }}>B2</div>
                                            <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.875rem', marginTop: 4 }}>Upper Intermediate</div>
                                        </div>
                                        <div
                                            style={{
                                                flex: 1,
                                                minWidth: 220,
                                                padding: 24,
                                                background: 'rgba(250, 207, 57, 0.15)',
                                                backdropFilter: 'blur(16px)',
                                                border: '1px solid rgba(250, 207, 57, 0.25)',
                                                borderRadius: 16,
                                            }}
                                        >
                                            <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
                                                Weekly Goal
                                            </div>
                                            <div style={{ color: '#facf39', fontSize: '2rem', fontWeight: 800 }}>680</div>
                                            <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.875rem', marginTop: 4 }}>of 1000 XP</div>
                                            <ProgressBar value={68} variant="accent" size="sm" />
                                        </div>
                                    </div>
                                </div>
                            </ShowcaseSection>
                        </div>
                    </div>
                </section>
            </main>

            <footer
                style={{
                    borderTop: '1px solid var(--color-border)',
                    padding: '32px 24px',
                    textAlign: 'center',
                    color: 'var(--color-text-muted)',
                    fontSize: '0.875rem',
                }}
            >
                <div className="container-app">
                    English4U Design System — Bold Minimalism × Glassmorphism
                </div>
            </footer>
        </div>
    )
}

interface ShowcaseSectionProps {
    title: string
    children: React.ReactNode
}

function ShowcaseSection({ title, children }: ShowcaseSectionProps) {
    return (
        <Card variant="solid" style={{ padding: 32 }}>
            <h3
                style={{
                    fontFamily: 'var(--font-sans)',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: 'var(--color-text-secondary)',
                    marginBottom: 24,
                }}
            >
                {title}
            </h3>
            {children}
        </Card>
    )
}
