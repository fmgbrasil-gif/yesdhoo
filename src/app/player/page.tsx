import type { Metadata, Viewport } from 'next';
import Player from './Player';

export const metadata: Metadata = { title: 'Player — Yes DOOH' };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#000000' };

export default function PlayerPage() {
  return <Player />;
}
