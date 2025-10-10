import { useState, useCallback } from 'react'
import { validateEmail, sanitizeEmail } from '@/lib/utils'

interface UseEmailValidationReturn {
  value: string
  error: string | null
  isValid: boolean
  setValue: (value: string) => void
  handleChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  validate: () => boolean
  reset: () => void
}

/**
 * Custom hook for email validation with real-time feedback
 * @param initialValue - Initial email value
 * @returns Object with email state, validation methods, and handlers
 */
export function useEmailValidation(initialValue: string = ''): UseEmailValidationReturn {
  const [value, setValue] = useState(initialValue)
  const [error, setError] = useState<string | null>(null)

  const validate = useCallback(() => {
    const validation = validateEmail(value)
    setError(validation.error)
    return validation.isValid
  }, [value])

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value
    
    // Sanitize the input as the user types
    const sanitized = sanitizeEmail(inputValue)
    
    // Update the value
    setValue(sanitized)
    
    // Clear error when user starts typing again
    if (error) {
      setError(null)
    }
  }, [error])

  const reset = useCallback(() => {
    setValue(initialValue)
    setError(null)
  }, [initialValue])

  const isValid = error === null && value.length > 0

  return {
    value,
    error,
    isValid,
    setValue,
    handleChange,
    validate,
    reset
  }
}