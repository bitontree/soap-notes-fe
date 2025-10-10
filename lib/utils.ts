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

/**
 * Validates an email address according to specific rules
 * @param email - The email to validate
 * @returns Object with isValid boolean and error message if invalid
 */
export function validateEmail(email: string) {
  // Trim whitespace
  const trimmedEmail = email.trim()
  
  // Check if empty
  if (!trimmedEmail) {
    return {
      isValid: false,
      error: "Email is required"
    }
  }
  
  // Check for exactly one @ symbol
  const atCount = (trimmedEmail.match(/@/g) || []).length
  if (atCount !== 1) {
    return {
      isValid: false,
      error: "Email must contain exactly one @ symbol"
    }
  }
  
  // Split by @ to get local and domain parts
  const [localPart, domainPart] = trimmedEmail.split('@')
  
  // Validate local part (before @)
  const localValidation = validateLocalPart(localPart)
  if (!localValidation.isValid) {
    return localValidation
  }
  
  // Validate domain part (after @)
  const domainValidation = validateDomainPart(domainPart)
  if (!domainValidation.isValid) {
    return domainValidation
  }
  
  return {
    isValid: true,
    error: null
  }
}

/**
 * Validates the local part of an email (before @)
 * @param localPart - The local part to validate
 * @returns Object with isValid boolean and error message if invalid
 */
function validateLocalPart(localPart: string) {
  // Check minimum length
  if (localPart.length < 2) {
    return {
      isValid: false,
      error: "Email must have at least 2 characters before @"
    }
  }
  
  // Check that it doesn't start with special characters
  if (/^[-_.]/.test(localPart)) {
    return {
      isValid: false,
      error: "Email cannot start with -, _, or ."
    }
  }
  
  // Check that it doesn't end with special characters (right before @)
  if (/[-_.]$/.test(localPart)) {
    return {
      isValid: false,
      error: "Email cannot have -, _, or . right before @"
    }
  }
  
  // Check for consecutive special characters
  if (/[-_.][-_.]/.test(localPart)) {
    return {
      isValid: false,
      error: "Email cannot have consecutive special characters (-, _, .)"
    }
  }
  
  // Check for valid characters: letters, numbers, and allowed special chars (-, _, .)
  const localRegex = /^[a-zA-Z0-9._-]+$/
  if (!localRegex.test(localPart)) {
    return {
      isValid: false,
      error: "Email can only contain letters, numbers, hyphens (-), underscores (_), and dots (.)"
    }
  }
  
  return {
    isValid: true,
    error: null
  }
}

/**
 * Validates the domain part of an email (after @)
 * @param domainPart - The domain part to validate
 * @returns Object with isValid boolean and error message if invalid
 */
function validateDomainPart(domainPart: string) {
  // Check for exactly one dot
  const dotCount = (domainPart.match(/\./g) || []).length
  if (dotCount !== 1) {
    return {
      isValid: false,
      error: "Email domain must contain exactly one dot (.)"
    }
  }
  
  // Split by dot to get domain and TLD
  const [domain, tld] = domainPart.split('.')
  
  // Check domain part (between @ and .)
  if (domain.length < 2) {
    return {
      isValid: false,
      error: "Email must have at least 2 characters between @ and ."
    }
  }
  
  // Check TLD part (after .)
  if (tld.length < 2) {
    return {
      isValid: false,
      error: "Email must have at least 2 characters after ."
    }
  }
  
  // Check that domain part only contains letters (between @ and .)
  const domainRegex = /^[a-zA-Z]+$/
  if (!domainRegex.test(domain)) {
    return {
      isValid: false,
      error: "Domain part (between @ and .) can only contain letters"
    }
  }
  
  // Check that TLD part only contains letters (after .)
  const tldRegex = /^[a-zA-Z]+$/
  if (!tldRegex.test(tld)) {
    return {
      isValid: false,
      error: "TLD part (after .) can only contain letters"
    }
  }
  
  return {
    isValid: true,
    error: null
  }
}

/**
 * Sanitizes an email by removing invalid characters and normalizing
 * @param email - The email to sanitize
 * @returns Sanitized email string
 */
export function sanitizeEmail(email: string): string {
  let sanitized = email
    .replace(/[^a-zA-Z0-9@._-]/g, '') // Remove invalid characters, keep valid ones
    .replace(/@@+/g, '@') // Replace multiple @ with single @
    .replace(/\.\.+/g, '.') // Replace multiple dots with single dot
    .replace(/--+/g, '-') // Replace multiple hyphens with single hyphen
    .replace(/__+/g, '_') // Replace multiple underscores with single underscore

  // Ensure email starts with only letters or numbers (remove all special characters from start)
  sanitized = sanitized.replace(/^[^a-zA-Z0-9]+/, '')

  // Prevent consecutive special characters (but allow them individually)
  sanitized = sanitized.replace(/([._-])([._-])/g, '$1')

  // Ensure at least 2 characters before @ (if @ exists)
  const atIndex = sanitized.indexOf('@')
  if (atIndex !== -1 && atIndex < 2) {
    // If @ is found but there are less than 2 characters before it, remove the @
    sanitized = sanitized.replace('@', '')
  }

  // Ensure only one @ symbol - if there are multiple, keep only the first one
  const atCount = (sanitized.match(/@/g) || []).length
  if (atCount > 1) {
    const firstAtIndex = sanitized.indexOf('@')
    sanitized = sanitized.substring(0, firstAtIndex + 1) + sanitized.substring(firstAtIndex + 1).replace(/@/g, '')
  }

  // Clean domain part: between @ and . should only contain letters
  // and after . should only contain letters
  if (sanitized.includes('@')) {
    const atPos = sanitized.indexOf('@')
    const localPart = sanitized.substring(0, atPos + 1) // Everything up to and including @
    const domainPart = sanitized.substring(atPos + 1) // Everything after @
    
    if (domainPart.includes('.')) {
      const dotPos = domainPart.indexOf('.')
      const domainName = domainPart.substring(0, dotPos) // Between @ and .
      const tld = domainPart.substring(dotPos + 1) // After .
      
      // Clean domain name: only letters allowed
      const cleanDomainName = domainName.replace(/[^a-zA-Z]/g, '')
      
      // Clean TLD: only letters allowed
      const cleanTld = tld.replace(/[^a-zA-Z]/g, '')
      
      // Ensure minimum 2 characters between @ and .
      if (cleanDomainName.length < 2) {
        // If domain has less than 2 characters, remove the dot and everything after it
        sanitized = localPart + cleanDomainName
      } else {
        // Reconstruct email with clean parts
        sanitized = localPart + cleanDomainName + '.' + cleanTld
      }
    } else {
      // No dot yet, clean domain part (only letters allowed)
      const cleanDomainName = domainPart.replace(/[^a-zA-Z]/g, '')
      sanitized = localPart + cleanDomainName
    }
  }

  return sanitized
}

/**
 * Higher-order function that creates an onChange handler with email validation
 * @param setValue - The state setter function
 * @param onError - Optional callback for handling validation errors
 * @returns onChange handler function
 */
export function createEmailInputHandler(
  setValue: (value: string) => void,
  onError?: (error: string | null) => void
) {
  return (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value
    
    // Sanitize the input as the user types
    const sanitized = sanitizeEmail(inputValue)
    
    // Only update if the sanitized value is different (prevents cursor jumping)
    if (sanitized !== inputValue) {
      setValue(sanitized)
    } else {
      setValue(inputValue)
    }
    
    // Validate the sanitized value
    const validation = validateEmail(sanitized)
    if (onError) {
      onError(validation.isValid ? null : validation.error)
    }
  }
}
