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
import { useAppStore } from '../../state/store'
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
  const { setState } = useAppStore()

  useEffect(() => {
    if (firebaseConfigError) {
      setLoading(false)
      return
    }

    const { auth } = getFirebaseServices()
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser)
      const username = firebaseUser?.email?.split('@')[0]?.trim() || firebaseUser?.displayName?.trim().replace(/\s+/g, '_').toLowerCase() || ''
      setState({ username, token: firebaseUser?.uid || '' })
      setLoading(false)
    })

    return () => unsub()
  }, [setState])

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
        setState({ username: '', token: '' })
      },
    }),
    [user, loading, setState],
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
