import axios from 'axios'

// API base URL configuration
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

// Create axios instance with default config
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true, // cookie support if needed
  timeout: 10000, // 10 seconds timeout 
})

// Generic API response interface
interface ApiResponse<T> {
  success: boolean
  data?: T
  message?: string
  token?: string
  api_key?: string
  user?: any
}

// Interfaces
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

interface Patient {
  id: string
  firstname: string
  lastname: string
  age: number
  gender: string
  dob: string
  email?: string
  phone?: string
  address?: string
  created_at: string
}

interface CreatePatientData {
  firstname: string
  lastname: string
  age: number
  gender: string
  dob: string
  email?: string
  phone?: string
  address?: string
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
    subjective: any
    objective: any
    assessment: string
    plan: any
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

// Custom error class for API errors
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

  console.log(`🌐 Making ${method} request to: ${API_BASE_URL}${endpoint}`)
  console.log('🌐 Request data:', data)
  console.log('🌐 Request headers:', headers)

  try {
    const response = await apiClient.request({
      url: endpoint,
      method,
      data,
      params,
      headers,
    })

    console.log('🌐 Response status:', response.status)
    console.log('🌐 Response data:', response.data)

    return {
      success: true,
      data: response.data.data || response.data, // handle wrapped and direct responses
      token: response.data.access_token,
      api_key: response.data.api_key,
      user: response.data.user,
    }
  } catch (error: any) {
    console.error('❌ API Request failed:', {
      endpoint,
      method,
      baseURL: API_BASE_URL,
      error: error.message,
      code: error.code,
      status: error.response?.status,
      data: error.response?.data
    })

    if (error && error.response) {
      console.error('❌ API Error Data:', error.response.data)
      const status = error.response.status || 500
      const message =
        error.response.data?.detail ||
        error.response.data?.message ||
        error.message ||
        'API request failed'

      throw new ApiError(status, message)
    }

    // Handle timeout and connection errors more specifically
    if (error.code === 'ECONNABORTED') {
      throw new ApiError(408, `Request timeout - server at ${API_BASE_URL} is not responding. Please check if the backend server is running.`)
    }

    if (error.code === 'ERR_NETWORK') {
      throw new ApiError(503, `Cannot connect to server at ${API_BASE_URL}. Please check if the backend server is running.`)
    }

    console.error('❌ Network Error:', error)
    throw new ApiError(500, `Network error: ${error.message}`)
  }
}

// Helper to get access token auth headers
export function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem('token')
  console.log('🔑 Access Token from localStorage:', token ? 'Present' : 'Missing')
  return token ? { authorization: `Bearer ${token}` } : {}
}

// Helper to get API key auth headers
export function getApiKeyAuthHeaders(): Record<string, string> {
  const apiKey = localStorage.getItem('api_key')
  console.log('🔑 API Key from localStorage:', apiKey ? 'Present' : 'Missing')
  return apiKey ? { 'x-api-key': apiKey } : {}
}

