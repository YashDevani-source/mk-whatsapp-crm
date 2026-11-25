// The live WhatsApp state over Socket.io. The server sends the current state on connect and every
// change after (WA-15, WA-16); the QR reaches only a Super Admin's socket.
import { WaQr, WaState } from '@crm/shared';
import { useEffect, useState } from 'react';
import { io, type Socket } from 'socket.io-client';

// One socket per logged-in page, shared by the WhatsApp and message hooks. The rooms it is in
// are chosen by the server from the session (FND-17).
export function useSocket(): Socket | undefined {
  const [socket, setSocket] = useState<Socket>();
  useEffect(() => {
    // Same origin: the Vite proxy forwards /socket.io to the api with the session cookie.
    const s = io({ withCredentials: true });
    setSocket(s);
    return () => {
      s.disconnect();
    };
  }, []);
  return socket;
}

export interface WhatsAppLive {
  state: WaState | undefined;
  qr: string | undefined;
}

export function useWhatsApp(socket: Socket | undefined): WhatsAppLive {
  const [state, setState] = useState<WaState>();
  const [qr, setQr] = useState<string>();

  useEffect(() => {
    if (!socket) return;
    const onState = (payload: unknown): void => {
      const parsed = WaState.safeParse(payload);
      if (!parsed.success) return;
      setState(parsed.data);
      if (parsed.data.state !== 'qr_required') setQr(undefined);
    };
    const onQr = (payload: unknown): void => {
      const parsed = WaQr.safeParse(payload);
      if (parsed.success) setQr(parsed.data.qr);
    };
    const onDisconnect = (): void => setState(undefined);
    socket.on('wa.state', onState);
    socket.on('wa.qr', onQr);
    socket.on('disconnect', onDisconnect);
    return () => {
      socket.off('wa.state', onState);
      socket.off('wa.qr', onQr);
      socket.off('disconnect', onDisconnect);
    };
  }, [socket]);

  return { state, qr };
}
