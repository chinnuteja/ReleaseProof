import type { Metadata } from 'next';
import './styles.css';

export const metadata: Metadata = {
  title: 'ReleaseProof',
  description: 'Evidence-backed release coordination.'
};

export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
