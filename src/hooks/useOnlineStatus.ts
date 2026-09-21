import {
  useEffect,
  useState,
} from 'react';

function getInitialStatus(): boolean {
  if (
    typeof navigator === 'undefined'
  ) {
    return true;
  }

  return navigator.onLine;
}

export function useOnlineStatus(): boolean {
  const [online, setOnline] =
    useState(getInitialStatus);

  useEffect(() => {
    const handleOnline = () => {
      setOnline(true);
    };

    const handleOffline = () => {
      setOnline(false);
    };

    window.addEventListener(
      'online',
      handleOnline,
    );

    window.addEventListener(
      'offline',
      handleOffline,
    );

    return () => {
      window.removeEventListener(
        'online',
        handleOnline,
      );

      window.removeEventListener(
        'offline',
        handleOffline,
      );
    };
  }, []);

  return online;
}