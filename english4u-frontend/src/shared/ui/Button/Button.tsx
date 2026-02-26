import { type ReactNode, type ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'accent' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: Variant
    size?: Size
    loading?: boolean
    icon?: ReactNode
    children: ReactNode
}

const variantClass: Record<Variant, string> = {
    primary: 'btn-primary',
    accent: 'btn-accent',
    ghost: 'btn-ghost',
    danger: 'btn-danger',
}

const sizeStyles: Record<Size, React.CSSProperties> = {
    sm: { padding: '6px 16px', fontSize: '0.8125rem' },
    md: { padding: '10px 24px', fontSize: '0.9375rem' },
    lg: { padding: '14px 32px', fontSize: '1.0625rem' },
}

export function Button({
    variant = 'primary',
    size = 'md',
    loading = false,
    icon,
    children,
    disabled,
    style,
    ...props
}: ButtonProps) {
    return (
        <button
            className={variantClass[variant]}
            disabled={disabled || loading}
            style={{ ...sizeStyles[size], ...style, opacity: disabled || loading ? 0.6 : 1 }}
            {...props}
        >
            {loading ? <SpinIcon /> : icon}
            {children}
        </button>
    )
}

function SpinIcon() {
    return (
        <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            style={{ animation: 'spin 0.8s linear infinite' }}
        >
            <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" strokeDasharray="20 18" />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </svg>
    )
}
