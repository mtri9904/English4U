import React from 'react';
import { Navigate, useLocation, Outlet } from 'react-router-dom';
import { Result, Button } from 'antd';
import { useUserProfileQuery } from '@/features/students/hooks/useStudentQueries';
import { isTokenExpired } from '@/apis/axios.instance';
import { ROUTE_PATHS } from '@/constants/route-paths';

export interface RequirePolicyProps {
    requiredRole?: 'Admin' | 'Student' | 'Teacher' | string;
    children?: React.ReactNode;
}

/**
 * RequirePolicy - Route authorization guard component
 * Follows the enterprise pattern from Mebifarm CMS (web)
 */
export const RequirePolicy: React.FC<RequirePolicyProps> = ({
    requiredRole,
    children,
}) => {
    const location = useLocation();
    const token = localStorage.getItem('token');
    const { data: profile, isLoading } = useUserProfileQuery();

    // 1. Authentication check
    if (!token || isTokenExpired()) {
        const loginPath = requiredRole === 'Admin' ? ROUTE_PATHS.ADMIN_LOGIN : ROUTE_PATHS.LOGIN;
        return <Navigate to={loginPath} state={{ from: location }} replace />;
    }

    if (isLoading) {
        return null; // Or layout spinner
    }

    // 2. Role authorization check
    if (requiredRole && profile?.role && profile.role.toLowerCase() !== requiredRole.toLowerCase()) {
        return (
            <div
                style={{
                    minHeight: '60vh',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '24px',
                }}
            >
                <Result
                    status="403"
                    title="403 - Quyền truy cập bị từ chối"
                    subTitle="Bạn không có quyền hạn cần thiết để truy cập khu vực chức năng này."
                    extra={
                        <Button type="primary" onClick={() => (window.location.href = '/')}>
                            Về trang chủ
                        </Button>
                    }
                />
            </div>
        );
    }

    return children ? <>{children}</> : <Outlet />;
};

export default RequirePolicy;

