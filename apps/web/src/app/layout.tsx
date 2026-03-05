import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'TenderWatch Live',
  description: 'Internal tender aggregator with semantic search',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-surface-50 text-gray-900 min-h-screen antialiased">
        {children}
      </body>
    </html>
  );
}
