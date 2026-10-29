import { callApi } from '@/apis/handleApi';
import { ApiRouters } from '@/constants/api-routes';
import type { ClientDashboardDto, ClientProgressDto } from '../types/dashboard.types';

export const dashboardService = {
    getDashboard: async (): Promise<ClientDashboardDto> => {
        return callApi<ClientDashboardDto>(
            ApiRouters.PRACTICE.DASHBOARD,
            undefined,
            'get'
        );
    },

    getProgress: async (): Promise<ClientProgressDto> => {
        return callApi<ClientProgressDto>(
            ApiRouters.PRACTICE.PROGRESS,
            undefined,
            'get'
        );
    },
};

