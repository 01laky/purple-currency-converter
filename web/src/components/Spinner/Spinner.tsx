import styles from './Spinner.module.scss';

/**
 * @name Spinner
 *
 * @description The loading indicator — derived from the design system tokens (the design has
 * no spinner element; a conscious §10 addition).
 *
 * @returns {JSX.Element} the spinner element
 */
export const Spinner = () => <div className={styles.spinner} role="status" aria-live="polite" />;
