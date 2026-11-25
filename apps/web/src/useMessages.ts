// MSG-24: the conversation list and the open conversation's messages, loaded over HTTP and kept
// live over the shared socket. Every payload is checked with its shared schema first.
import { ConversationSummary, MessageStatusUpdate, MessageView } from '@crm/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { listConversations, listMessages } from './api.ts';
import { addMessage, applyStatus, upsertConversation } from './messages-view.ts';

export interface MessagesLive {
  conversations: ConversationSummary[];
  selected: string | undefined;
  select: (id: string) => void;
  messages: MessageView[];
  // Adds a message the page itself sent; the socket push of the same message is then a no-op.
  addOwn: (message: MessageView) => void;
  loadError: boolean;
}

export function useMessages(socket: Socket | undefined): MessagesLive {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [selected, setSelected] = useState<string>();
  const [messages, setMessages] = useState<MessageView[]>([]);
  const [loadError, setLoadError] = useState(false);
  // Read inside socket handlers, which are registered once.
  const selectedRef = useRef<string | undefined>(undefined);

  const refresh = useCallback(async () => {
    const list = await listConversations().catch(() => undefined);
    setLoadError(list === undefined);
    if (list) setConversations(list);
    const id = selectedRef.current;
    if (id) {
      const loaded = await listMessages(id).catch(() => undefined);
      if (loaded && selectedRef.current === id) setMessages(loaded);
    }
  }, []);

  const select = useCallback((id: string) => {
    selectedRef.current = id;
    setSelected(id);
    setMessages([]);
    void listMessages(id)
      .catch(() => undefined)
      .then((loaded) => {
        if (loaded && selectedRef.current === id) setMessages(loaded);
      });
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!socket) return;
    const onCreated = (payload: unknown): void => {
      const parsed = MessageView.safeParse(payload);
      if (!parsed.success || parsed.data.conversationId !== selectedRef.current) return;
      const message = parsed.data;
      setMessages((list) => addMessage(list, message));
    };
    const onStatus = (payload: unknown): void => {
      const parsed = MessageStatusUpdate.safeParse(payload);
      if (parsed.success) setMessages((list) => applyStatus(list, parsed.data));
    };
    const onConversation = (payload: unknown): void => {
      const parsed = ConversationSummary.safeParse(payload);
      if (parsed.success) setConversations((list) => upsertConversation(list, parsed.data));
    };
    // After a reconnect, anything pushed while the socket was down is loaded again.
    const onConnect = (): void => void refresh();
    socket.on('message.created', onCreated);
    socket.on('message.status', onStatus);
    socket.on('conversation.updated', onConversation);
    socket.io.on('reconnect', onConnect);
    return () => {
      socket.off('message.created', onCreated);
      socket.off('message.status', onStatus);
      socket.off('conversation.updated', onConversation);
      socket.io.off('reconnect', onConnect);
    };
  }, [socket, refresh]);

  const addOwn = useCallback((message: MessageView) => {
    if (message.conversationId === selectedRef.current) {
      setMessages((list) => addMessage(list, message));
    }
  }, []);

  return { conversations, selected, select, messages, addOwn, loadError };
}
