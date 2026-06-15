export function AuthDivider({ text }: { text: string }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', textAlign: 'center', marginBottom: '32px' }}>
            <div style={{ flex: 1, borderTop: '1px solid var(--color-border)' }}></div>
            <span style={{ padding: '0 16px', fontSize: '0.8125rem', color: 'var(--color-text-muted)', background: '#fff' }}>{text}</span>
            <div style={{ flex: 1, borderTop: '1px solid var(--color-border)' }}></div>
        </div>
    )
}
