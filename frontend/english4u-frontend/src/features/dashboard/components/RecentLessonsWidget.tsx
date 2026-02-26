import { ProgressBar } from '@/shared/ui/ProgressBar'
import type { LessonProgress } from './dashboard.types'

const SKILL_CONFIG = {
    listening: { icon: '🎧', color: '#137dc5', label: 'Listening' },
    speaking: { icon: '🎙️', color: '#7c3aed', label: 'Speaking' },
    reading: { icon: '📖', color: '#0891b2', label: 'Reading' },
    writing: { icon: '✏️', color: '#c2410c', label: 'Writing' },
}

export function RecentLessonsWidget({ lessons }: { lessons: LessonProgress[] }) {
    return (
        <div style={{ background: 'rgba(255,255,255,0.85)', border: '1.5px solid var(--color-border)', borderRadius: 20, padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                <div>
                    <p style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontFamily: 'var(--font-sans)', marginBottom: 4 }}>Continue Learning</p>
                    <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>Recent Lessons</h3>
                </div>
                <button style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-primary)', background: 'var(--color-primary-light)', border: 'none', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontFamily: 'var(--font-sans)', transition: 'all 0.2s' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(19,125,197,0.15)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--color-primary-light)')}>
                    View All →
                </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {lessons.map((lesson) => {
                    const config = SKILL_CONFIG[lesson.skill]
                    return (
                        <div key={lesson.id}
                            style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', background: 'rgba(255,255,255,0.6)', border: '1px solid var(--color-border)', borderRadius: 14, cursor: 'pointer', transition: 'all 0.2s' }}
                            onMouseEnter={(e) => { e.currentTarget.style.borderColor = config.color + '40'; e.currentTarget.style.background = `${config.color}06`; e.currentTarget.style.transform = 'translateX(4px)' }}
                            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.background = 'rgba(255,255,255,0.6)'; e.currentTarget.style.transform = 'translateX(0)' }}>
                            <div style={{ width: 42, height: 42, borderRadius: 12, background: `${config.color}12`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>{config.icon}</div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: 6 }}>{lesson.title}</div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <div style={{ flex: 1 }}>
                                        <ProgressBar value={lesson.completedPercent} variant="primary" size="sm" />
                                    </div>
                                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: config.color, minWidth: 32, textAlign: 'right', fontFamily: 'var(--font-sans)' }}>{lesson.completedPercent}%</span>
                                </div>
                            </div>
                            <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', fontFamily: 'var(--font-sans)', marginBottom: 2 }}>{lesson.lastStudied}</div>
                                <div style={{ fontSize: '0.75rem', color: config.color, fontWeight: 600, fontFamily: 'var(--font-sans)' }}>{lesson.doneMinutes}/{lesson.totalMinutes} min</div>
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
