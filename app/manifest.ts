import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Dayflow Productivity Planner',
    short_name: 'Dayflow',
    description: 'Plan your day, track focus sessions, and review weekly productivity.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0c1020',
    theme_color: '#6e68ee',
    icons: [
      { src: '/icons/icon-144x144.png', sizes: '144x144', type: 'image/png' },
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' },
    ],
  };
}
