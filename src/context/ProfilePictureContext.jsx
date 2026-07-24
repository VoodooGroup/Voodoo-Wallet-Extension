import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
} from 'react';
import {
  PROFILE_PICTURE_KEY,
  clearProfilePicture as clearStored,
  compressImageFile,
  getProfilePicture,
  setProfilePicture as persistPicture,
} from '../lib/profile-picture.js';

const ProfilePictureContext = createContext(null);

export function ProfilePictureProvider({ children }) {
  const [profilePicture, setProfilePictureState] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getProfilePicture()
      .then((url) => {
        if (!cancelled) setProfilePictureState(url);
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!chrome?.storage?.onChanged) return undefined;
    const onChange = (changes, area) => {
      if (area !== 'local' || !changes[PROFILE_PICTURE_KEY]) return;
      const next = changes[PROFILE_PICTURE_KEY].newValue;
      setProfilePictureState(
        typeof next === 'string' && next.startsWith('data:image/') ? next : null,
      );
    };
    chrome.storage.onChanged.addListener(onChange);
    return () => chrome.storage.onChanged.removeListener(onChange);
  }, []);

  const setFromFile = useCallback(async (file) => {
    const dataUrl = await compressImageFile(file);
    await persistPicture(dataUrl);
    setProfilePictureState(dataUrl);
    return dataUrl;
  }, []);

  const clear = useCallback(async () => {
    await clearStored();
    setProfilePictureState(null);
  }, []);

  const value = useMemo(() => ({
    profilePicture,
    ready,
    setFromFile,
    clear,
  }), [profilePicture, ready, setFromFile, clear]);

  return (
    <ProfilePictureContext.Provider value={value}>
      {children}
    </ProfilePictureContext.Provider>
  );
}

export function useProfilePicture() {
  const ctx = useContext(ProfilePictureContext);
  if (!ctx) {
    return {
      profilePicture: null,
      ready: true,
      setFromFile: async () => null,
      clear: async () => {},
    };
  }
  return ctx;
}
