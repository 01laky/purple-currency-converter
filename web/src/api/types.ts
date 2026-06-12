export type ApiErrorParams = Record<string, string | number>;

// the §3 unified error body — typed locally so the mutator never imports the generated
// client (the generated client imports the mutator; a cycle would be the alternative)
export type ApiErrorBody = {
	error: {
		code: string;
		key: string;
		message: string;
		params?: ApiErrorParams;
	};
};
