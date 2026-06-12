import { useTranslation } from 'react-i18next';
import { LANGUAGE_STORAGE_KEY } from '../../i18n/constants';
import styles from './LanguageChanger.module.scss';

export type LanguageChangerProps = {
	languages: readonly string[];
};

/**
 * @name LanguageChanger
 *
 * @description The §10 language switch (amended at 0.10.0: centered ABOVE the title on BOTH
 * breakpoints — the original corner placement collided with the title on mobile). The codes
 * come from the server list (the frontend hardcodes nothing about languages) and render as
 * themselves; a click switches instantly (all the languages are already downloaded), persists
 * to localStorage and updates <html lang>.
 *
 * @param {LanguageChangerProps} props the server-offered language codes
 *
 * @returns {JSX.Element} the changer element
 */
export const LanguageChanger = ({ languages }: LanguageChangerProps) => {
	const { i18n } = useTranslation();

	/**
	 * @name switchLanguage
	 *
	 * @description Applies a picked language everywhere the §10 chain reads it.
	 *
	 * @param {string} language the picked language code
	 *
	 * @returns {void} nothing
	 */
	const switchLanguage = (language: string): void => {
		void i18n.changeLanguage(language);
		localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
		document.documentElement.lang = language;
	};

	return (
		<nav className={styles.changer} aria-label="Language">
			{languages.map((language) => (
				<button
					key={language}
					type="button"
					className={language === i18n.language ? styles.active : styles.option}
					aria-pressed={language === i18n.language}
					onClick={() => switchLanguage(language)}
				>
					{language.toUpperCase()}
				</button>
			))}
		</nav>
	);
};
