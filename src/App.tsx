import { useEffect, useState } from 'react';
import { WORKER_URL } from './config';

export default function App() {
  const [status, setStatus] = useState<'checking' | 'ok' | 'error'>('checking');
  const [message, setMessage] = useState('بيتأكد من الـ Worker...');

  useEffect(() => {
    fetch(`${WORKER_URL}/api/health`)
      .then((r) => r.json())
      .then((data) => {
        setStatus('ok');
        setMessage(`Worker شغال ✅ — رد: ${JSON.stringify(data)}`);
      })
      .catch(() => {
        setStatus('error');
        setMessage('الـ Worker مش راضي يرد — تأكد إن الرابط في config.ts صح');
      });
  }, []);

  return (
    <div className="min-h-screen bg-white flex items-center justify-center flex-col gap-2 p-6 text-center" dir="rtl">
      <h1 className="text-xl font-bold">المرحلة 1 — الهيكل شغال ✅</h1>
      <p className="text-gray-500">لسه مفيش قنوات ولا فيد — ده طبيعي في المرحلة دي.</p>
      <p style={{ color: status === 'ok' ? 'green' : status === 'error' ? '#b45309' : '#666' }}>
        {message}
      </p>
    </div>
  );
}
