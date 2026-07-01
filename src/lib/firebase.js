/**
 * Firebase initialization — Auth only (no Firestore, no Storage).
 * Uses POPUP for Google sign-in (not redirect) to avoid race conditions.
 */
import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'

const firebaseConfig = {
  apiKey: "AIzaSyCogzt0zXHnfSObbKF55dw7pVpqbMVW_1k",
  authDomain: "souiikadz-d02d3.firebaseapp.com",
  projectId: "souiikadz-d02d3",
  storageBucket: "souiikadz-d02d3.firebasestorage.app",
  messagingSenderId: "969187817593",
  appId: "1:969187817593:web:31d2836e0483985f4afca8"
}

const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const googleProvider = new GoogleAuthProvider()
export default app
