import { useTranslation } from 'react-i18next';
import styles from './ResultCard.module.scss';

export type ResultCardProps = {
	value: string | null;
};

/**
 * @name ResultCard
 *
 * @description The Figma Result card: the label and the formatted value. The space is always
 * reserved (CLS ≈ 0 — §10); before the first conversion the value renders as a dash. The
 * statistics rows arrive in v0.10.0.
 *
 * @param {ResultCardProps} props the formatted value, or null before the first conversion
 *
 * @returns {JSX.Element} the card element
 */
export const ResultCard = ({ value }: ResultCardProps) => {
	const { t } = useTranslation();
	return (
		<section className={styles.card} aria-live="polite">
			<p className={styles.label}>{t('ui.result')}</p>
			<p className={styles.value}>{value ?? '—'}</p>
		</section>
	);
};
