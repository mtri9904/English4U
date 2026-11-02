import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

export type FilterPrimitive = string | number | boolean | null | undefined;

export interface FieldSerializer<T> {
    serialize?: (val: T) => string | undefined;
    deserialize?: (raw: string) => T;
}

export interface UseUrlFiltersOptions<T extends Record<string, any>> {
    /**
     * Default values for all filter fields.
     * When a field has this value, it will be omitted from the URL query string.
     */
    defaultValues: T;

    /**
     * The key representing page number (e.g. 'page' or 'pageNumber').
     * When any other filter changes, this pageKey will automatically be reset to its default value (usually 1).
     */
    pageKey?: keyof T;

    /**
     * Keys that should be debounced before syncing to URL (e.g. ['search', 'searchTerm']).
     * Default: any key that equals 'search', 'searchText', 'searchTerm', or 'q'.
     */
    debouncedKeys?: Array<keyof T>;

    /**
     * Debounce time in milliseconds for debounced keys. Default: 350ms.
     */
    debounceMs?: number;

    /**
     * Optional custom serializers/deserializers for complex values.
     */
    fields?: Partial<{
        [K in keyof T]: FieldSerializer<T[K]>;
    }>;
}

export const useUrlFilters = <T extends Record<string, any>>({
    defaultValues,
    pageKey,
    debouncedKeys,
    debounceMs = 350,
    fields,
}: UseUrlFiltersOptions<T>) => {
    const [searchParams, setSearchParams] = useSearchParams();

    // Check if a key should be debounced
    const isDebouncedKey = useCallback(
        (key: keyof T) => {
            if (debouncedKeys) {
                return debouncedKeys.includes(key);
            }
            const strKey = String(key).toLowerCase();
            return (
                strKey === 'search' ||
                strKey === 'searchtext' ||
                strKey === 'searchterm' ||
                strKey === 'q'
            );
        },
        [debouncedKeys]
    );

    // Parse single parameter
    const parseParam = useCallback(
        (key: keyof T, raw: string | null): any => {
            const defaultVal = defaultValues[key];
            if (raw === null || raw === undefined) {
                return defaultVal;
            }

            const custom = fields?.[key];
            if (custom?.deserialize) {
                return custom.deserialize(raw);
            }

            if (typeof defaultVal === 'number') {
                const num = Number(raw);
                return isNaN(num) ? defaultVal : num;
            }

            if (typeof defaultVal === 'boolean') {
                if (raw === 'true') return true;
                if (raw === 'false') return false;
                return defaultVal;
            }

            return raw;
        },
        [defaultValues, fields]
    );

    // Parse full URL filters
    const urlFilters = useMemo(() => {
        const result = { ...defaultValues };
        for (const key of Object.keys(defaultValues) as Array<keyof T>) {
            result[key] = parseParam(key, searchParams.get(String(key)));
        }
        return result;
    }, [searchParams, defaultValues, parseParam]);

    // Local state for immediate typing responsiveness on debounced inputs
    const [searchInputs, setSearchInputs] = useState<Partial<Record<keyof T, string>>>(() => {
        const initial: Partial<Record<keyof T, string>> = {};
        for (const key of Object.keys(defaultValues) as Array<keyof T>) {
            if (isDebouncedKey(key)) {
                initial[key] = String(urlFilters[key] ?? '');
            }
        }
        return initial;
    });

    // When urlFilters change externally (e.g. browser back/forward or reset), sync searchInputs
    useEffect(() => {
        setSearchInputs((prev) => {
            let changed = false;
            const next = { ...prev };
            for (const key of Object.keys(defaultValues) as Array<keyof T>) {
                if (isDebouncedKey(key)) {
                    const urlVal = String(urlFilters[key] ?? '');
                    if (prev[key] !== urlVal) {
                        next[key] = urlVal;
                        changed = true;
                    }
                }
            }
            return changed ? next : prev;
        });
    }, [urlFilters, defaultValues, isDebouncedKey]);

    const debounceTimerRef = useRef<number | null>(null);
    const pendingUpdatesRef = useRef<Partial<T>>({});

    const commitToUrl = useCallback(
        (updates: Partial<T>) => {
            if (debounceTimerRef.current !== null) {
                window.clearTimeout(debounceTimerRef.current);
                debounceTimerRef.current = null;
            }
            pendingUpdatesRef.current = {};

            setSearchParams(
                (prevParams) => {
                    const nextParams = new URLSearchParams(prevParams);

                    // If a non-page filter changed, reset pageKey to default
                    const hasFilterChange =
                        pageKey &&
                        Object.keys(updates).some(
                            (k) => k !== pageKey && updates[k as keyof T] !== undefined
                        );

                    const effectiveUpdates = { ...updates };
                    if (hasFilterChange && pageKey in defaultValues && !(pageKey in updates)) {
                        effectiveUpdates[pageKey] = defaultValues[pageKey];
                    }

                    for (const [k, val] of Object.entries(effectiveUpdates)) {
                        const key = k as keyof T;
                        const custom = fields?.[key];
                        let serialized: string | undefined;

                        if (custom?.serialize) {
                            serialized = custom.serialize(val as T[keyof T]);
                        } else {
                            const defaultVal = defaultValues[key];
                            const isDefault =
                                val === defaultVal ||
                                val === '' ||
                                val === 'ALL' ||
                                val === null ||
                                val === undefined;
                            serialized = isDefault ? undefined : String(val);
                        }

                        if (serialized === undefined || serialized === '' || serialized === 'ALL') {
                            nextParams.delete(String(key));
                        } else {
                            nextParams.set(String(key), serialized);
                        }
                    }

                    return nextParams;
                },
                { replace: true }
            );
        },
        [defaultValues, fields, pageKey, setSearchParams]
    );

    const setFilter = useCallback(
        <K extends keyof T>(key: K, value: T[K]) => {
            if (isDebouncedKey(key)) {
                setSearchInputs((prev) => ({ ...prev, [key]: String(value ?? '') }));
                pendingUpdatesRef.current[key] = value;

                if (debounceTimerRef.current !== null) {
                    window.clearTimeout(debounceTimerRef.current);
                }

                debounceTimerRef.current = window.setTimeout(() => {
                    const updates = { ...pendingUpdatesRef.current };
                    commitToUrl(updates);
                }, debounceMs);
            } else {
                const updates = { ...pendingUpdatesRef.current, [key]: value };
                commitToUrl(updates);
            }
        },
        [commitToUrl, debounceMs, isDebouncedKey]
    );

    const setFilters = useCallback(
        (updates: Partial<T>) => {
            for (const [k, val] of Object.entries(updates)) {
                const key = k as keyof T;
                if (isDebouncedKey(key)) {
                    setSearchInputs((prev) => ({ ...prev, [key]: String(val ?? '') }));
                }
            }
            commitToUrl(updates);
        },
        [commitToUrl, isDebouncedKey]
    );

    const resetFilters = useCallback(() => {
        if (debounceTimerRef.current !== null) {
            window.clearTimeout(debounceTimerRef.current);
            debounceTimerRef.current = null;
        }
        pendingUpdatesRef.current = {};

        setSearchInputs(() => {
            const reset: Partial<Record<keyof T, string>> = {};
            for (const key of Object.keys(defaultValues) as Array<keyof T>) {
                if (isDebouncedKey(key)) {
                    reset[key] = String(defaultValues[key] ?? '');
                }
            }
            return reset;
        });

        setSearchParams(
            (prevParams) => {
                const nextParams = new URLSearchParams(prevParams);
                for (const key of Object.keys(defaultValues)) {
                    nextParams.delete(key);
                }
                return nextParams;
            },
            { replace: true }
        );
    }, [defaultValues, isDebouncedKey, setSearchParams]);

    const hasActiveFilters = useMemo(() => {
        for (const key of Object.keys(defaultValues) as Array<keyof T>) {
            if (
                key === pageKey ||
                key === 'pageSize' ||
                key === 'page' ||
                key === 'pageNumber'
            ) {
                continue;
            }
            const currentVal = urlFilters[key];
            const defaultVal = defaultValues[key];
            if (
                currentVal !== defaultVal &&
                currentVal !== '' &&
                currentVal !== 'ALL' &&
                currentVal !== undefined &&
                currentVal !== null
            ) {
                return true;
            }
        }
        return false;
    }, [defaultValues, pageKey, urlFilters]);

    const getSearchInputValue = useCallback(
        (key: keyof T): string => {
            return searchInputs[key] ?? String(urlFilters[key] ?? '');
        },
        [searchInputs, urlFilters]
    );

    // Cleanup timer on unmount
    useEffect(() => {
        return () => {
            if (debounceTimerRef.current !== null) {
                window.clearTimeout(debounceTimerRef.current);
            }
        };
    }, []);

    return {
        filters: urlFilters,
        searchInputs,
        getSearchInputValue,
        setFilter,
        setFilters,
        resetFilters,
        hasActiveFilters,
        searchParams,
    };
};
