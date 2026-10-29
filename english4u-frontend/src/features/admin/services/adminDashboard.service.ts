import { callApi } from '@/apis/handleApi';
import { ApiRouters } from '@/constants/api-routes';
import type { AdminDashboardDto } from '../types/adminDashboard.types';

export const adminDashboardService = {
    getDashboard: async (): Promise<AdminDashboardDto> => {
        return callApi<AdminDashboardDto>(ApiRouters.ADMIN.DASHBOARD, undefined, 'get');
    },
};

