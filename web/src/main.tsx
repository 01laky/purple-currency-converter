import '@fontsource/roboto/400.css';
import '@fontsource/roboto/500.css';
import './styles/global.scss';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

const rootElement = document.getElementById('root');
if (rootElement === null) {
	throw new Error('Root element #root not found');
}
createRoot(rootElement).render(
	<StrictMode>
		<App />
	</StrictMode>,
);
