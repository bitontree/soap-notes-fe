"use client"

import type React from "react"

import { useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useAuth } from "@/contexts/auth-context"
import { Stethoscope, Loader2, Eye, EyeOff, Shield } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { useEmailValidation } from "@/hooks/use-email-validation"

export default function LoginPage() {
  const emailValidation = useEmailValidation("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const { login, isLoading } = useAuth()
  const { toast } = useToast()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Smart validation: Only check for business rules that sanitization can't fix
    const isEmailValid = emailValidation.validate()
    
    if (!isEmailValid) {
      const emailError = emailValidation.error
      // Only show toast for business rule violations (empty, incomplete structure)
      if (emailError?.includes('required') || emailError?.includes('must contain') || 
          emailError?.includes('must have')) {
        toast({
          title: "Email Required",
          description: "Please enter a complete email address",
          variant: "destructive",
        })
        return
      }
    }
    
    try {
      await login(emailValidation.value, password)
    } catch (error) {
      toast({
        title: "Login Failed",
        description: error instanceof Error ? error.message : "Please check your credentials and try again.",
        variant: "destructive",
      })
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-8 bg-slate-50">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-900 rounded-xl">
              <Stethoscope className="h-6 w-6 text-white" />
            </div>
            <span className="text-xl font-semibold text-blue-900">SOAP Notes</span>
          </div>
        </div>

        <Card className="border border-slate-200 shadow-sm bg-white">
          <CardHeader className="text-center pb-4">
            <CardTitle className="text-2xl font-semibold text-slate-800">Welcome</CardTitle>
            <CardDescription className="text-slate-500">Sign in to your account</CardDescription>
          </CardHeader>
          <CardContent className="px-8 pb-8">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-medium text-slate-600">Email</Label>
                <Input
                  id="email"
                  name="login-email"
                  type="email"
                  placeholder="doctor@hospital.com"
                  value={emailValidation.value}
                  onChange={emailValidation.handleChange}
                  autoComplete="email"
                  className={`h-11 rounded-lg bg-slate-50 border-slate-200 focus:bg-white focus:border-blue-400 focus:ring-1 focus:ring-blue-400 transition-all ${emailValidation.error ? "border-red-400 focus:border-red-400 focus:ring-red-400" : ""}`}
                  required
                />
                {emailValidation.error && (
                  <p className="text-xs text-red-500">{emailValidation.error}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-medium text-slate-600">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    name="login-password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    className="h-11 rounded-lg bg-slate-50 border-slate-200 focus:bg-white focus:border-blue-400 focus:ring-1 focus:ring-blue-400 pr-11 transition-all"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    {showPassword ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <Button type="submit" className="w-full h-11 bg-blue-900 hover:bg-blue-900 text-white font-medium rounded-lg transition-colors" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  "Sign In"
                )}
              </Button>
            </form>

            <div className="mt-6 pt-6 border-t border-slate-100 text-center space-y-3">
              <p className="text-sm text-slate-600">
                {"Don't have an account? "}
                <Link href="/signup" className="text-blue-600 hover:text-blue-700 font-medium">
                  Sign up
                </Link>
              </p>
              <Link href="/forgot-password" className="text-sm text-blue-600 hover:text-blue-700 block font-medium">
                Forgot your password?
              </Link>
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-black-500 mt-6 flex items-center justify-center gap-1.5">
          <Shield className="h-3.5 w-3.5 text-emerald-600" />
          Protected by HIPAA-compliant security
        </p>
      </div>
    </div>
  )
}
