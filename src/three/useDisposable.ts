import { useEffect, useMemo } from 'react'

/** useMemo for GPU resources: the value is disposed when it is replaced or unmounted. */
export function useDisposable<T extends { dispose: () => void }>(factory: () => T, deps: unknown[] = []) {
  const value = useMemo(factory, deps)
  useEffect(() => () => value.dispose(), [value])
  return value
}
