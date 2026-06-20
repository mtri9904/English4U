type BadgeVariant = 'primary' | 'accent' | 'success' | 'warning' | 'error' | 'neutral'

interface BadgeProps {
    variant?: BadgeVariant
    children: React.ReactNode
    dot?: boolean
}

const variantStyles: Record<BadgeVariant, React.CSSProperties> = {
    primary: { background: 'var(--color-primary-light)', color: 'var(--color-primary)', border: '1px solid rgba(19,125,197,0.2)' },
    accent: { background: 'rgba(250,207,57,0.18)', color: 'var(--color-accent-dark)', border: '1px solid rgba(250,207,57,0.3)' },
    success: { background: 'rgba(34,197,94,0.12)', color: '#16a34a', border: '1px solid rgba(34,197,94,0.25)' },
    warning: { background: 'rgba(245,158,11,0.12)', color: '#d97706', border: '1px solid rgba(245,158,11,0.25)' },
    error: { background: 'rgba(239,68,68,0.1)', color: '#dc2626', border: '1px solid rgba(239,68,68,0.2)' },
    neutral: { background: 'rgba(90,106,126,0.1)', color: 'var(--color-text-secondary)', border: '1px solid rgba(90,106,126,0.2)' },
}

export function Badge({ variant = 'primary', children, dot = false }: BadgeProps) {
    return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', fontSize: '0.75rem', fontWeight: 600, borderRadius: 'var(--radius-full)', ...variantStyles[variant] }}>
            {dot && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor', flexShrink: 0 }} />}
            {children}
        </span>
    )
}
