import { useQuery } from '@tanstack/react-query';
import { adminDashboardService } from '../services/adminDashboard.service';

export const adminDashboardKeys = {
    all: ['admin-dashboard'] as const,
    summary: () => [...adminDashboardKeys.all, 'summary'] as const,
};

export const useAdminDashboardQuery = () => {
    return useQuery({
        queryKey: adminDashboardKeys.summary(),
        queryFn: adminDashboardService.getDashboard,
        staleTime: 30 * 1000,
        refetchOnWindowFocus: true,
    });
};

