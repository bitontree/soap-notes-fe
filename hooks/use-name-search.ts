import { useState, useCallback } from 'react'
import { sanitizeName, validateName } from '@/lib/utils'

interface UseNameSearchOptions {
  fieldName?: string
  autoSanitize?: boolean
  validateOnChange?: boolean
}

interface NameSearchState {
  value: string
  error: string | null
  isValid: boolean
  touched: boolean
}

/**
 * Custom hook for name search inputs with validation and sanitization
 * Useful for search boxes, quick-add fields, and other name input scenarios
 */
export function useNameSearch(
  initialValue: string = '',
  options: UseNameSearchOptions = {}
) {
  const {
    fieldName = 'Name',
    autoSanitize = true,
    validateOnChange = false
  } = options

  const [state, setState] = useState<NameSearchState>({
    value: initialValue,
    error: null,
    isValid: true, // Start as valid for search (empty is ok)
    touched: false
  })

  const setValue = useCallback((newValue: string) => {
    // Step 1: Sanitize the input to remove invalid characters
    const valueToUse = autoSanitize ? sanitizeName(newValue) : newValue
    
    // Step 2: Validate the sanitized input for business rules
    let validation: { isValid: boolean; error: string | null } = { isValid: true, error: null }
    if (validateOnChange && valueToUse.trim()) {
      validation = validateName(valueToUse, fieldName)
    }
    
    setState(prev => ({
      value: valueToUse,
      error: validation.error,
      isValid: validation.isValid,
      touched: prev.touched || newValue !== initialValue
    }))
  }, [autoSanitize, validateOnChange, fieldName, initialValue])

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setValue(e.target.value)
  }, [setValue])

  const handleBlur = useCallback(() => {
    setState(prev => ({ ...prev, touched: true }))
  }, [])

  const validate = useCallback(() => {
    if (!state.value.trim()) {
      // Empty search is valid for search fields
      setState(prev => ({
        ...prev,
        error: null,
        isValid: true,
        touched: true
      }))
      return true
    }

    // Validate the sanitized value for business rules
    const validation = validateName(state.value, fieldName)
    setState(prev => ({
      ...prev,
      error: validation.error,
      isValid: validation.isValid,
      touched: true
    }))
    return validation.isValid
  }, [state.value, fieldName])

  const reset = useCallback(() => {
    setState({
      value: initialValue,
      error: null,
      isValid: true,
      touched: false
    })
  }, [initialValue])

  return {
    value: state.value,
    error: state.error,
    isValid: state.isValid,
    touched: state.touched,
    setValue,
    handleChange,
    handleBlur,
    validate,
    reset,
    // Helper to get error message only when touched and value is not empty
    displayError: state.touched && state.value.trim() ? state.error : null
  }
}

/**
 * Simple function to create a sanitizing onChange handler for search inputs
 * Use this for quick integration without the full hook
 */
export function createNameSearchHandler(
  setValue: (value: string) => void,
  onValidation?: (isValid: boolean, error: string | null) => void
) {
  return (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value
    // Step 1: Sanitize input to remove invalid characters
    const sanitized = sanitizeName(inputValue)
    
    setValue(sanitized)
    
    // Step 2: Validate sanitized input for business rules
    if (onValidation && sanitized.trim()) {
      const validation = validateName(sanitized, "Search")
      onValidation(validation.isValid, validation.error)
    } else if (onValidation) {
      // Empty is valid for search
      onValidation(true, null)
    }
  }
}

export default useNameSearch