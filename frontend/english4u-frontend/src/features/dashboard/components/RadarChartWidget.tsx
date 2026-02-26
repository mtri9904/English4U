import { RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer, Tooltip } from 'recharts'
import type { SkillScore } from './dashboard.types'

const SKILL_COLORS: Record<string, string> = {
    Listening: '#137dc5',
    Speaking: '#7c3aed',
    Reading: '#0891b2',
    Writing: '#c2410c',
}

export function RadarChartWidget({ scores }: { scores: SkillScore[] }) {
    const data = scores.map((s) => ({ skill: s.skill, score: s.score, fullMark: 100 }))

    return (
        <div style={{ background: 'rgba(255,255,255,0.85)', border: '1.5px solid var(--color-border)', borderRadius: 20, padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
                <p style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontFamily: 'var(--font-sans)', marginBottom: 4 }}>Skill Analysis</p>
                <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>Learning Progress</h3>
            </div>

            <div style={{ height: 220 }}>
                <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={data} cx="50%" cy="50%" outerRadius="75%">
                        <PolarGrid stroke="var(--color-border)" strokeWidth={1} />
                        <PolarAngleAxis
                            dataKey="skill"
                            tick={{ fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 600, fill: 'var(--color-text-secondary)' }}
                        />
                        <Radar
                            name="Score"
                            dataKey="score"
                            stroke="#137dc5"
                            fill="#137dc5"
                            fillOpacity={0.18}
                            strokeWidth={2}
                            dot={{ fill: '#137dc5', strokeWidth: 0, r: 4 }}
                        />
                        <Tooltip
                            contentStyle={{ fontFamily: 'var(--font-sans)', fontSize: 12, borderRadius: 10, border: '1px solid var(--color-border)', background: 'white' }}
                            formatter={(value) => [`${value ?? 0}/100`, 'Score']}
                        />
                    </RadarChart>
                </ResponsiveContainer>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {scores.map((s) => (
                    <div key={s.skill} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: `${SKILL_COLORS[s.skill]}08`, border: `1px solid ${SKILL_COLORS[s.skill]}20`, borderRadius: 10 }}>
                        <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-secondary)', fontFamily: 'var(--font-sans)' }}>{s.skill}</span>
                        <span style={{ fontSize: '0.9375rem', fontWeight: 800, color: SKILL_COLORS[s.skill], fontFamily: 'var(--font-sans)' }}>{s.score}</span>
                    </div>
                ))}
            </div>
        </div>
    )
}
