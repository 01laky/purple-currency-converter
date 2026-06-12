import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useConvert } from '../../../api/hooks';
import { CurrencySelect } from '../../../components/CurrencySelect/CurrencySelect';
import { formatMoney } from '../../../lib/format';
import { ResultCard } from '../ResultCard/ResultCard';
import { AMOUNT_PATTERN, DEFAULT_FROM, DEFAULT_TO } from './constants';
import styles from './ConverterForm.module.scss';

type FormValues = {
	amount: string;
};

/**
 * @name ConverterForm
 *
 * @description The Figma form card and the Result card (§10): the amount input (react-hook-form,
 * autofocus, Enter submits), the two ARIA-combobox selects with mutual exclusion, and the
 * EXPLICIT Convert action — no live recompute (typing "100" must not record three conversions),
 * the button disabled while invalid or in flight (the FE never retries a POST — §6). An API
 * error renders translated by its key with its params.
 *
 * @param {{ currencies: Record<string, string> }} props the supported currencies from the boot
 *
 * @returns {JSX.Element} the converter element
 */
export const ConverterForm = ({ currencies }: { currencies: Record<string, string> }) => {
	const { t } = useTranslation();
	const [from, setFrom] = useState(DEFAULT_FROM);
	const [to, setTo] = useState(DEFAULT_TO);
	const { state, convert } = useConvert();
	const {
		register,
		handleSubmit,
		formState: { isValid },
	} = useForm<FormValues>({ mode: 'onChange' });

	/**
	 * @name onSubmit
	 *
	 * @description Normalizes the amount (a comma decimal counts — the CZ/SK habit) and fires
	 * the conversion.
	 *
	 * @param {FormValues} values the validated form values
	 *
	 * @returns {Promise<void>} resolves when the conversion settles
	 */
	const onSubmit = async (values: FormValues): Promise<void> => {
		await convert({ amount: Number(values.amount.replace(',', '.')), from, to });
	};

	const pending = state.status === 'loading';

	return (
		<div className={styles.converter}>
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
							{...register('amount', { required: true, pattern: AMOUNT_PATTERN })}
						/>
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
				<button className={styles.button} type="submit" disabled={!isValid || pending}>
					{t('ui.convertCurrency')}
				</button>
			</form>
			{state.status === 'error' && (
				<p className={styles.error} role="alert">
					{t(state.error.key, state.error.params)}
				</p>
			)}
			<ResultCard
				value={state.status === 'success' ? formatMoney(state.data.result, state.data.to) : null}
			/>
		</div>
	);
};
