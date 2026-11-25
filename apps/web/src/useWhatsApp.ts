// The live WhatsApp state over Socket.io. The server sends the current state on connect and every
// change after (WA-15, WA-16); the QR reaches only a Super Admin's socket.
import { WaQr, WaState } from '@crm/shared';
import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';

export interface WhatsAppLive {
  state: WaState | undefined;
  qr: string | undefined;
}

export function useWhatsApp(): WhatsAppLive {
  const [state, setState] = useState<WaState>();
  const [qr, setQr] = useState<string>();

  useEffect(() => {
    // Same origin: the Vite proxy forwards /socket.io to the api with the session cookie.
    const socket = io({ withCredentials: true });
    socket.on('wa.state', (payload: unknown) => {
      const parsed = WaState.safeParse(payload);
      if (!parsed.success) return;
      setState(parsed.data);
      if (parsed.data.state !== 'qr_required') setQr(undefined);
    });
    socket.on('wa.qr', (payload: unknown) => {
      const parsed = WaQr.safeParse(payload);
      if (parsed.success) setQr(parsed.data.qr);
    });
    socket.on('disconnect', () => setState(undefined));
    return () => {
      socket.disconnect();
    };
  }, []);

  return { state, qr };
}
