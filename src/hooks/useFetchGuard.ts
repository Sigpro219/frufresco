import { useRef } from 'react';

/**
 * Prevents concurrent execution of async functions.
 * Returns a wrapped version of the function that will skip execution
 * if a previous call is still in progress.
 * 
 * @param fn - The async function to guard
 * @returns A guarded version of the function
 * 
 * @example
 * const fetchData = useFetchGuard(async () => {
 *   const data = await api.getData();
 *   setData(data);
 * });
 * 
 * // First call starts execution
 * fetchData(); 
 * 
 * // Second call is skipped (first still running)
 * fetchData(); 
 */
export function useFetchGuard<T extends (...args: any[]) => Promise<any>>(
    fn: T
): (...args: Parameters<T>) => Promise<ReturnType<T> | void> {
    const fetchingRef = useRef(false);

    return async (...args: Parameters<T>) => {
        if (fetchingRef.current) {
            console.log('⏭️ Fetch already in progress, skipping duplicate call');
            return;
        }

        fetchingRef.current = true;
        try {
            return await fn(...args);
        } finally {
            fetchingRef.current = false;
        }
    };
}
