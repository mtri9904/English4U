export interface User {
    id: string;
    email: string;
    displayName: string;
    role: string;
}

export interface LoginRequest {
    email: string;
    password: string;
}

export interface RegisterRequest {
    email: string;
    password: string;
    displayName?: string;
}

export interface AuthResponse {
    token: string;
    refreshToken: string;
    userId: string;
    email: string;
    displayName: string;
    role: string;
}

export interface RefreshRequest {
    refreshToken: string;
}
