import { useTranslation } from 'react-i18next';
import { BootProvider, useBoot } from './boot/BootProvider';
import { Spinner } from './components/Spinner/Spinner';
import { ConverterPage } from './features/converter/ConverterPage/ConverterPage';
import { INIT_FAILURE_MESSAGE } from './i18n/constants';
import styles from './App.module.scss';

/**
 * @name CurrenciesFailed
 *
 * @description The retryable §10 error state — init succeeded, so the texts ARE available
 * and everything here renders translated.
 *
 * @returns {JSX.Element} the error state element
 */
const CurrenciesFailed = () => {
	const { t } = useTranslation();
	const { retryCurrencies } = useBoot();
	return (
		<main className={styles.center}>
			<p role="alert">{t('errors.internal')}</p>
			<button className={styles.retry} onClick={retryCurrencies}>
				{t('ui.retry')}
			</button>
		</main>
	);
};

/**
 * @name AppContent
 *
 * @description Renders the boot phase (§10): the full-page spinner, the terminal init failure
 * (the single hardcoded string — no translations exist in that state), the retryable
 * currencies failure, or the app itself.
 *
 * @returns {JSX.Element} the phase element
 */
const AppContent = () => {
	const { state } = useBoot();
	switch (state.status) {
		case 'loading':
			return (
				<main className={styles.center}>
					<Spinner />
				</main>
			);
		case 'init-failed':
			return (
				<main className={styles.center}>
					<p role="alert">{INIT_FAILURE_MESSAGE}</p>
				</main>
			);
		case 'currencies-failed':
			return <CurrenciesFailed />;
		case 'ready':
			return <ConverterPage currencies={state.currencies} />;
	}
};

/**
 * @name App
 *
 * @description The application root — the boot provider around the phased content.
 *
 * @returns {JSX.Element} the root element
 */
export const App = () => (
	<BootProvider>
		<AppContent />
	</BootProvider>
);
