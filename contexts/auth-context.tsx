"use client"

import type React from "react"

import { createContext, useContext, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { authApi } from "@/lib/api"

interface User {
  id: string
  email: string
  firstname: string
  lastname: string
}

interface AuthContextType {
  user: User | null
  login: (email: string, password: string) => Promise<void>
  signup: (firstname: string, lastname: string, email: string, password: string) => Promise<void>
  logout: () => void
  isLoading: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    const initializeAuth = async () => {
      try {
        // Try to get current user from API
        const currentUser = await authApi.getCurrentUser()
        if (currentUser) {
          setUser(currentUser)
        } else {
          // Fallback to localStorage for backward compatibility
          const token = localStorage.getItem("token")
          const storedUser = localStorage.getItem("user")

          if (token && storedUser) {
            try {
              const userData = JSON.parse(storedUser)
              setUser(userData)
            } catch (error) {
              // Clear invalid data
              localStorage.removeItem("token")
              localStorage.removeItem("user")
            }
          }
        }
      } catch (error) {
        console.error("Auth initialization error:", error)
        // Clear any invalid tokens
        localStorage.removeItem("token")
        localStorage.removeItem("user")
      } finally {
        setIsLoading(false)
      }
    }

    initializeAuth()
  }, [])

  const login = async (email: string, password: string) => {
    setIsLoading(true)
    try {
      const { token, user: userData, api_key } = await authApi.login({ email, password })
      
      localStorage.setItem("token", token)
      localStorage.setItem("user", JSON.stringify(userData))
      if (api_key) {
        localStorage.setItem("api_key", api_key)
      }
      setUser(userData)
      router.push("/dashboard")
    } catch (error) {
      const message = error instanceof Error ? error.message : "Login failed"
      throw new Error(message)
    } finally {
      setIsLoading(false)
    }
  }

  const signup = async (firstname: string, lastname: string, email: string, password: string) => {
    setIsLoading(true)
    try {
      const { token, user: userData, api_key } = await authApi.signup({ firstname, lastname, email, password })
      
      localStorage.setItem("token", token)
      localStorage.setItem("user", JSON.stringify(userData))
      if (api_key) {
        localStorage.setItem("api_key", api_key)
      }
      setUser(userData)
      router.push("/login")
    } catch (error) {
      const message = error instanceof Error ? error.message : "Signup failed"
      throw new Error(message)
    } finally {
      setIsLoading(false)
    }
  }

  const logout = async () => {
    try {
      await authApi.logout()
    } catch (error) {
      console.warn("Logout API call failed:", error)
    } finally {
      localStorage.removeItem("token")
      localStorage.removeItem("user")
      setUser(null)
      router.push("/login")
    }
  }

  return <AuthContext.Provider value={{ user, login, signup, logout, isLoading }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}
