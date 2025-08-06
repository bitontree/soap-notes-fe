// API configuration and service functions
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000' // Adjust this to your backend URL

interface ApiResponse<T> {
  success: boolean
  data?: T
  message?: string
  token?: string
  user?: any
}

interface LoginData {
  email: string
  password: string
}

interface SignupData {
  name: string
  email: string
  password: string
}

interface User {
  id: string
  email: string
  name: string
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

async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const url = `${API_BASE_URL}${endpoint}`
  
  const config: RequestInit = {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    credentials: 'include',
    ...options,
  }

  try {
    const response = await fetch(url, config)
    const data = await response.json()

    if (!response.ok) {
      throw new ApiError(response.status, data.detail || data.message || 'API request failed')
    }

    // Handle both FastAPI direct response and wrapped response formats
    return {
      success: true,
      data: data.data || data, // Handle both { data: [...] } and direct [...]
      token: data.access_token,
      user: data.user
    }
  } catch (error) {
    if (error instanceof ApiError) {
      throw error
    }
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
  async login(credentials: LoginData): Promise<{ token: string; user: User }> {
    const response = await apiRequest<{ access_token: string; user: User }>('/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    })

    return {
      token: response.token!,
      user: response.user!,
    }
  },

  async signup(userData: SignupData): Promise<{ token: string; user: User }> {
    const response = await apiRequest<{ access_token: string; user: User }>('/signup', {
      method: 'POST',
      body: JSON.stringify(userData),
    })

    return {
      token: response.token!,
      user: response.user!,
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
}

// SOAP Notes API functions
export const soapApi = {
  async getNotes(page: number = 1, limit: number = 10): Promise<SOAPNotesResponse> {
    const user = JSON.parse(localStorage.getItem('user') || '{}')
    const userId = user.id || user._id
    
    if (!userId) {
      throw new Error('User ID not found. Please login again.')
    }
    
    const params = `?page=${page}&limit=${limit}&user_id=${userId}`
    console.log('🔍 Making SOAP notes request with user_id:', userId)
    
    const response = await apiRequest<SOAPNotesResponse>(`/soap-notes-history${params}`, {
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
    
    const response = await apiRequest<SOAPNote>(`/soap/notes/${noteId}?user_id=${userId}`, {
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
      body: JSON.stringify(noteDataWithUserId),
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
    
    const response = await apiRequest(`/soap/notes/${noteId}?user_id=${userId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
    })

    if (!response.success) {
      throw new Error(response.message || 'Failed to delete SOAP note')
    }
  },
} 