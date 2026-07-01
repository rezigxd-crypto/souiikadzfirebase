/**
 * AuthContext — Firebase Auth + localStorage profiles.
 *
 * STRATEGY:
 *   1. Demo accounts (admin/farmer/client) checked FIRST — instant login, no Firebase.
 *   2. Firebase Auth for real beta users (email/password + Google POPUP).
 *   3. All profile data (name, phone, role, balance) stored in localStorage.
 *   4. AuthContext NEVER navigates — only manages state.
 *   5. Login page navigates after signIn/signUp returns.
 *
 * NO RACE CONDITIONS:
 *   - Google uses signInWithPopup (synchronous result, NOT redirect)
 *   - onAuthStateChanged only for session persistence on page refresh
 *   - Demo accounts bypass Firebase entirely
 */
import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
} from 'firebase/auth'
import { auth, googleProvider } from '../lib/firebase'

const AuthContext = createContext(null)
const STORAGE_KEY = 'souika_user'
const PROFILES_KEY = 'souika_profiles'

// ─── Demo accounts (checked FIRST, before Firebase) ────────────────────────
const DEMO_ACCOUNTS = [
  {
    uid: 'admin-001',
    email: 'admin@sk.dz',
    password: 'admin123#',
    displayName: 'مدير المنصة',
    role: 'admin',
    phone: '0770 333 444',
    wilayaCode: 16,
    hasFarmerCard: false,
    hasCommercialRegistry: false,
    subscription: null,
    subscribedAt: null,
    balance: 0,
    isDemo: true,
  },
  {
    uid: 'farmer-001',
    email: 'farmer@sk.dz',
    password: 'farmer123',
    displayName: 'مزرعة الخضراء',
    role: 'farmer',
    phone: '0555 111 222',
    wilayaCode: 16,
    hasFarmerCard: true,
    hasCommercialRegistry: true,
    subscription: 'seasonal',
    subscribedAt: new Date().toISOString(),
    balance: 48500,
    isDemo: true,
  },
  {
    uid: 'client-001',
    email: 'client@sk.dz',
    password: 'client123',
    displayName: 'أحمد بن علي',
    role: 'consumer',
    phone: '0661 222 333',
    wilayaCode: 31,
    hasFarmerCard: false,
    hasCommercialRegistry: false,
    subscription: null,
    subscribedAt: null,
    balance: 0,
    isDemo: true,
  },
]

// ─── localStorage profile helpers ──────────────────────────────────────────
function loadAllProfiles() {
  try {
    const stored = JSON.parse(localStorage.getItem(PROFILES_KEY) || '[]')
    // Merge with demo accounts
    const merged = [...DEMO_ACCOUNTS]
    for (const sp of stored) {
      const idx = merged.findIndex((p) => p.uid === sp.uid)
      if (idx >= 0) merged[idx] = { ...merged[idx], ...sp }
      else merged.push(sp)
    }
    return merged
  } catch {
    return [...DEMO_ACCOUNTS]
  }
}

function saveAllProfiles(profiles) {
  localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles))
}

function getProfile(uid) {
  return loadAllProfiles().find((p) => p.uid === uid) || null
}

function saveProfile(profile) {
  const profiles = loadAllProfiles()
  const idx = profiles.findIndex((p) => p.uid === profile.uid)
  if (idx >= 0) profiles[idx] = { ...profiles[idx], ...profile }
  else profiles.push(profile)
  saveAllProfiles(profiles)
}

function updateProfileFields(uid, updates) {
  const profiles = loadAllProfiles()
  const idx = profiles.findIndex((p) => p.uid === uid)
  if (idx >= 0) {
    profiles[idx] = { ...profiles[idx], ...updates }
    saveAllProfiles(profiles)
    return profiles[idx]
  }
  return null
}

