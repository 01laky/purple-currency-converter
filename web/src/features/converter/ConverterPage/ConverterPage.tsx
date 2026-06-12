import { useTranslation } from 'react-i18next';
import { useStats } from '../../../api/hooks';
import { LanguageChanger } from '../../../components/LanguageChanger/LanguageChanger';
import { ConverterForm } from '../ConverterForm/ConverterForm';
import styles from './ConverterPage.module.scss';

export type ConverterPageProps = {
	currencies: Record<string, string>;
	languages: readonly string[];
};

/**
 * @name ConverterPage
 *
 * @description The single screen of the SPA (§10): the language changer centered ABOVE the
 * title (the 0.10.0 placement decision — both breakpoints), the centered H1 and the converter.
 * The page owns the statistics (§10: loaded at the boot, refreshed after every successful
 * conversion — the hooks stay single-purpose, the wiring lives here).
 *
 * @param {ConverterPageProps} props the supported currencies and the server language list
 *
 * @returns {JSX.Element} the page element
 */
export const ConverterPage = ({ currencies, languages }: ConverterPageProps) => {
	const { t } = useTranslation();
	const { data: stats, refresh } = useStats();
	return (
		<main className={styles.page}>
			<LanguageChanger languages={languages} />
			<h1 className={styles.heading}>{t('ui.title')}</h1>
			<ConverterForm currencies={currencies} stats={stats} onConverted={refresh} />
		</main>
	);
};
