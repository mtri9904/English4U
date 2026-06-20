interface ProgressBarProps {
    value: number
    max?: number
    variant?: 'primary' | 'accent' | 'success'
    size?: 'sm' | 'md' | 'lg'
    showLabel?: boolean
}

const heightMap = { sm: 4, md: 8, lg: 12 }
const gradients = {
    primary: 'linear-gradient(90deg, #137dc5, #3aa5e8)',
    accent: 'linear-gradient(90deg, #facf39, #fbb220)',
    success: 'linear-gradient(90deg, #22c55e, #4ade80)',
}

export function ProgressBar({ value, max = 100, variant = 'primary', size = 'md', showLabel = false }: ProgressBarProps) {
    const percent = Math.min(Math.max((value / max) * 100, 0), 100)
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ flex: 1, height: heightMap[size], background: 'var(--color-border)', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
                <div style={{ width: `${percent}%`, height: '100%', background: gradients[variant], borderRadius: 'var(--radius-full)', transition: 'width 0.6s cubic-bezier(0.4,0,0.2,1)' }} />
            </div>
            {showLabel && <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-secondary)', minWidth: 36, textAlign: 'right' }}>{Math.round(percent)}%</span>}
        </div>
    )
}
