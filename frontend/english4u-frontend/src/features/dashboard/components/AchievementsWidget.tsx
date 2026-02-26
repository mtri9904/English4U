import type { Achievement } from './dashboard.types'

const RARITY_STYLE: Record<Achievement['rarity'], { bg: string; border: string; glow: string; label: string }> = {
    common: { bg: 'rgba(90,106,126,0.1)', border: 'rgba(90,106,126,0.25)', glow: 'none', label: 'Common' },
    rare: { bg: 'rgba(19,125,197,0.1)', border: 'rgba(19,125,197,0.3)', glow: '0 0 12px rgba(19,125,197,0.2)', label: 'Rare' },
    epic: { bg: 'rgba(124,58,237,0.1)', border: 'rgba(124,58,237,0.3)', glow: '0 0 12px rgba(124,58,237,0.25)', label: 'Epic' },
    legendary: { bg: 'rgba(250,207,57,0.15)', border: 'rgba(250,207,57,0.4)', glow: '0 0 16px rgba(250,207,57,0.3)', label: 'Legendary' },
}

export function AchievementsWidget({ achievements }: { achievements: Achievement[] }) {
    return (
        <div style={{ background: 'rgba(255,255,255,0.85)', border: '1.5px solid var(--color-border)', borderRadius: 20, padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                <div>
                    <p style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontFamily: 'var(--font-sans)', marginBottom: 4 }}>Your Badges</p>
                    <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>Achievements</h3>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 12px', background: 'rgba(250,207,57,0.15)', border: '1px solid rgba(250,207,57,0.3)', borderRadius: 99, fontSize: '0.8125rem', fontWeight: 700, color: 'var(--color-accent-dark)', fontFamily: 'var(--font-sans)' }}>
                    🏆 {achievements.length} Earned
                </div>
            </div>

            <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 4, scrollbarWidth: 'none' }}>
                {achievements.map((a) => {
                    const style = RARITY_STYLE[a.rarity]
                    return (
                        <div key={a.id} title={`${a.title}: ${a.description}`}
                            style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, cursor: 'pointer', transition: 'transform 0.2s' }}
                            onMouseEnter={(e) => (e.currentTarget.style.transform = 'translateY(-4px) scale(1.05)')}
                            onMouseLeave={(e) => (e.currentTarget.style.transform = 'translateY(0) scale(1)')}>
                            <div style={{ width: 60, height: 60, borderRadius: 16, background: style.bg, border: `1.5px solid ${style.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, boxShadow: style.glow }}>
                                {a.icon}
                            </div>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: '0.6875rem', fontWeight: 700, color: 'var(--color-text-secondary)', fontFamily: 'var(--font-sans)', whiteSpace: 'nowrap', maxWidth: 68, overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.title}</div>
                                <div style={{ fontSize: '0.5625rem', color: 'var(--color-text-muted)', fontFamily: 'var(--font-sans)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>{style.label}</div>
                            </div>
                        </div>
                    )
                })}

                {[1, 2].map((i) => (
                    <div key={`locked-${i}`} style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, opacity: 0.4 }}>
                        <div style={{ width: 60, height: 60, borderRadius: 16, background: 'var(--color-border)', border: '1.5px dashed rgba(0,0,0,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>🔒</div>
                        <div style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--color-text-muted)', fontFamily: 'var(--font-sans)' }}>Locked</div>
                    </div>
                ))}
            </div>
        </div>
    )
}
