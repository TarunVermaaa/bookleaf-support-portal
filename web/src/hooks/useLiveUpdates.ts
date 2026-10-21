import { useEffect, useRef, useState } from 'react';

type EventType = 'ticket.created' | 'ticket.updated' | 'ticket.message';

/**
 * Subscribes to the server's SSE stream and calls `onEvent` for ticket changes.
 * The browser's EventSource reconnects automatically; we expose `connected` so the UI can say "Live".
 * Events only carry a ticket id — the caller refetches through the REST API.
 */
export function useLiveUpdates(onEvent: (type: EventType, ticketId: string) => void) {
  const [connected, setConnected] = useState(false);
  const handler = useRef(onEvent);
  handler.current = onEvent;

  useEffect(() => {
    const source = new EventSource('/api/v1/events');
    const listen = (type: EventType) =>
      source.addEventListener(type, (e) => {
        try {
          handler.current(type, JSON.parse((e as MessageEvent).data).ticketId);
        } catch {
          /* ignore malformed event */
        }
      });
    listen('ticket.created');
    listen('ticket.updated');
    listen('ticket.message');
    source.addEventListener('ready', () => setConnected(true));
    source.onerror = () => setConnected(false);
    return () => source.close();
  }, []);

  return connected;
}
