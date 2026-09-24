import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { initTheme } from '@/ui/theme';
import { App } from './App';
import './index.css';

const root = document.getElementById('root');
if (!root) throw new Error('missing #root');

// Applied before the first render so a dark-themed launch never flashes
// light, which on a desktop app reads as a broken window rather than a
// transition.
initTheme();

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
