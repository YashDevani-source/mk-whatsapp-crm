// Sidebar and dashboard icons (DEMO-36): simple 24 px line drawings in the current text colour.
// Decorative only; the link or button next to each one carries the name.
import type { PageKey } from './access.ts';
import whatsappLogo from './assets/whatsapp.svg';

const PATHS: Readonly<
  Record<PageKey | 'demo' | 'arrow' | 'logout' | 'mail' | 'lock' | 'eye' | 'eyeOff', string>
> = {
  dashboard: 'M12 3v9h9M12 3a9 9 0 1 0 9 9M15 3.5A9 9 0 0 1 20.5 9H15z',
  home: 'M3 11.5 12 4l9 7.5M5.5 9.5V20h13V9.5M10 20v-5h4v5',
  inbox: 'M4 5h16v11H9l-5 4zM8 9.5h8M8 12.5h5',
  leads:
    'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM3 20a6 6 0 0 1 12 0M16 4.5a3.5 3.5 0 0 1 0 6.5M18 14a6 6 0 0 1 3 6',
  properties: 'M3 21h18M5 21V8l7-5 7 5v13M9.5 21v-5h5v5M9.5 11h1M13.5 11h1',
  followUps: 'M4 6h16v14H4zM4 10h16M8 3v5M16 3v5M9 15l2 2 4-4',
  campaigns: 'M4 10v4h3l7 4V6l-7 4zM17.5 9a4 4 0 0 1 0 6M7 14l1 5h2.5l-1-5',
  users: 'M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  reports: 'M4 20V4M4 20h16M8 16v-5M12 16V8M16 16v-3',
  audit: 'M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h7',
  whatsapp:
    'M4 20l1.3-4A8 8 0 1 1 8 18.7zM9 9.5c0 3 2.5 5.5 5.5 5.5l1.2-1.4-2-1-1 .8a4 4 0 0 1-2-2l.8-1-1-2z',
  demo: 'M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1',
  arrow: 'M7 17 17 7M9 7h8v8',
  logout: 'M14 4h5v16h-5M10 8l-4 4 4 4M6 12h10',
  mail: 'M3.5 6h17v12h-17zM3.5 7l8.5 6 8.5-6',
  lock: 'M6 11h12v10H6zM8.5 11V7.5a3.5 3.5 0 0 1 7 0V11',
  eye: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  eyeOff:
    'M3 3l18 18M10.6 6.1A9 9 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-2.6 3.4M6.6 6.6A17 17 0 0 0 2.5 12S6 18.5 12 18.5a9 9 0 0 0 4-.9M9.9 9.9a3 3 0 0 0 4.2 4.2',
};

export type IconName = keyof typeof PATHS;

// WhatsApp is a real product: its real full-colour mark (CC0, gilbarbara/logos via the
// design-taste-frontend kit), never a redrawn one. WhatsApp is a trademark of its owner.
export function WhatsAppLogo({ size = 20 }: { size?: number }) {
  return <img className="icon brand-logo" src={whatsappLogo} width={size} height={size} alt="" />;
}

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
