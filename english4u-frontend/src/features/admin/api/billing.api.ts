import { axiosInstance } from '@/apis/axios.instance';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
    BillingOverviewDto,
    PagedResult,
    PaymentListItemDto,
    PaymentPagedRequest,
    SubscriptionListItemDto,
    SubscriptionUpsertRequest,
    ToggleSubscriptionStatusRequest,
} from '../types/billing.types';

export * from '../types/billing.types';

interface LiveQueryOptions {
    refetchInterval?: number | false;
    refetchOnWindowFocus?: boolean;
    refetchIntervalInBackground?: boolean;
    enabled?: boolean;
}

export const billingKeys = {
    overview: ['admin', 'billing', 'overview'] as const,
    subscriptions: ['admin', 'billing', 'subscriptions'] as const,
    payments: (params: PaymentPagedRequest) => ['admin', 'billing', 'payments', params] as const,
};

export const billingApi = {
    getOverview: async (): Promise<BillingOverviewDto> => {
        const res = await axiosInstance.get<BillingOverviewDto>('admin/billing/overview');
        return res.data;
    },
    getSubscriptions: async (): Promise<SubscriptionListItemDto[]> => {
        const res = await axiosInstance.get<SubscriptionListItemDto[]>('admin/billing/subscriptions');
        return res.data;
    },
    createSubscription: async (payload: SubscriptionUpsertRequest): Promise<void> => {
        await axiosInstance.post('admin/billing/subscriptions', payload);
    },
    updateSubscription: async (id: string, payload: SubscriptionUpsertRequest): Promise<void> => {
        await axiosInstance.put(`admin/billing/subscriptions/${id}`, payload);
    },
    toggleSubscriptionStatus: async (id: string, payload: ToggleSubscriptionStatusRequest): Promise<void> => {
        await axiosInstance.patch(`admin/billing/subscriptions/${id}/status`, payload);
    },
    getPayments: async (params: PaymentPagedRequest): Promise<PagedResult<PaymentListItemDto>> => {
        const res = await axiosInstance.get<PagedResult<PaymentListItemDto>>('admin/billing/payments', { params });
        return res.data;
    },
};

export const useBillingOverviewQuery = (options?: LiveQueryOptions) =>
    useQuery({
        queryKey: billingKeys.overview,
        queryFn: billingApi.getOverview,
        enabled: options?.enabled ?? true,
        refetchInterval: options?.refetchInterval ?? false,
        refetchOnWindowFocus: options?.refetchOnWindowFocus ?? true,
        refetchIntervalInBackground: options?.refetchIntervalInBackground ?? false,
    });

export const useBillingSubscriptionsQuery = (options?: LiveQueryOptions) =>
    useQuery({
        queryKey: billingKeys.subscriptions,
        queryFn: billingApi.getSubscriptions,
        enabled: options?.enabled ?? true,
        refetchInterval: options?.refetchInterval ?? false,
        refetchOnWindowFocus: options?.refetchOnWindowFocus ?? true,
        refetchIntervalInBackground: options?.refetchIntervalInBackground ?? false,
    });

export const useBillingPaymentsQuery = (params: PaymentPagedRequest, options?: LiveQueryOptions) =>
    useQuery({
        queryKey: billingKeys.payments(params),
        queryFn: () => billingApi.getPayments(params),
        enabled: options?.enabled ?? true,
        refetchInterval: options?.refetchInterval ?? false,
        refetchOnWindowFocus: options?.refetchOnWindowFocus ?? true,
        refetchIntervalInBackground: options?.refetchIntervalInBackground ?? false,
    });

export const useCreateSubscriptionMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: billingApi.createSubscription,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin', 'billing'] });
        },
    });
};

export const useUpdateSubscriptionMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, payload }: { id: string; payload: SubscriptionUpsertRequest }) =>
            billingApi.updateSubscription(id, payload),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin', 'billing'] });
        },
    });
};

export const useToggleSubscriptionStatusMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, payload }: { id: string; payload: ToggleSubscriptionStatusRequest }) =>
            billingApi.toggleSubscriptionStatus(id, payload),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin', 'billing'] });
        },
    });
};
