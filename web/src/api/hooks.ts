import { useCallback, useState } from 'react';
import { postApiConvert } from './generated/client';
import type { PostApiConvert200, PostApiConvertBody } from './generated/model';
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
