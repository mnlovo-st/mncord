import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles/app.css';
import { DesignPage } from './DesignPage';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DesignPage />
  </StrictMode>,
);
