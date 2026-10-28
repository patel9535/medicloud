import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AppID from 'ibmcloud-appid-js';
import { api } from './api.js';

const AuthContext = createContext(null);
const appIdConfig = {
  clientId: import.meta.env.VITE_APPID_CLIENT_ID,
  discoveryEndpoint: import.meta.env.VITE_APPID_DISCOVERY_ENDPOINT,
};
const appIdConfigured = Boolean(appIdConfig.clientId && appIdConfig.discoveryEndpoint);
const appID = appIdConfigured ? new AppID() : null;
let appIdInitialization;

function initializeAppId() {
  if (!appIdConfigured) return Promise.reject(new Error('IBM App ID is not configured.'));
  appIdInitialization ??= appID.init(appIdConfig);
  return appIdInitialization;
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [appIdReady, setAppIdReady] = useState(false);
  const [appIdError, setAppIdError] = useState('');

  useEffect(() => {
    if (!appIdConfigured) return;
    let mounted = true;
    initializeAppId()
      .then(() => { if (mounted) setAppIdReady(true); })
      .catch(() => { if (mounted) setAppIdError('Could not initialize IBM App ID. Check the client ID and discovery endpoint.'); });
    return () => { mounted = false; };
  }, []);

  const value = useMemo(() => ({
    user: session?.user ?? null,
    appIdConfigured,
    appIdReady,
    appIdError,
    async signIn() {
      await initializeAppId();
      const tokens = await appID.signin();
      if (!tokens?.accessToken || !tokens?.idToken) throw new Error('IBM App ID did not return both required sign-in tokens.');
      const { data } = await api.post('/auth/appid/session', null, {
        headers: { Authorization: `Bearer ${tokens.accessToken} ${tokens.idToken}` },
      });
      api.defaults.headers.common.Authorization = `Bearer ${data.data.accessToken}`;
      setSession({ user: data.data.user, token: data.data.accessToken });
      return data.data.user;
    },
    async signInWithPassword(username, password) {
      const { data } = await api.post('/auth/local/session', { username, password });
      api.defaults.headers.common.Authorization = `Bearer ${data.data.accessToken}`;
      setSession({ user: data.data.user, token: data.data.accessToken });
      return data.data.user;
    },
    async signOut() {
      try { if (session?.token) await api.post('/auth/logout'); } catch { /* Clear the local session even if the API is offline. */ }
      delete api.defaults.headers.common.Authorization;
      setSession(null);
    },
  }), [session, appIdReady, appIdError]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used within AuthProvider.');
  return value;
}
