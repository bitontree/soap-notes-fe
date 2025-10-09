import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Validates a name field to ensure it only contains alphabetic characters
 * @param name - The name to validate
 * @param fieldName - The field name for error messages (e.g., "First Name", "Last Name")
 * @returns Object with isValid boolean and error message if invalid
 */
export function validateName(name: string, fieldName: string = "Name") {
  // Trim whitespace
  const trimmedName = name.trim()
  
  // Check if empty
  if (!trimmedName) {
    return {
      isValid: false,
      error: `${fieldName} is required`
    }
  }
  
  // Check minimum length (at least 1 character)
  if (trimmedName.length < 1) {
    return {
      isValid: false,
      error: `${fieldName} must be at least 1 character long`
    }
  }
  
  // Check maximum length (reasonable limit)
  if (trimmedName.length > 50) {
    return {
      isValid: false,
      error: `${fieldName} must be less than 50 characters`
    }
  }
  
  // Regular expression to match only letters (including international characters), spaces, hyphens, and apostrophes
  // This allows names like "Mary-Jane", "O'Connor", "José María", etc.
  const nameRegex = /^[a-zA-ZÀ-ÿĀ-žА-я\u4e00-\u9fff\u0600-\u06ff\s'-]+$/
  
  if (!nameRegex.test(trimmedName)) {
    return {
      isValid: false,
      error: `${fieldName} can only contain letters, spaces, hyphens, and apostrophes`
    }
  }
  
  // Check for consecutive spaces or special characters
  if (/\s{2,}/.test(trimmedName) || /[-']{2,}/.test(trimmedName)) {
    return {
      isValid: false,
      error: `${fieldName} cannot contain consecutive spaces or special characters`
    }
  }
  
  // Check that it doesn't start or end with special characters
  if (/^[-'\s]|[-'\s]$/.test(trimmedName)) {
    return {
      isValid: false,
      error: `${fieldName} cannot start or end with spaces, hyphens, or apostrophes`
    }
  }
  
  return {
    isValid: true,
    error: null
  }
}

/**
 * Sanitizes a name by removing invalid characters and normalizing whitespace
 * @param name - The name to sanitize
 * @returns Sanitized name string
 */
export function sanitizeName(name: string): string {
  return name
    .trim()
    .replace(/[^a-zA-ZÀ-ÿĀ-žА-я\u4e00-\u9fff\u0600-\u06ff\s'-]/g, '') // Remove invalid characters
    .replace(/\s+/g, ' ') // Replace multiple spaces with single space
    .replace(/[-']+/g, (match) => match[0]) // Replace multiple consecutive hyphens/apostrophes with single
}

/**
 * Higher-order function that creates an onChange handler with name validation
 * @param setValue - The state setter function
 * @param fieldName - The field name for error messages
 * @param onError - Optional callback for handling validation errors
 * @returns onChange handler function
 */
export function createNameInputHandler(
  setValue: (value: string) => void,
  fieldName: string = "Name",
  onError?: (error: string | null) => void
) {
  return (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value
    
    // Sanitize the input as the user types
    const sanitized = sanitizeName(inputValue)
    
    // Only update if the sanitized value is different (prevents cursor jumping)
    if (sanitized !== inputValue) {
      setValue(sanitized)
    } else {
      setValue(inputValue)
    }
    
    // Validate the sanitized value
    const validation = validateName(sanitized, fieldName)
    if (onError) {
      onError(validation.isValid ? null : validation.error)
    }
  }
}
