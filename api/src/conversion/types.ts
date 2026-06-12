export type ConvertInput = {
	amount: number;
	from: string;
	to: string;
};

export type ConvertResult = {
	amount: number;
	from: string;
	to: string;
	rate: number;
	result: number;
	rateTimestamp: string;
};
