import { type ReactNode, type HTMLAttributes } from 'react'

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
    variant?: 'solid' | 'glass'
    hover?: boolean
    children: ReactNode
}

export function Card({ variant = 'solid', hover, style, className, ...props }: CardProps) {
    const defaultStyles: React.CSSProperties = {
        background: variant === 'glass' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.6)',
        backdropFilter: variant === 'glass' ? 'blur(20px)' : 'blur(10px)',
        border: '1px solid rgba(255, 255, 255, 0.2)',
        borderRadius: 16,
        boxShadow: hover ? 'var(--shadow-md)' : 'var(--shadow-sm)',
        transition: 'transform 0.2s, box-shadow 0.2s',
        cursor: hover ? 'pointer' : 'default',
        ...style
    }
    return <div style={defaultStyles} className={className} {...props} />
}
