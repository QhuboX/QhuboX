// src/app/page.tsx
import dynamic from 'next/dynamic';

// Dynamic import to avoid SSR issues with wallet/socket
const QhuboXTerminal = dynamic(
  () => import('@/components/QhuboXTerminal'),
  { ssr: false }
);

export default function Home() {
  return (
    <main>
      <QhuboXTerminal />
    </main>
  );
}
