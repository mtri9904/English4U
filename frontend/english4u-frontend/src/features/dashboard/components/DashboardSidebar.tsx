import { useState } from 'react'
import { ProgressBar } from '@/shared/ui/ProgressBar'

type NavItem = { id: string; icon: React.ReactNode; label: string; badge?: number }

const NAV_ITEMS: NavItem[] = [
    { id: 'dashboard', icon: <GridIcon />, label: 'Dashboard' },
    { id: 'courses', icon: <BookIcon />, label: 'My Courses' },
    { id: 'exams', icon: <ClipboardIcon />, label: 'Practice Exams', badge: 2 },
    { id: 'flashcards', icon: <CardsIcon />, label: 'Flashcards' },
    { id: 'leaderboard', icon: <TrophyIcon />, label: 'Leaderboard' },
    { id: 'settings', icon: <GearIcon />, label: 'Settings' },
]

interface DashboardSidebarProps {
    xp: number; xpToNext: number; level: string
}

export function DashboardSidebar({ xp, xpToNext, level }: DashboardSidebarProps) {
    const [active, setActive] = useState('dashboard')
    const [collapsed, setCollapsed] = useState(false)

    return (
        <aside style={{ width: collapsed ? 72 : 240, minHeight: '100vh', background: 'var(--color-bg-dark)', display: 'flex', flexDirection: 'column', borderRight: '1px solid rgba(255,255,255,0.06)', transition: 'width 0.3s cubic-bezier(0.4,0,0.2,1)', flexShrink: 0, position: 'relative', zIndex: 10 }}>
            <div style={{ padding: collapsed ? '20px 16px' : '20px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 10, justifyContent: collapsed ? 'center' : 'flex-start' }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg, #137dc5 0%, #0c5a92 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 18, fontFamily: 'var(--font-serif)', flexShrink: 0, boxShadow: '0 4px 12px rgba(19,125,197,0.4)' }}>E</div>
                {!collapsed && <span style={{ fontFamily: 'var(--font-serif)', fontSize: '1.125rem', fontWeight: 700, color: '#fff', letterSpacing: '-0.01em' }}>English4U</span>}
            </div>

            <nav style={{ flex: 1, padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: 2 }}>
                {NAV_ITEMS.map((item) => {
                    const isActive = active === item.id
                    return (
                        <button key={item.id} onClick={() => setActive(item.id)} title={collapsed ? item.label : undefined}
                            style={{ display: 'flex', alignItems: 'center', gap: 12, padding: collapsed ? '10px' : '10px 12px', borderRadius: 10, border: 'none', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: '0.875rem', fontWeight: isActive ? 600 : 400, color: isActive ? '#fff' : 'rgba(255,255,255,0.45)', background: isActive ? 'linear-gradient(135deg, rgba(19,125,197,0.8) 0%, rgba(19,125,197,0.4) 100%)' : 'transparent', transition: 'all 0.2s', justifyContent: collapsed ? 'center' : 'flex-start', boxShadow: isActive ? '0 4px 16px rgba(19,125,197,0.25)' : 'none' }}
                            onMouseEnter={(e) => { if (!isActive) { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = 'rgba(255,255,255,0.8)' } }}
                            onMouseLeave={(e) => { if (!isActive) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255,255,255,0.45)' } }}>
                            <span style={{ width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, opacity: isActive ? 1 : 0.7 }}>{item.icon}</span>
                            {!collapsed && (
                                <>
                                    <span style={{ flex: 1 }}>{item.label}</span>
                                    {item.badge && <span style={{ background: 'var(--color-primary)', color: '#fff', fontSize: '0.625rem', fontWeight: 700, padding: '1px 6px', borderRadius: 99, minWidth: 18, textAlign: 'center' }}>{item.badge}</span>}
                                </>
                            )}
                        </button>
                    )
                })}
            </nav>

            {!collapsed && (
                <div style={{ margin: '0 12px 12px', padding: '14px 16px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', fontWeight: 500, fontFamily: 'var(--font-sans)' }}>Level {level}</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--color-accent)', fontWeight: 700, fontFamily: 'var(--font-sans)' }}>{xp.toLocaleString()} XP</span>
                    </div>
                    <ProgressBar value={xp} max={xpToNext} variant="accent" size="sm" />
                    <div style={{ marginTop: 6, fontSize: '0.6875rem', color: 'rgba(255,255,255,0.3)', fontFamily: 'var(--font-sans)' }}>{(xpToNext - xp).toLocaleString()} XP to next level</div>
                </div>
            )}

            <button onClick={() => setCollapsed(!collapsed)} title={collapsed ? 'Expand' : 'Collapse'}
                style={{ margin: '0 8px 12px', padding: '8px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s', fontFamily: 'var(--font-sans)' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = 'rgba(255,255,255,0.7)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.color = 'rgba(255,255,255,0.4)' }}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d={collapsed ? 'M6 3l5 5-5 5' : 'M10 3L5 8l5 5'} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
        </aside>
    )
}

function GridIcon() { return <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><rect x="1" y="1" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" /><rect x="11" y="1" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" /><rect x="1" y="11" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" /><rect x="11" y="11" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" /></svg> }
function BookIcon() { return <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M2 3h6a2 2 0 012 2v10a2 2 0 00-2-2H2V3z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /><path d="M16 3h-6a2 2 0 00-2 2v10a2 2 0 012-2h6V3z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /></svg> }
function ClipboardIcon() { return <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><rect x="3" y="3" width="12" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" /><path d="M6 1h6a1 1 0 010 2H6a1 1 0 010-2z" stroke="currentColor" strokeWidth="1.5" /><path d="M6 8h6M6 11h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg> }
function CardsIcon() { return <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><rect x="1" y="4" width="12" height="10" rx="2" stroke="currentColor" strokeWidth="1.5" /><path d="M5 4V3a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2h-1" stroke="currentColor" strokeWidth="1.5" /></svg> }
function TrophyIcon() { return <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M9 12V15M6 17h6M4 2h10v6a5 5 0 01-10 0V2z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /><path d="M4 4H2a2 2 0 000 4h2M14 4h2a2 2 0 010 4h-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg> }
function GearIcon() { return <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="2.5" stroke="currentColor" strokeWidth="1.5" /><path d="M9 1v2M9 15v2M1 9h2M15 9h2M3.22 3.22l1.41 1.41M13.37 13.37l1.41 1.41M3.22 14.78l1.41-1.41M13.37 4.63l1.41-1.41" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg> }
