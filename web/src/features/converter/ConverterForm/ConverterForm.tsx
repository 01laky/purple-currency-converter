import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useConvert } from '../../../api/hooks';
import type { GetApiStats200 } from '../../../api/generated/model';
import { CurrencySelect } from '../../../components/CurrencySelect/CurrencySelect';
import { formatMoney } from '../../../lib/format';
import { ResultCard } from '../ResultCard/ResultCard';
import { AMOUNT_PATTERN, DEFAULT_AMOUNT, DEFAULT_FROM, DEFAULT_TO } from './constants';
import { errorPlacement } from './errorPlacement';
import styles from './ConverterForm.module.scss';

type FormValues = {
	amount: string;
};

export type ConverterFormProps = {
	currencies: Record<string, string>;
	// optional so the 0.9.0 tests stay untouched (rule 29) — the page always passes it
	stats?: GetApiStats200 | null;
	onConverted?: () => void;
};

/**
 * @name ConverterForm
 *
 * @description The Figma form card and the Result card (§10): the amount input (react-hook-form,
 * autofocus, Enter submits), the two ARIA-combobox selects with mutual exclusion, and the
 * EXPLICIT Convert action with double-submit prevention (§6 — the FE never retries a POST).
 * The 0.10.0 defaults: the amount pre-fills with 0 (NOT submittable — the validation requires
 * a positive value — and fully selected on focus so the first keystroke replaces it), EUR→CZK.
 * The error placement is the TWO-LEVEL mapping (errorPlacement): the amount keys at the field,
 * the currency keys and the 422 at the selects, the generic 400 at the form, the upstream
 * failures as the page-level banner. The in-flight button announces itself (aria-busy + the
 * role="status" inline spinner).
 *
 * @param {ConverterFormProps} props the currencies, the latest totals and the refresh callback
 *
 * @returns {JSX.Element} the converter element
 */
export const ConverterForm = ({ currencies, stats, onConverted }: ConverterFormProps) => {
	const { t } = useTranslation();
	const [from, setFrom] = useState(DEFAULT_FROM);
	const [to, setTo] = useState(DEFAULT_TO);
	// the select-all-on-focus survives the mouse: focus fires on mousedown and select() would
	// be collapsed by the following mouseup placing the caret — suppress that ONE mouseup
	// (later clicks position the caret normally)
	const amountJustFocused = useRef(false);
	const { state, convert } = useConvert();
	const {
		register,
		handleSubmit,
		formState: { isValid },
	} = useForm<FormValues>({ mode: 'onChange', defaultValues: { amount: DEFAULT_AMOUNT } });

	/**
	 * @name onSubmit
	 *
	 * @description Normalizes the amount (a comma decimal counts — the CZ/SK habit), fires the
	 * conversion and reports a success upward (the page refreshes the statistics — §10).
	 *
	 * @param {FormValues} values the validated form values
	 *
	 * @returns {Promise<void>} resolves when the conversion settles
	 */
	const onSubmit = async (values: FormValues): Promise<void> => {
		await convert({ amount: Number(values.amount.replace(',', '.')), from, to });
	};

	const pending = state.status === 'loading';
	const error = state.status === 'error' ? state.error : null;
	const placement = error === null ? null : errorPlacement(error);

	if (state.status === 'success' && onConverted !== undefined) {
		// fired during render would loop — the success transition happens exactly once per
		// convert() call, so the effect-free notification is safe via the microtask
		queueMicrotask(onConverted);
	}

	return (
		<div className={styles.converter}>
			{placement === 'banner' && error !== null && (
				<p className={styles.banner} role="alert">
					{t(error.key, error.params)}
				</p>
			)}
			<form className={styles.card} onSubmit={(event) => void handleSubmit(onSubmit)(event)}>
				<div className={styles.fields}>
					<div className={styles.field}>
						<label className={styles.label} htmlFor="amount">
							{t('ui.amountToConvert')}
						</label>
						<input
							id="amount"
							className={styles.input}
							inputMode="decimal"
							autoFocus
							onFocus={(event) => {
								amountJustFocused.current = true;
								event.currentTarget.select();
							}}
							onMouseUp={(event) => {
								// the caret placement happens at mousedown — RE-select after it, once
								if (amountJustFocused.current) {
									event.preventDefault();
									event.currentTarget.select();
									amountJustFocused.current = false;
								}
							}}
							{...register('amount', {
								required: true,
								pattern: AMOUNT_PATTERN,
								validate: (value) => Number(value.replace(',', '.')) > 0,
							})}
						/>
						{placement === 'amount' && error !== null && (
							<p className={styles.fieldError} role="alert">
								{t(error.key, error.params)}
							</p>
						)}
					</div>
					<CurrencySelect
						id="from"
						label={t('ui.from')}
						value={from}
						currencies={currencies}
						excludeCode={to}
						onChange={setFrom}
					/>
					<CurrencySelect
						id="to"
						label={t('ui.to')}
						value={to}
						currencies={currencies}
						excludeCode={from}
						onChange={setTo}
					/>
				</div>
				{placement === 'selects' && error !== null && (
					<p className={styles.fieldError} role="alert">
						{t(error.key, error.params)}
					</p>
				)}
				{placement === 'form' && error !== null && (
					<p className={styles.fieldError} role="alert">
						{t(error.key, error.params)}
					</p>
				)}
				<button
					className={styles.button}
					type="submit"
					disabled={!isValid || pending}
					aria-busy={pending}
				>
					{pending && <span className={styles.buttonSpinner} role="status" aria-live="polite" />}
					{t('ui.convertCurrency')}
				</button>
			</form>
			<ResultCard
				value={state.status === 'success' ? formatMoney(state.data.result, state.data.to) : null}
				stats={stats ?? null}
			/>
		</div>
	);
};
