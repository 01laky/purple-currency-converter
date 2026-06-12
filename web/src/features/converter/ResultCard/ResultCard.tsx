import { useTranslation } from 'react-i18next';
import type { GetApiStats200 } from '../../../api/generated/model';
import { formatCount, formatMoney } from '../../../lib/format';
import { STATS_CURRENCY, VALUE_PLACEHOLDER } from './constants';
import styles from './ResultCard.module.scss';

export type ResultCardProps = {
	value: string | null;
	stats: GetApiStats200 | null;
};

/**
 * @name ResultCard
 *
 * @description The Figma Result card extended by the §10 statistics rows: the Result group,
 * the 1 px divider, then the three assignment statistics in the SAME label+value style —
 * the count, the top target currency and the EUR total. The space is always reserved
 * (CLS ≈ 0); a null value or null stats render dashes — the §10 empty state at zero
 * conversions shows the honest zeros instead. aria-live announces the refreshes.
 *
 * @param {ResultCardProps} props the formatted result value and the latest totals (or nulls)
 *
 * @returns {JSX.Element} the card element
 */
export const ResultCard = ({ value, stats }: ResultCardProps) => {
	const { t } = useTranslation();
	return (
		<section className={styles.card} aria-live="polite">
			<div className={styles.group}>
				<p className={styles.label}>{t('ui.result')}</p>
				<p className={styles.value}>{value ?? VALUE_PLACEHOLDER}</p>
			</div>
			<hr className={styles.divider} />
			<div className={styles.group}>
				<p className={styles.label}>{t('ui.numberOfCalculations')}</p>
				<p className={styles.value}>
					{stats === null ? VALUE_PLACEHOLDER : formatCount(stats.totalConversions)}
				</p>
			</div>
			<div className={styles.group}>
				<p className={styles.label}>{t('ui.topTargetCurrency')}</p>
				<p className={styles.value}>{stats?.topTargetCurrency ?? VALUE_PLACEHOLDER}</p>
			</div>
			<div className={styles.group}>
				<p className={styles.label}>{t('ui.totalAmountEur')}</p>
				<p className={styles.value}>
					{stats === null ? VALUE_PLACEHOLDER : formatMoney(stats.totalAmountEur, STATS_CURRENCY)}
				</p>
			</div>
		</section>
	);
};
