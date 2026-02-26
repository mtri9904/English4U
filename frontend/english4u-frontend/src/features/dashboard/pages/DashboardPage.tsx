import { DashboardSidebar } from '@/features/dashboard/components/DashboardSidebar'
import { DashboardTopBar } from '@/features/dashboard/components/DashboardTopBar'
import { StreakWidget } from '@/features/dashboard/components/StreakWidget'
import { RadarChartWidget } from '@/features/dashboard/components/RadarChartWidget'
import { RecentLessonsWidget } from '@/features/dashboard/components/RecentLessonsWidget'
import { AchievementsWidget } from '@/features/dashboard/components/AchievementsWidget'
import { mockUser, mockStreak, mockSkillScores, mockLessons, mockAchievements } from '@/features/dashboard/components/dashboard.mock'

export function DashboardPage() {
    return (
        <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--color-bg)' }}>
            <DashboardSidebar xp={mockUser.xp} xpToNext={mockUser.xpToNext} level={mockUser.level} />

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <DashboardTopBar user={mockUser} />

                <main style={{ flex: 1, padding: '28px', overflowY: 'auto' }}>
                    <div style={{ maxWidth: 1200, margin: '0 auto' }}>

                        <div style={{ marginBottom: 28 }}>
                            <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.625rem', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 4 }}>
                                Command Center
                            </h2>
                            <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', fontFamily: 'var(--font-sans)' }}>
                                Track your progress, streaks and achievements at a glance.
                            </p>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 20 }}>
                            {[
                                { icon: '🔥', label: 'Day Streak', value: `${mockStreak.currentStreak}`, trend: '+2', positive: true, color: '#fa9600' },
                                { icon: '⭐', label: 'Total XP', value: mockUser.xp.toLocaleString(), trend: '+180', positive: true, color: 'var(--color-primary)' },
                                { icon: '📝', label: 'Lessons Done', value: '127', trend: '+3', positive: true, color: '#16a34a' },
                                { icon: '🎯', label: 'Avg. Score', value: '74%', trend: '-1%', positive: false, color: '#c2410c' },
                            ].map((stat) => (
                                <div key={stat.label} className="stat-card">
                                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
                                        <div style={{ width: 44, height: 44, borderRadius: 12, background: `${stat.color}14`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>{stat.icon}</div>
                                        <span style={{ display: 'inline-flex', alignItems: 'center', fontSize: '0.75rem', fontWeight: 700, color: stat.positive ? '#16a34a' : '#dc2626', background: stat.positive ? 'rgba(22,163,74,0.1)' : 'rgba(239,68,68,0.1)', padding: '2px 8px', borderRadius: 99, fontFamily: 'var(--font-sans)' }}>
                                            {stat.positive ? '↑' : '↓'} {stat.trend.replace('-', '').replace('+', '')}
                                        </span>
                                    </div>
                                    <div style={{ fontSize: '1.875rem', fontWeight: 800, color: 'var(--color-text-primary)', lineHeight: 1, fontFamily: 'var(--font-sans)' }}>{stat.value}</div>
                                    <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', marginTop: 4, fontFamily: 'var(--font-sans)' }}>{stat.label}</div>
                                </div>
                            ))}
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 20, marginBottom: 20 }}>
                            <StreakWidget streak={mockStreak} />
                            <RadarChartWidget scores={mockSkillScores} />
                        </div>

                        <div style={{ marginBottom: 20 }}>
                            <RecentLessonsWidget lessons={mockLessons} />
                        </div>

                        <AchievementsWidget achievements={mockAchievements} />
                    </div>
                </main>
            </div>
        </div>
    )
}
