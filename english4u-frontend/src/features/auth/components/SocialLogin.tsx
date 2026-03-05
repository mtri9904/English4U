import { GoogleLoginButton } from './GoogleLoginButton';

export function SocialLogin() {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '32px' }}>
            <GoogleLoginButton redirectTo="/app" />
        </div>
    )
}
