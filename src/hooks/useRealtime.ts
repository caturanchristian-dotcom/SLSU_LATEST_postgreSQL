import { useEffect, useRef } from 'react';

export function useRealtime(eventNames: string | string[], callback: (detail?: any) => void) {
  const savedCallback = useRef(callback);

  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    const handler = (e: Event) => {
      const customEvent = e as CustomEvent;
      savedCallback.current(customEvent.detail);
    };

    const names = Array.isArray(eventNames) ? eventNames : [eventNames];

    names.forEach(name => {
      window.addEventListener(`realtime-${name}`, handler);
    });

    return () => {
      names.forEach(name => {
        window.removeEventListener(`realtime-${name}`, handler);
      });
    };
  }, [Array.isArray(eventNames) ? eventNames.join(',') : eventNames]);
}

