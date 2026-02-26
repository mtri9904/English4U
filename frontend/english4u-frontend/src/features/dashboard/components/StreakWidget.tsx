import type { DailyStreak } from './dashboard.types'

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export function StreakWidget({ streak }: { streak: DailyStreak }) {
    return (
        <div style={{ background: 'rgba(255,255,255,0.85)', border: '1.5px solid var(--color-border)', borderRadius: 20, padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div>
                    <p style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontFamily: 'var(--font-sans)', marginBottom: 4 }}>Daily Streak</p>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                        <span
                            style={{ fontSize: '3.5rem', fontWeight: 800, color: 'var(--color-text-primary)', lineHeight: 1, fontFamily: 'var(--font-sans)' }}
                        >{streak.currentStreak}</span>
                        <span style={{ fontSize: '1rem', color: 'var(--color-text-secondary)', fontWeight: 500 }}>days</span>
                    </div>
                    <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', marginTop: 2, fontFamily: 'var(--font-sans)' }}>
                        Best: {streak.longestStreak} days
                    </p>
                </div>
                <div style={{ position: 'relative', width: 60, height: 60 }}>
                    <div style={{ fontSize: 40, animation: 'pulseSlow 2s ease-in-out infinite', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }}>🔥</div>
                    <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'rgba(250,150,0,0.15)', animation: 'pulseSlow 2s ease-in-out infinite', filter: 'blur(8px)' }} />
                </div>
            </div>

            <div>
                <p style={{ fontSize: '0.6875rem', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: 10, fontFamily: 'var(--font-sans)' }}>This week</p>
                <div style={{ display: 'flex', gap: 8 }}>
                    {streak.weekActivity.map((active, i) => (
                        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                            <div style={{
                                width: '100%', aspectRatio: '1', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                background: active ? 'linear-gradient(135deg, #fa9600 0%, #facf39 100%)' : 'var(--color-border)',
                                boxShadow: active ? '0 2px 8px rgba(250,150,0,0.3)' : 'none',
                                transition: 'all 0.2s',
                                fontSize: active ? 12 : 0,
                            }}>
                                {active && '🔥'}
                            </div>
                            <span style={{ fontSize: '0.625rem', color: 'var(--color-text-muted)', fontFamily: 'var(--font-sans)', fontWeight: 500 }}>{DAY_LABELS[i]}</span>
                        </div>
                    ))}
                </div>
            </div>

            {streak.todayDone && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 10 }}>
                    <span style={{ fontSize: 16 }}>✅</span>
                    <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#16a34a', fontFamily: 'var(--font-sans)' }}>Today's goal completed!</span>
                </div>
            )}
        </div>
    )
}