// Authentication API functions
export const authApi = {
  async login(credentials: LoginData): Promise<{ token: string; api_key: string; user: User }> {
    const response = await apiRequest<{ access_token: string; api_key: string; user: User }>('/login', {
      method: 'POST',
      data: credentials,
    })

    if (!response.token || !response.api_key) {
      throw new Error('Login response missing tokens.')
    }

    // Save both tokens locally
    localStorage.setItem('token', response.token)
    localStorage.setItem('api_key', response.api_key)
    localStorage.setItem('user', JSON.stringify(response.user))

    return {
      token: response.token,
      api_key: response.api_key,
      user: response.user!,
    }
  },

  async signup(userData: SignupData): Promise<{ token: string; user: User; api_key?: string }> {
    const response = await apiRequest<{ access_token: string; user: User; api_key?: string }>('/signup', {
      method: 'POST',
      data: userData,
    })

    localStorage.setItem('token', response.token!)
    localStorage.setItem('user', JSON.stringify(response.user))

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
          authorization: `Bearer ${token}`,
        },
      })
    } catch (error) {
      console.warn('Logout API call failed:', error)
    } finally {
      localStorage.removeItem('token')
      localStorage.removeItem('api_key')
      localStorage.removeItem('user')
    }
  },

  async getCurrentUser(): Promise<User | null> {
    const token = localStorage.getItem('token')
    if (!token) return null

    try {
      const response = await apiRequest<User>('/me', {
        headers: {
          authorization: `Bearer ${token}`,
        },
      })

      if (!response.success) {
        throw new Error(response.message || 'Failed to get user data')
      }

      return response.data || null
    } catch (error) {
      // If token is invalid, clear storage
      localStorage.removeItem('token')
      localStorage.removeItem('api_key')
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

  async getPatients(): Promise<Patient[]> {
    const response = await apiRequest<Patient[]>('/patients', {
      headers: getAuthHeaders(),
    })

    if (!response.success) {
      throw new Error(response.message || 'Failed to fetch patients')
    }

    return response.data || []
  },

  async createPatient(patientData: CreatePatientData): Promise<Patient> {
    const response = await apiRequest<Patient>('/patients', {
      method: 'POST',
      data: patientData,
      headers: getAuthHeaders(),
    })

    if (!response.success) {
      throw new Error(response.message || 'Failed to create patient')
    }

    return response.data!
  }
}

// Interface for /generate-soap-note response result
export interface GenerateSoapNoteResponse {
  soap_data: {
    subjective: Record<string, any>
    objective: Record<string, any>
    assessment: string
    plan: any
  }
  user_id: string
  patient_id: string
  transcript?: string
  summary?: string
  speakers?: any[]
  diarized_transcript?: string
}



// SOAP Notes API functions, using both tokens where needed
export const soapApi = {
  async getNotes(page: number = 1, limit: number = 10): Promise<SOAPNotesResponse> {
    const user = JSON.parse(localStorage.getItem('user') || '{}')
    const userId = user.id || user._id

    if (!userId) {
      throw new Error('User ID not found. Please login again.')
    }

    console.log('🔍 Making SOAP notes request with user_id:', userId)

    const headers = {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
      ...getApiKeyAuthHeaders(),
    }

    const response = await apiRequest<SOAPNotesResponse>('/soap-notes-history', {
      params: { page, limit, user_id: userId },
      headers,
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

    const headers = {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
      ...getApiKeyAuthHeaders(),
    }

    const response = await apiRequest<SOAPNote>(`/soap/notes/${noteId}`, {
      params: { user_id: userId },
      headers,
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

    const headers = {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
      ...getApiKeyAuthHeaders(),
    }

    const response = await apiRequest<{ id: string; note: SOAPNote }>('/soap/notes', {
      method: 'POST',
      headers,
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

    const headers = {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
      ...getApiKeyAuthHeaders(),
    }

    const response = await apiRequest(`/soap/notes/${noteId}`, {
      method: 'DELETE',
      params: { user_id: userId },
      headers,
    })

    if (!response.success) {
      throw new Error(response.message || 'Failed to delete SOAP note')
    }
  },

  async generateSoapNote(
    formData: FormData,
    onUploadProgress?: (percent: number) => void
  ): Promise<GenerateSoapNoteResponse> {
    const authHeaders = getAuthHeaders()
    const apiKeyHeaders = getApiKeyAuthHeaders()

    if (!authHeaders.authorization || !apiKeyHeaders['x-api-key']) {
      throw new Error('Missing access token or API key. Please login again.')
    }

    try {
      const response = await axios.post(`${API_BASE_URL}/generate-soap-note`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          ...authHeaders,
          ...apiKeyHeaders,
        },
        onUploadProgress: (progressEvent: any) => {
          if (progressEvent.total && onUploadProgress) {
            const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total)
            onUploadProgress(percentCompleted)
          }
        },
        timeout: 60000, // 60 seconds
      } as any)

      // Defensive: check that response.data is an object and has a 'result' property
      if (response.data && typeof response.data === 'object' && 'result' in response.data) {
        return (response.data as { result: GenerateSoapNoteResponse }).result
      }

      throw new Error('Invalid response from server: missing result')
    } catch (error: any) {
      console.error('Error in generateSoapNote:', error)
      throw new Error(error.response?.data?.message || error.message || 'Failed to generate SOAP note')
    }
  },
}