// ─── AuthProvider ──────────────────────────────────────────────────────────
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  // On mount: check localStorage for demo account FIRST,
  // then subscribe to Firebase auth state for Firebase users.
  useEffect(() => {
    // 1. Check localStorage for demo account
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      try {
        const parsed = JSON.parse(stored)
        const isDemo = DEMO_ACCOUNTS.some((a) => a.uid === parsed.uid)
        if (isDemo) {
          // Demo user — keep them logged in, don't need Firebase
          setUser(parsed)
          setLoading(false)
          return // Don't subscribe to Firebase for demo users
        }
      } catch { /* ignore */ }
    }

    // 2. Subscribe to Firebase auth state (for Firebase/Google users)
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (!firebaseUser) {
        // No Firebase session — clear any stale localStorage
        localStorage.removeItem(STORAGE_KEY)
        setUser(null)
        setLoading(false)
        return
      }

      // Firebase user — get or create profile in localStorage
      let profile = getProfile(firebaseUser.uid)
      if (!profile) {
        // New Firebase user — create minimal profile
        profile = {
          uid: firebaseUser.uid,
          email: firebaseUser.email || '',
          displayName: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'مستخدم',
          role: 'consumer',
          phone: '',
          wilayaCode: null,
          hasFarmerCard: false,
          hasCommercialRegistry: false,
          subscription: null,
          subscribedAt: null,
          balance: 0,
          photoURL: firebaseUser.photoURL || null,
          isDemo: false,
        }
        saveProfile(profile)
      }

      // Strip password if it somehow exists
      const { password, ...safeProfile } = profile
      setUser(safeProfile)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(safeProfile))
      setLoading(false)
    })

    return () => unsubscribe()
  }, [])

  // ─── Sign in (demo accounts FIRST, then Firebase) ────────────────────────
  const signIn = useCallback(async (email, password) => {
    // 1. Check demo accounts
    const demo = DEMO_ACCOUNTS.find(
      (a) => a.email === email && a.password === password
    )
    if (demo) {
      const { password: _pw, ...safeUser } = demo
      setUser(safeUser)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(safeUser))
      return safeUser
    }

    // 2. Try Firebase
    const cred = await signInWithEmailAndPassword(auth, email, password)
    // Profile will be set by onAuthStateChanged, but set it now too
    let profile = getProfile(cred.user.uid)
    if (!profile) {
      profile = {
        uid: cred.user.uid,
        email: cred.user.email || '',
        displayName: cred.user.email?.split('@')[0] || 'مستخدم',
        role: 'consumer',
        phone: '',
        wilayaCode: null,
        hasFarmerCard: false,
        hasCommercialRegistry: false,
        subscription: null,
        subscribedAt: null,
        balance: 0,
        isDemo: false,
      }
      saveProfile(profile)
    }
    const { password: _pw2, ...safeProfile } = profile
    setUser(safeProfile)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(safeProfile))
    return safeProfile
  }, [])

  // ─── Sign up (Firebase) ──────────────────────────────────────────────────
  const signUp = useCallback(async (data) => {
    const cred = await createUserWithEmailAndPassword(auth, data.email, data.password)
    const profile = {
      uid: cred.user.uid,
      email: data.email,
      displayName: data.name || data.email.split('@')[0],
      role: data.role || 'consumer',
      phone: data.phone || '',
      wilayaCode: data.wilayaCode || null,
      hasFarmerCard: !!data.hasFarmerCard,
      hasCommercialRegistry: !!data.hasCommercialRegistry,
      subscription: null,
      subscribedAt: null,
      balance: 0,
      isDemo: false,
    }
    saveProfile(profile)
    setUser(profile)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile))
    return profile
  }, [])

  // ─── Google sign-in (POPUP, not redirect!) ───────────────────────────────
  const signInWithGoogle = useCallback(async (role = 'consumer') => {
    const result = await signInWithPopup(auth, googleProvider)
    const firebaseUser = result.user

    let profile = getProfile(firebaseUser.uid)
    if (!profile) {
      profile = {
        uid: firebaseUser.uid,
        email: firebaseUser.email || '',
        displayName: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'مستخدم',
        role,
        phone: '',
        wilayaCode: null,
        hasFarmerCard: false,
        hasCommercialRegistry: false,
        subscription: null,
        subscribedAt: null,
        balance: 0,
        photoURL: firebaseUser.photoURL || null,
        isDemo: false,
      }
      saveProfile(profile)
    }

    setUser(profile)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile))
    return profile
  }, [])

  // ─── Sign out ─────────────────────────────────────────────────────────────
  const signOut = useCallback(async () => {
    // Check if it's a demo account (no Firebase signOut needed)
    if (user?.isDemo) {
      setUser(null)
      localStorage.removeItem(STORAGE_KEY)
      return
    }
    // Firebase user — sign out from Firebase
    await firebaseSignOut(auth)
    setUser(null)
    localStorage.removeItem(STORAGE_KEY)
  }, [user])

  // ─── Update profile ───────────────────────────────────────────────────────
  const updateProfile = useCallback(async (updates) => {
    if (!user) return null
    const updated = updateProfileFields(user.uid, updates)
    if (updated) {
      const { password, ...safeProfile } = updated
      setUser(safeProfile)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(safeProfile))
      return safeProfile
    }
    return user
  }, [user])

  // ─── Subscribe to plan ───────────────────────────────────────────────────
  const subscribeToPlan = useCallback(async (planId) => {
    if (!user) return null
    const updated = updateProfileFields(user.uid, {
      subscription: planId,
      subscribedAt: new Date().toISOString(),
    })
    if (updated) {
      const { password, ...safeProfile } = updated
      setUser(safeProfile)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(safeProfile))
      return safeProfile
    }
    return user
  }, [user])

  // ─── List all users (admin) ──────────────────────────────────────────────
  const listAllUsers = useCallback(() => {
    return loadAllProfiles().map((p) => {
      const { password, ...safe } = p
      return safe
    })
  }, [])

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAuthenticated: !!user,
        signIn,
        signUp,
        signInWithGoogle,
        signOut,
        updateProfile,
        subscribeToPlan,
        listAllUsers,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
