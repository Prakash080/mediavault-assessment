import { StrictMode } from 'react';
import {
  createRoot,
} from 'react-dom/client';

import {
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';

import { App } from './App';
import {
  ErrorBoundary,
} from './components/ErrorBoundary';

import './styles.css';

const queryClient =
  new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        retry: false,
        refetchOnWindowFocus: false,
      },
    },
  });

const container =
  document.getElementById('root');

if (!container) {
  throw new Error(
    'Root element not found',
  );
}

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider
      client={queryClient}
    >
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </QueryClientProvider>
  </StrictMode>,
);