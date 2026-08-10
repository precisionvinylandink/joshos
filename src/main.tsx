import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import App from './App';
import { queryClient } from './shared/lib/queryClient';
import { PersistenceProvider } from './shared/persistence';
import { ThemeProvider } from './shared/theme';
import { AuthProvider } from './shared/auth';
import './styles/globals.css';

const root = document.getElementById('root');
if (!root) throw new Error('Root element #root not found');

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      {/* Persistence wraps Theme because ThemeProvider reads a durable slice. */}
      <PersistenceProvider>
        <ThemeProvider>
          <AuthProvider>
            <BrowserRouter>
              <App />
            </BrowserRouter>
            <Toaster
              position="top-right"
              toastOptions={{
                style: { background: '#141414', color: '#fafafa', border: '1px solid #262626' },
              }}
            />
          </AuthProvider>
        </ThemeProvider>
      </PersistenceProvider>
    </QueryClientProvider>
  </StrictMode>,
);
