import AppShell from '@/components/layout/AppShell';

import OfflineIndicator from '@/components/ui/OfflineIndicator';
import ServiceWorkerRegistration from '@/components/ServiceWorkerRegistration';
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}
              <OfflineIndicator />
              <ServiceWorkerRegistration /></AppShell>;
}
