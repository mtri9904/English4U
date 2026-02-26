import { Card } from '../Card/Card'

export interface StatCardProps {
    icon: string
    label: string
    value: string
    trend?: { value: number; positive: boolean }
    accent?: boolean
}

export function StatCard({ icon, label, value, trend, accent }: StatCardProps) {
    return (
        <Card variant="solid" style={{ padding: 20, borderTop: accent ? '4px solid var(--color-primary)' : undefined }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem', marginBottom: 4 }}>
                        {label}
                    </div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 800 }}>{value}</div>
                </div>
                <div style={{ fontSize: '1.5rem' }}>{icon}</div>
            </div>
            {trend && (
                <div style={{ marginTop: 12, fontSize: '0.8125rem', color: trend.positive ? 'var(--color-success)' : 'var(--color-error)' }}>
                    {trend.positive ? '↑' : '↓'} {trend.value}% from last week
                </div>
            )}
        </Card>
    )
}
