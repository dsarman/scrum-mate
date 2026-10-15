import { useEffect, useRef, useState } from 'react';

/**
 * A text field that is locally controlled, syncs from the server when not focused,
 * and sends after a short idle period or on blur. Typing never waits on the server.
 */
export function useDebouncedText(
  serverValue: string,
  send: (value: string) => void,
  delayMs = 400,
): {
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  onFocus: () => void;
} {
  const [value, setValue] = useState(serverValue);
  const focused = useRef(false);
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestSend = useRef(send);
  latestSend.current = send;

  useEffect(() => {
    if (!focused.current && !dirty.current) setValue(serverValue);
  }, [serverValue]);

  const flush = (v: string) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    dirty.current = false;
    latestSend.current(v);
  };

  return {
    value,
    onChange: (v) => {
      setValue(v);
      dirty.current = true;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => flush(v), delayMs);
    },
    onBlur: () => {
      focused.current = false;
      if (dirty.current) flush(value);
    },
    onFocus: () => {
      focused.current = true;
    },
  };
}
