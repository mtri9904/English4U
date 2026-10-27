import type { AxiosInstance, AxiosRequestConfig } from 'axios';
import { axiosInstance } from './axios.instance';

/**
 * callApi - Universal API caller wrapper
 * Follows the enterprise pattern from Mebifarm CMS (web)
 */
export const callApi = async <T = unknown>(
    url: string,
    payload?: unknown,
    method: 'get' | 'post' | 'put' | 'patch' | 'delete' = 'get',
    client: AxiosInstance = axiosInstance,
    configExtra?: AxiosRequestConfig
): Promise<T> => {
    const config: AxiosRequestConfig = {
        method,
        url,
        ...(method === 'get' || method === 'delete' ? { params: payload } : { data: payload }),
        ...configExtra,
    };

    const response = await client(config);
    return response.data;
};

export default callApi;
