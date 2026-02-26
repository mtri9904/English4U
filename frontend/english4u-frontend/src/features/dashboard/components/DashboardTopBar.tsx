import { Badge } from '@/shared/ui/Badge'
import { ProgressBar } from '@/shared/ui/ProgressBar'
import type { DashboardUser } from './dashboard.types'

export function DashboardTopBar({ user }: { user: DashboardUser }) {
    return (
        <header style={{ height: 64, background: 'rgba(255,255,255,0.88)', backdropFilter: 'blur(20px)', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', padding: '0 28px', gap: 16, position: 'sticky', top: 0, zIndex: 50 }}>
            <div style={{ flex: 1 }}>
                <h1 style={{ fontFamily: 'var(--font-sans)', fontSize: '1rem', fontWeight: 700, color: 'var(--color-text-primary)', lineHeight: 1 }}>Good morning, {user.name.split(' ')[0]} 👋</h1>
                <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: 3, fontFamily: 'var(--font-sans)' }}>Wednesday, 26 Feb 2026</p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(250,207,57,0.12)', border: '1px solid rgba(250,207,57,0.25)', borderRadius: 99, padding: '5px 14px 5px 10px', cursor: 'pointer' }}>
                <span style={{ fontSize: 14 }}>⚡</span>
                <div>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-accent-dark)', lineHeight: 1, fontFamily: 'var(--font-sans)' }}>{user.xp.toLocaleString()} XP</div>
                    <div style={{ width: 80, marginTop: 3 }}><ProgressBar value={user.xp} max={user.xpToNext} variant="accent" size="sm" /></div>
                </div>
            </div>

            <button style={{ position: 'relative', width: 38, height: 38, borderRadius: 10, border: '1.5px solid var(--color-border)', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-secondary)', transition: 'all 0.2s' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-primary-light)'; e.currentTarget.style.color = 'var(--color-primary)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--color-text-secondary)' }}>
                <svg width="17" height="17" viewBox="0 0 17 17" fill="none"><path d="M8.5 1.5a5 5 0 00-5 5v3l-1.5 2h13l-1.5-2v-3a5 5 0 00-5-5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /><path d="M7 13.5a1.5 1.5 0 003 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                {user.notifications > 0 && (
                    <span style={{ position: 'absolute', top: -4, right: -4, width: 18, height: 18, borderRadius: '50%', background: 'var(--color-primary)', color: '#fff', fontSize: '0.6rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #fff', fontFamily: 'var(--font-sans)' }}>{user.notifications}</span>
                )}
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 14px 6px 6px', borderRadius: 99, border: '1.5px solid var(--color-border)', background: 'rgba(255,255,255,0.8)', cursor: 'pointer', transition: 'border-color 0.2s' }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--color-primary)')}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--color-border)')}>
                <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'linear-gradient(135deg, #137dc5 0%, #7c3aed 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: '0.75rem', flexShrink: 0, fontFamily: 'var(--font-sans)' }}>{user.avatar}</div>
                <div>
                    <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-primary)', lineHeight: 1, fontFamily: 'var(--font-sans)' }}>{user.name}</div>
                    <div style={{ marginTop: 2 }}><Badge variant="primary">{user.level}</Badge></div>
                </div>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ color: 'var(--color-text-muted)' }}><path d="M3 4.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </div>
        </header>
    )
}
