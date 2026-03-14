import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'ArtMood Factory OS',
    short_name: 'ArtMood',
    description: 'Internal Operating System for ArtMood Kitchen Manufacturing',
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#F5F3F0',
    theme_color: '#C9956B',
    orientation: 'portrait',
    categories: ['business', 'productivity'],
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
    ],
    shortcuts: [
      {
        name: 'Dashboard',
        url: '/dashboard',
        description: 'ArtMood Dashboard',
      },
      {
        name: 'Production',
        url: '/production',
        description: 'Production Management',
      },
    ],
  };
}
