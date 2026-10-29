import { useQuery } from '@tanstack/react-query';
import { dashboardService } from '../services/dashboard.service';

export const dashboardQueryKeys = {
    all: ['client', 'dashboard'] as const,
    summary: () => [...dashboardQueryKeys.all, 'summary'] as const,
    progress: () => ['client', 'progress'] as const,
};

export const useClientDashboardQuery = () =>
    useQuery({
        queryKey: dashboardQueryKeys.summary(),
        queryFn: dashboardService.getDashboard,
    });

export const useClientProgressQuery = () =>
    useQuery({
        queryKey: dashboardQueryKeys.progress(),
        queryFn: dashboardService.getProgress,
    });

