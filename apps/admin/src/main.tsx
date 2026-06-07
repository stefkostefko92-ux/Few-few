import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';

import { setUnauthorizedHandler } from '@/api/client';
import { App } from '@/App';
import '@/index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: false },
  },
});

// При изтекла/невалидна сесия (401) нулираме текущия админ → връщане към вход.
setUnauthorizedHandler(() => {
  queryClient.setQueryData(['me'], null);
});

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Липсва #root елемент в index.html.');
}

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
