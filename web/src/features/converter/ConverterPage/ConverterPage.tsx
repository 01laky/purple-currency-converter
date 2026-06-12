import { useTranslation } from 'react-i18next';
import { ConverterForm } from '../ConverterForm/ConverterForm';
import styles from './ConverterPage.module.scss';

/**
 * @name ConverterPage
 *
 * @description The single screen of the SPA (§10): the centered H1 and the converter per the
 * Figma layout — the elements top to bottom, the layouts switching by the 920 px grid.
 *
 * @param {{ currencies: Record<string, string> }} props the supported currencies from the boot
 *
 * @returns {JSX.Element} the page element
 */
export const ConverterPage = ({ currencies }: { currencies: Record<string, string> }) => {
	const { t } = useTranslation();
	return (
		<main className={styles.page}>
			<h1 className={styles.heading}>{t('ui.title')}</h1>
			<ConverterForm currencies={currencies} />
		</main>
	);
};
