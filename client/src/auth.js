// Auth client — better-auth's vanilla client. Sessions, cookies and OAuth
// redirects are entirely library-managed; we never touch tokens by hand.
import { createAuthClient } from 'better-auth/client';

export const authClient = createAuthClient({ baseURL: '' });  // same origin

export async function getSession(){
  try {
    const { data } = await authClient.getSession();
    return data;                       // null when logged out
  } catch { return null; }
}

export const signIn  = provider => authClient.signIn.social({ provider, callbackURL: location.pathname });
export const signOut = () => authClient.signOut();
