"use client"

import type React from "react"

import { createContext, useContext, useEffect, useState } from "react"
import { useRouter } from "next/navigation"

interface User {
  id: string
  email: string
  name: string
}

interface AuthContextType {
  user: User | null
  login: (email: string, password: string) => Promise<void>
  signup: (name: string, email: string, password: string) => Promise<void>
  logout: () => void
  isLoading: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
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
    setIsLoading(false)
  }, [])

  const login = async (email: string, password: string) => {
    setIsLoading(true)
    try {
      // Mock API delay
      await new Promise((resolve) => setTimeout(resolve, 1500))

      // Mock validation - accept any email/password combination
      if (email && password) {
        const mockUser = {
          id: "user_123",
          email: email,
          name: email.includes("dr.")
            ? `Dr. ${email.split("@")[0].replace("dr.", "").replace(".", " ")}`
            : `Dr. ${email.split("@")[0]}`,
        }

        const mockToken = `mock_jwt_token_${Date.now()}`
        localStorage.setItem("token", mockToken)
        localStorage.setItem("user", JSON.stringify(mockUser))

        setUser(mockUser)
        router.push("/dashboard")
      } else {
        throw new Error("Email and password are required")
      }
    } catch (error) {
      throw new Error("Invalid email or password")
    } finally {
      setIsLoading(false)
    }
  }

  const signup = async (name: string, email: string, password: string) => {
    setIsLoading(true)
    try {
      // Mock API delay
      await new Promise((resolve) => setTimeout(resolve, 2000))

      // Mock validation
      if (name && email && password) {
        const mockUser = {
          id: `user_${Date.now()}`,
          email: email,
          name: name,
        }

        const mockToken = `mock_jwt_token_${Date.now()}`
        localStorage.setItem("token", mockToken)
        localStorage.setItem("user", JSON.stringify(mockUser))

        setUser(mockUser)
        router.push("/dashboard")
      } else {
        throw new Error("All fields are required")
      }
    } catch (error) {
      throw new Error("Unable to create account")
    } finally {
      setIsLoading(false)
    }
  }

  const logout = () => {
    localStorage.removeItem("token")
    localStorage.removeItem("user")
    setUser(null)
    router.push("/login")
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
