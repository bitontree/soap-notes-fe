import axios from 'axios'

// API configuration and service functions
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000' // Adjust this to your backend URL

// Create axios instance with default config
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true, // For cookie support if needed
  timeout: 10000, // 10 second timeout
})

interface ApiResponse<T> {
  success: boolean
  data?: T
  message?: string
  token?: string
  user?: any
  api_key?: string
}

interface LoginData {
  email: string
  password: string
}

interface ForgotPasswordData {
  email: string
}

interface ResetPasswordData {
  token: string
  new_password: string
}

interface SignupData {
  firstname: string
  lastname: string
  email: string
  password: string
}

interface User {
  id: string
  email: string
  firstname: string
  lastname: string
}

interface SOAPNote {
  id: string
  user_id: string
  soap_data: {
    subjective: any  // Object in your backend
    objective: any   // Object in your backend
    assessment: string
    plan: any        // Object in your backend
  }
  summary: string
  transcript: string
  diarized_transcript: string
  s3_key: string
  created_at: string
}

interface SOAPNotesResponse {
  soap_notes: SOAPNote[]
  pagination: {
    page: number
    limit: number
    total: number
    total_pages: number
  }
}

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'ApiError'
  }
}

// Generic API request function using axios
async function apiRequest<T>(
  endpoint: string,
  options: {
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
    data?: any
    params?: any
    headers?: Record<string, string>
  } = {}
): Promise<ApiResponse<T>> {
  const { method = 'GET', data, params, headers = {} } = options

  try {
    const response = await apiClient.request({
      url: endpoint,
      method,
      data,
      params,
      headers,
    })

    console.log('🌐 Response status:', response.status)
    console.log('🌐 Response data:', response)

    // Handle both FastAPI direct response and wrapped response formats
    return {
      success: true,
      data: response.data.data || response.data, // Handle both { data: [...] } and direct [...]
      token: response.data.access_token,
      user: response.data.user,
      api_key: response.data.api_key
    }
  } catch (error: any) {
    // Axios v1+ does not have isAxiosError on the default import, so check manually
    if (error && error.response) {
      const status = error.response.status || 500
      const message = error.response.data?.detail ||
                      error.response.data?.message ||
                      error.message ||
                      'API request failed'
      
      console.error('❌ API Error:', status, message)
      throw new ApiError(status, message)
    }
    
    console.error('❌ Network Error:', error)
    throw new ApiError(500, 'Network error')
  }
}

// Helper function to get auth headers for authenticated requests
export function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem('token')
  console.log('🔑 Token from localStorage:', token ? 'Present' : 'Missing')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

// Helper function for SOAP notes that expects raw token
export function getSoapAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem('token')
  console.log('🔑 SOAP Token from localStorage:', token ? 'Present' : 'Missing')
  console.log('🔑 Full token:', token)
  return token ? { Authorization: `Bearer ${token}` } : {}  // Send Bearer format
}

// Authentication API functions
export const authApi = {
  async login(credentials: LoginData): Promise<{ token: string; user: User; api_key?: string }> {
    const response = await apiRequest<{ access_token: string; user: User; api_key?: string }>('/login', {
      method: 'POST',
      data: credentials,
    })

    return {
      token: response.token!,
      user: response.user!,
      api_key: response.api_key,
    }
  },

  async signup(userData: SignupData): Promise<{ token: string; user: User; api_key?: string }> {
    const response = await apiRequest<{ access_token: string; user: User; api_key?: string }>('/signup', {
      method: 'POST',
      data: userData,
    })

    return {
      token: response.token!,
      user: response.user!,
      api_key: response.api_key,
    }
  },

  async logout(): Promise<void> {
    const token = localStorage.getItem('token')
    if (!token) return

    try {
      await apiRequest('/logout', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
    } catch (error) {
      // Even if logout fails on server, we should still clear local storage
      console.warn('Logout API call failed:', error)
    }
  },

  async getCurrentUser(): Promise<User | null> {
    const token = localStorage.getItem('token')
    if (!token) return null

    try {
      const response = await apiRequest<User>('/me', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (!response.success) {
        throw new Error(response.message || 'Failed to get user data')
      }

      return response.data || null
    } catch (error) {
      // If token is invalid, clear it
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      return null
    }
  },

  async forgotPassword(email: string): Promise<{ message: string }> {
    const response = await apiRequest<{ message: string }>('/forgot-password', {
      method: 'POST',
      data: { email },
    })

    if (!response.success) {
      throw new Error(response.message || 'Failed to send reset email')
    }

    return { message: response.message || 'Reset email sent' }
  },

  async resetPassword(token: string, newPassword: string): Promise<{ message: string }> {
    const response = await apiRequest<{ message: string }>('/reset-password', {
      method: 'POST',
      data: { token, new_password: newPassword },
    })

    if (!response.success) {
      throw new Error(response.message || 'Failed to reset password')
    }

    return { message: response.message || 'Password reset successfully' }
  },
}

// SOAP Notes API functions
export const soapApi = {
  async getNotes(page: number = 1, limit: number = 10): Promise<SOAPNotesResponse> {
    const user = JSON.parse(localStorage.getItem('user') || '{}')
    const userId = user.id || user._id
    
    if (!userId) {
      throw new Error('User ID not found. Please login again.')
    }
    
    console.log('🔍 Making SOAP notes request with user_id:', userId)
    
    const response = await apiRequest<SOAPNotesResponse>('/soap-notes-history', {
      params: { page, limit, user_id: userId },
      headers: { 'Content-Type': 'application/json' }, // No auth headers needed
    })
    
    console.log('📄 SOAP notes response:', response)
    if (!response.success) {
      throw new Error(response.message || 'Failed to fetch SOAP notes')
    }

    return response.data!
  },

  async getNoteById(noteId: string): Promise<SOAPNote> {
    const user = JSON.parse(localStorage.getItem('user') || '{}')
    const userId = user.id || user._id
    
    if (!userId) {
      throw new Error('User ID not found. Please login again.')
    }
    
    const response = await apiRequest<SOAPNote>(`/soap/notes/${noteId}`, {
      params: { user_id: userId },
      headers: { 'Content-Type': 'application/json' },
    })

    if (!response.success) {
      throw new Error(response.message || 'Failed to fetch SOAP note')
    }

    return response.data!
  },

  async createNote(noteData: {
    patientId: string
    subjective: string
    objective: string
    assessment: string
    plan: string
  }): Promise<{ id: string; note: SOAPNote }> {
    const user = JSON.parse(localStorage.getItem('user') || '{}')
    const userId = user.id || user._id
    
    if (!userId) {
      throw new Error('User ID not found. Please login again.')
    }
    
    const noteDataWithUserId = { ...noteData, user_id: userId }
    
    const response = await apiRequest<{ id: string; note: SOAPNote }>('/soap/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      data: noteDataWithUserId,
    })

    if (!response.success) {
      throw new Error(response.message || 'Failed to create SOAP note')
    }

    return response.data!
  },

  async deleteNote(noteId: string): Promise<void> {
    const user = JSON.parse(localStorage.getItem('user') || '{}')
    const userId = user.id || user._id
    
    if (!userId) {
      throw new Error('User ID not found. Please login again.')
    }
    
    const response = await apiRequest(`/soap/notes/${noteId}`, {
      method: 'DELETE',
      params: { user_id: userId },
      headers: { 'Content-Type': 'application/json' },
    })

    if (!response.success) {
      throw new Error(response.message || 'Failed to delete SOAP note')
    }
  },
} 