import { useEffect, useMemo, useRef, useState } from 'react';
import styles from './CurrencySelect.module.scss';

export type CurrencySelectProps = {
	id: string;
	label: string;
	value: string;
	currencies: Record<string, string>;
	excludeCode?: string;
	onChange: (code: string) => void;
};

/**
 * @name CurrencySelect
 *
 * @description The §10 currency select — an own ARIA combobox implementation (no library):
 * typing filters the list by code or name, ↑/↓ navigate, Enter selects, Esc and an outside
 * click close; fully operable by mouse and keyboard. The currency chosen on the OTHER side is
 * excluded — the same currency cannot be picked twice (the backend 400 stays as defense in
 * depth). The closed state shows the selected code per Figma.
 *
 * @param {CurrencySelectProps} props the field wiring and the exclusion
 *
 * @returns {JSX.Element} the combobox element
 */
export const CurrencySelect = ({
	id,
	label,
	value,
	currencies,
	excludeCode,
	onChange,
}: CurrencySelectProps) => {
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState('');
	const [activeIndex, setActiveIndex] = useState(0);
	const wrapperRef = useRef<HTMLDivElement>(null);

	const options = useMemo(() => {
		const needle = query.toLowerCase();
		return Object.entries(currencies).filter(
			([code, name]) =>
				code !== excludeCode &&
				(code.toLowerCase().includes(needle) || name.toLowerCase().includes(needle)),
		);
	}, [currencies, excludeCode, query]);

	useEffect(() => {
		/**
		 * @name handleOutsideClick
		 *
		 * @description Closes the listbox when the pointer lands outside the combobox.
		 *
		 * @param {MouseEvent} event the document pointer event
		 *
		 * @returns {void} nothing
		 */
		const handleOutsideClick = (event: MouseEvent): void => {
			if (
				wrapperRef.current !== null &&
				event.target instanceof Node &&
				!wrapperRef.current.contains(event.target)
			) {
				setOpen(false);
			}
		};
		document.addEventListener('mousedown', handleOutsideClick);
		return () => document.removeEventListener('mousedown', handleOutsideClick);
	}, []);

	const activeOption = options[activeIndex];
	const listboxId = `${id}-listbox`;

	/**
	 * @name select
	 *
	 * @description Applies a picked currency and closes the listbox.
	 *
	 * @param {string} code the picked currency code
	 *
	 * @returns {void} nothing
	 */
	const select = (code: string): void => {
		onChange(code);
		setQuery('');
		setOpen(false);
	};

	return (
		<div className={styles.wrapper} ref={wrapperRef}>
			<label className={styles.label} htmlFor={id}>
				{label}
			</label>
			<input
				id={id}
				className={styles.input}
				role="combobox"
				aria-expanded={open}
				aria-controls={listboxId}
				aria-autocomplete="list"
				aria-activedescendant={open && activeOption ? `${id}-option-${activeOption[0]}` : undefined}
				autoComplete="off"
				value={open ? query : value}
				onFocus={() => {
					setOpen(true);
					setActiveIndex(0);
				}}
				onChange={(event) => {
					setQuery(event.target.value);
					setOpen(true);
					setActiveIndex(0);
				}}
				onKeyDown={(event) => {
					if (event.key === 'ArrowDown') {
						event.preventDefault();
						setOpen(true);
						setActiveIndex((index) => Math.min(index + 1, options.length - 1));
					} else if (event.key === 'ArrowUp') {
						event.preventDefault();
						setActiveIndex((index) => Math.max(index - 1, 0));
					} else if (event.key === 'Enter' && open && activeOption) {
						event.preventDefault();
						select(activeOption[0]);
					} else if (event.key === 'Escape') {
						setOpen(false);
						setQuery('');
					}
				}}
			/>
			{open && (
				<ul className={styles.listbox} role="listbox" id={listboxId}>
					{options.map(([code, name], index) => (
						<li
							key={code}
							id={`${id}-option-${code}`}
							role="option"
							aria-selected={code === value}
							className={index === activeIndex ? styles.optionActive : styles.option}
							onMouseDown={(event) => {
								event.preventDefault();
								select(code);
							}}
						>
							{code} — {name}
						</li>
					))}
				</ul>
			)}
		</div>
	);
};
