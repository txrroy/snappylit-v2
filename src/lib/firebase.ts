import { initializeApp, getApps, getApp, type FirebaseOptions } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

const firebaseConfig: FirebaseOptions = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || 'demo-api-key',
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || 'snappylit-news.firebaseapp.com',
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || 'snappylit-news',
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || '1:000000000000:web:demo',
};

function resolveEmulatorHost(): string {
  if (process.env.EXPO_PUBLIC_FIREBASE_EMULATOR_HOST) {
    return process.env.EXPO_PUBLIC_FIREBASE_EMULATOR_HOST;
  }

  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.hostname) {
    return window.location.hostname;
  }

  // In Expo Go / dev builds on a physical device, hostUri is "<LAN_IP>:8081"
  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) {
    const host = hostUri.split(':')[0];
    if (host) return host;
  }

  return Platform.OS === 'android' ? '10.0.2.2' : '127.0.0.1';
}

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let emulatorsConnected = false;

if (process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATOR === 'true' && !emulatorsConnected) {
  const emulatorHost = resolveEmulatorHost();
  connectFirestoreEmulator(db, emulatorHost, 8080);
  connectAuthEmulator(auth, `http://${emulatorHost}:9099`, { disableWarnings: true });
  emulatorsConnected = true;
}

export { app, auth, db };
