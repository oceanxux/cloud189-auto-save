import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import ErrorBoundary from './components/ErrorBoundary';
import './index.css';

const applyInitialTheme = () => {
  try {
    const saved = localStorage.getItem('darkMode');
    const isDark = saved ? JSON.parse(saved) : window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.classList.toggle('dark', !!isDark);
    document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
  } catch {
    // Keep the browser default if storage or media queries are unavailable.
  }
};

applyInitialTheme();

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
