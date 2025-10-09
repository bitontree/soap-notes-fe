import { useState, useCallback } from 'react'
import { validateName, sanitizeName } from '@/lib/utils'

interface UseNameValidationOptions {
  fieldName?: string
  required?: boolean
  autoSanitize?: boolean
}

interface NameValidationState {
  value: string
  error: string | null
  isValid: boolean
  touched: boolean
}

export function useNameValidation(
  initialValue: string = '',
  options: UseNameValidationOptions = {}
) {
  const {
    fieldName = 'Name',
    required = true,
    autoSanitize = true
  } = options

  const [state, setState] = useState<NameValidationState>({
    value: initialValue,
    error: null,
    isValid: !required || validateName(initialValue, fieldName).isValid,
    touched: false
  })

  const setValue = useCallback((newValue: string) => {
    const valueToUse = autoSanitize ? sanitizeName(newValue) : newValue
    const validation = validateName(valueToUse, fieldName)
    
    setState(prev => ({
      value: valueToUse,
      error: validation.error,
      isValid: validation.isValid,
      touched: prev.touched || newValue !== initialValue
    }))
  }, [autoSanitize, fieldName, initialValue])

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setValue(e.target.value)
  }, [setValue])

  const handleBlur = useCallback(() => {
    setState(prev => ({ ...prev, touched: true }))
  }, [])

  const reset = useCallback(() => {
    setState({
      value: initialValue,
      error: null,
      isValid: !required || validateName(initialValue, fieldName).isValid,
      touched: false
    })
  }, [initialValue, required, fieldName])

  const validate = useCallback(() => {
    const validation = validateName(state.value, fieldName)
    setState(prev => ({
      ...prev,
      error: validation.error,
      isValid: validation.isValid,
      touched: true
    }))
    return validation.isValid
  }, [state.value, fieldName])

  return {
    value: state.value,
    error: state.error,
    isValid: state.isValid,
    touched: state.touched,
    setValue,
    handleChange,
    handleBlur,
    reset,
    validate,
    // Helper to get error message only when touched
    displayError: state.touched ? state.error : null
  }
}

export default useNameValidation