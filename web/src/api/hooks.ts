import { useCallback, useEffect, useState } from 'react';
import { getApiStats, postApiConvert } from './generated/client';
import type { GetApiStats200, PostApiConvert200, PostApiConvertBody } from './generated/model';
import { NETWORK_ERROR_CODE, NETWORK_ERROR_KEY } from './constants';
import { ApiError } from './errors';

export type ConvertState =
	| { status: 'idle' }
	| { status: 'loading' }
	| { status: 'success'; data: PostApiConvert200 }
	| { status: 'error'; error: ApiError };

/**
 * @name useConvert
 *
 * @description The typed conversion hook (proposal §10): the request state as a discriminated
 * union TypeScript forces every consumer to handle. Components call this — never the generated
 * client directly, and they never see a raw transport error.
 *
 * @returns {{ state: ConvertState, convert: (body: PostApiConvertBody) => Promise<void> }} the state and the action
 */
export const useConvert = (): {
	state: ConvertState;
	convert: (body: PostApiConvertBody) => Promise<void>;
} => {
	const [state, setState] = useState<ConvertState>({ status: 'idle' });

	const convert = useCallback(async (body: PostApiConvertBody): Promise<void> => {
		setState({ status: 'loading' });
		try {
			const data = await postApiConvert(body);
			setState({ status: 'success', data });
		} catch (error) {
			setState({
				status: 'error',
				error:
					error instanceof ApiError
						? error
						: new ApiError(NETWORK_ERROR_CODE, NETWORK_ERROR_KEY, 'Conversion failed'),
			});
		}
	}, []);

	return { state, convert };
};

/**
 * @name useStats
 *
 * @description The statistics hook (§10): fetched once on mount, refreshed on demand — the
 * page wires refresh() to every successful conversion so the user watches the persistence
 * live. The pinned failure policy: a fetch failure leaves data at null (the card renders
 * dashes) and the next refresh retries — the statistics never block the converter.
 *
 * @returns {{ data: GetApiStats200 | null, refresh: () => void }} the latest totals and the refresh action
 */
export const useStats = (): { data: GetApiStats200 | null; refresh: () => void } => {
	const [data, setData] = useState<GetApiStats200 | null>(null);

	const refresh = useCallback((): void => {
		getApiStats()
			.then(setData)
			.catch(() => {
				// the pinned policy: dashes now, retry with the next refresh — never blocking
				setData(null);
			});
	}, []);

	useEffect(() => {
		refresh();
	}, [refresh]);

	return { data, refresh };
};
