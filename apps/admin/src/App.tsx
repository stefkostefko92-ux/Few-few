import { Navigate, Route, Routes } from 'react-router-dom';

import { useMe } from '@/auth/useAuth';
import { Layout } from '@/components/Layout';
import { Spinner } from '@/components/Spinner';
import { LoginPage } from '@/pages/LoginPage';
import { QueuePage } from '@/pages/QueuePage';
import { ReportDetailPage } from '@/pages/ReportDetailPage';

export function App() {
  const me = useMe();

  if (me.isPending) {
    return (
      <div className="flex min-h-full items-center justify-center">
        <Spinner label="Зареждане…" />
      </div>
    );
  }

  if (!me.data) {
    return <LoginPage />;
  }

  return (
    <Layout admin={me.data}>
      <Routes>
        <Route path="/" element={<QueuePage />} />
        <Route path="/report/:id" element={<ReportDetailPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
