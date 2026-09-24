import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

interface NotFoundChromeContextValue {
  isNotFound: boolean
  setIsNotFound: (value: boolean) => void
}

const NotFoundChromeContext = createContext<NotFoundChromeContextValue | null>(null)

export function NotFoundChromeProvider({ children }: { children: ReactNode }) {
  const [isNotFound, setIsNotFoundState] = useState(false)
  const setIsNotFound = useCallback((value: boolean) => {
    setIsNotFoundState(value)
  }, [])
  const value = useMemo(
    () => ({ isNotFound, setIsNotFound }),
    [isNotFound, setIsNotFound],
  )

  return createElement(NotFoundChromeContext.Provider, { value }, children)
}

export function useNotFoundChrome(): NotFoundChromeContextValue {
  return (
    useContext(NotFoundChromeContext) ?? {
      isNotFound: false,
      setIsNotFound: () => undefined,
    }
  )
}

/** Registers the current view as a chrome-free 404 until unmount. */
export function useRegisterNotFoundPage(): void {
  const { setIsNotFound } = useNotFoundChrome()

  useLayoutEffect(() => {
    setIsNotFound(true)
    return () => setIsNotFound(false)
  }, [setIsNotFound])
}
