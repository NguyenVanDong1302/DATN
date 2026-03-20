import {
  User,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from 'firebase/auth'
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { firebaseConfigError, getFirebaseServices } from '../../lib/firebase'

type AuthContextValue = {
  user: User | null
  loading: boolean
  configError: string
  loginWithGoogle: () => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(!firebaseConfigError)

  useEffect(() => {
    if (firebaseConfigError) {
      setLoading(false)
      return
    }

    const { auth } = getFirebaseServices()
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser)
      setLoading(false)
    })

    return () => unsub()
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      configError: firebaseConfigError,
      loginWithGoogle: async () => {
        const { auth, googleProvider } = getFirebaseServices()
        await signInWithPopup(auth, googleProvider)
      },
      logout: async () => {
        const { auth } = getFirebaseServices()
        await signOut(auth)
      },
    }),
    [user, loading],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }

  return context
}
