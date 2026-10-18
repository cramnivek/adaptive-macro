import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';
import { client, fail } from './api';

/** Thrown when the person closes the native account picker; callers stay quiet about it. */
export class SignInCancelled extends Error {}

const googleModule = () => import('@react-native-google-signin/google-signin');

export const signInWithGoogle = async (): Promise<void> => {
  if (Platform.OS === 'web') {
    const { error } = await client().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    if (error) fail(error);
    return;
  }
  const { GoogleSignin, isCancelledResponse } = await googleModule();
  GoogleSignin.configure({
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || undefined,
  });
  await GoogleSignin.hasPlayServices();
  const res = await GoogleSignin.signIn();
  if (isCancelledResponse(res)) throw new SignInCancelled();
  const idToken = res.data?.idToken;
  if (!idToken) throw new Error('Google did not return a sign-in token. Try again.');
  const { error } = await client().auth.signInWithIdToken({ provider: 'google', token: idToken });
  if (error) fail(error);
};

/** Forget the chosen Google account on sign-out so the next tap offers the account picker again. */
export const forgetGoogleAccount = async (): Promise<void> => {
  if (Platform.OS === 'web') return;
  try {
    await (await googleModule()).GoogleSignin.signOut();
  } catch {
    // Not signed in with Google or native module unavailable
  }
};

export const appleAvailable = (): Promise<boolean> =>
  Platform.OS === 'ios' ? AppleAuthentication.isAvailableAsync() : Promise.resolve(false);

export const signInWithApple = async (): Promise<void> => {
  const rawNonce = Crypto.randomUUID();
  const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
  let identityToken: string | null;
  try {
    ({ identityToken } = await AppleAuthentication.signInAsync({
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.EMAIL],
      nonce: hashedNonce,
    }));
  } catch (e) {
    if ((e as { code?: string }).code === 'ERR_REQUEST_CANCELED') throw new SignInCancelled();
    throw e;
  }
  if (!identityToken) throw new Error('Apple did not return a sign-in token. Try again.');
  const { error } = await client().auth.signInWithIdToken({
    provider: 'apple',
    token: identityToken,
    nonce: rawNonce,
  });
  if (error) fail(error);
};
