import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Dayflow | 24-Hour Productivity Planner',
  description: 'Plan precisely, track real focus, and understand your week.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
