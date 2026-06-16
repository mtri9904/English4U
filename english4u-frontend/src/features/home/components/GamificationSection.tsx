import { FadeIn } from './FeaturesSection'

export function GamificationSection() {
    return (
        <section id="gamification" style={{ padding: '100px 24px', position: 'relative', background: '#ffffff' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'linear-gradient(90deg, transparent, var(--color-border-strong), transparent)' }} />
            <div className="container-app">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 48, alignItems: 'center' }}>

                    {/* Left Column: Description */}
                    <FadeIn>
                        <div>
                            <span style={{
                                display: 'inline-block',
                                padding: '6px 16px',
                                background: 'rgba(250, 207, 57, 0.12)',
                                color: '#a16207',
                                borderRadius: 'var(--radius-full)',
                                fontSize: '0.8125rem',
                                fontWeight: 700,
                                textTransform: 'uppercase',
                                letterSpacing: '0.05em',
                                marginBottom: 16
                            }}>
                                🏆 Gamification
                            </span>
                            <h2 style={{
                                fontFamily: 'var(--font-serif)',
                                fontSize: 'clamp(2rem, 3.5vw, 2.75rem)',
                                fontWeight: 700,
                                letterSpacing: '-0.025em',
                                marginBottom: 20,
                                color: 'var(--color-text-primary)',
                                lineHeight: 1.2
                            }}>
                                Động lực học tập <span style={{ color: '#d97706' }}>mỗi ngày</span> với Game hóa
                            </h2>
                            <p style={{ fontSize: '1.0625rem', color: 'var(--color-text-secondary)', lineHeight: 1.7, marginBottom: 28 }}>
                                Học tiếng Anh không còn nhàm chán. Với hệ thống phần thưởng điểm kinh nghiệm (XP), cấp độ (Level), chuỗi Streak ngày học và bảng vinh danh, bạn sẽ có thêm nhiều cảm hứng để tự luyện tập mỗi ngày.
                            </p>

                            {/* Streak card widget */}
                            <div style={{
                                background: 'linear-gradient(135deg, rgba(250,207,57,0.15) 0%, rgba(217,119,6,0.08) 100%)',
                                border: '1.5px solid rgba(217,119,6,0.2)',
                                borderRadius: 16,
                                padding: '20px 24px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 16
                            }}>
                                <div style={{ fontSize: 44, animation: 'flamePulse 1.5s infinite alternate' }}>🔥</div>
                                <div>
                                    <div style={{ fontSize: '1.125rem', fontWeight: 800, color: '#b45309' }}>Daily Streak: 15 ngày</div>
                                    <div style={{ fontSize: '0.8125rem', color: '#78350f', marginTop: 2, fontWeight: 500 }}>
                                        Duy trì streak 7 ngày trở lên để nhân đôi điểm XP nhận được!
                                    </div>
                                </div>
                            </div>
                        </div>
                    </FadeIn>

                    {/* Right Column: Badges & Leaderboard Preview */}
                    <FadeIn delay={150}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

                            {/* Badges Panel */}
                            <div style={{
                                background: '#ffffff',
                                border: '1.5px solid var(--color-border)',
                                borderRadius: 20,
                                padding: '24px 28px',
                                boxShadow: '0 15px 35px rgba(15, 23, 42, 0.04)'
                            }}>
                                <div style={{ fontSize: '0.875rem', fontWeight: 800, color: 'var(--color-text-primary)', marginBottom: 16 }}>
                                    🏅 HUY HIỆU ĐÃ MỞ KHÓA
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                                    {[
                                        { icon: '🎙️', name: 'Speaking Star', color: '#7c3aed', unlocked: true },
                                        { icon: '👑', name: 'Grammar King', color: '#137dc5', unlocked: true },
                                        { icon: '⚡', name: 'Fast Learner', color: '#16a34a', unlocked: true },
                                        { icon: '🔮', name: 'Word Wizard', color: '#94a3b8', unlocked: false }
                                    ].map((badge, idx) => (
                                        <div key={idx} style={{
                                            textAlign: 'center',
                                            opacity: badge.unlocked ? 1 : 0.45,
                                            filter: badge.unlocked ? 'none' : 'grayscale(100%)'
                                        }}>
                                            <div style={{
                                                width: 52,
                                                height: 52,
                                                borderRadius: '50%',
                                                background: badge.unlocked ? `linear-gradient(135deg, ${badge.color}15, ${badge.color}30)` : '#f1f5f9',
                                                border: badge.unlocked ? `2.5px solid ${badge.color}` : '2.5px solid var(--color-border)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                fontSize: 24,
                                                margin: '0 auto 8px',
                                                boxShadow: badge.unlocked ? `0 6px 16px ${badge.color}20` : 'none'
                                            }}>
                                                {badge.icon}
                                            </div>
                                            <div style={{ fontSize: '0.6875rem', fontWeight: 700, color: 'var(--color-text-secondary)', lineHeight: 1.2 }}>
                                                {badge.name}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Leaderboard Panel */}
                            <div style={{
                                background: '#ffffff',
                                border: '1.5px solid var(--color-border)',
                                borderRadius: 20,
                                padding: '24px 28px',
                                boxShadow: '0 15px 35px rgba(15, 23, 42, 0.04)'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                                    <div style={{ fontSize: '0.875rem', fontWeight: 800, color: 'var(--color-text-primary)' }}>
                                        📊 BẢNG XẾP HẠNG TUẦN NÀY
                                    </div>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>CẬP NHẬT: 2 PHÚT TRƯỚC</span>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                    {[
                                        { rank: '🥇', name: 'Minh Thư', xp: '12,450 XP', self: false },
                                        { rank: '🥈', name: 'Anh Tuấn', xp: '10,200 XP', self: false },
                                        { rank: '🥉', name: 'Hải Nam', xp: '9,850 XP', self: false },
                                        { rank: '14', name: 'Bạn (You)', xp: '4,500 XP', self: true }
                                    ].map((user, idx) => (
                                        <div key={idx} style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            padding: '10px 14px',
                                            borderRadius: 12,
                                            background: user.self ? 'var(--color-primary-light)' : 'rgba(248, 250, 252, 0.8)',
                                            border: user.self ? '1px solid rgba(19, 125, 197, 0.2)' : '1px solid transparent'
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                                <span style={{
                                                    width: 24,
                                                    fontSize: user.rank.includes('🥇') || user.rank.includes('🥈') || user.rank.includes('🥉') ? '1.1rem' : '0.8125rem',
                                                    fontWeight: 800,
                                                    color: 'var(--color-text-secondary)',
                                                    textAlign: 'center'
                                                }}>{user.rank}</span>
                                                <span style={{
                                                    fontSize: '0.875rem',
                                                    fontWeight: user.self ? 700 : 600,
                                                    color: user.self ? 'var(--color-primary)' : 'var(--color-text-primary)'
                                                }}>{user.name}</span>
                                            </div>
                                            <span style={{ fontSize: '0.8125rem', fontWeight: 800, color: 'var(--color-text-secondary)' }}>
                                                {user.xp}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                        </div>
                    </FadeIn>
                </div>
            </div>

            <style>{`
                @keyframes flamePulse {
                    from { transform: scale(1); filter: drop-shadow(0 0 2px rgba(217,119,6,0.3)); }
                    to { transform: scale(1.08); filter: drop-shadow(0 0 10px rgba(217,119,6,0.6)); }
                }
            `}</style>
        </section>
    )
}
