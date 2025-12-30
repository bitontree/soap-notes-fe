"use client"

import type React from "react"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useAuth } from "@/contexts/auth-context"
import { Stethoscope, Loader2, Eye, EyeOff } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { useNameValidation } from "@/hooks/use-name-validation"
import { useEmailValidation } from "@/hooks/use-email-validation"

export default function SignupPage() {
  const firstNameValidation = useNameValidation("", { fieldName: "First Name" })
  const lastNameValidation = useNameValidation("", { fieldName: "Last Name" })
  const emailValidation = useEmailValidation("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const { signup, isLoading } = useAuth()
  const { toast } = useToast()

  // Clear any browser auto-filled values on component mount
  useEffect(() => {
    // Function to clear form fields
    const clearFormFields = () => {
      // Clear state values
      setPassword("")
      setConfirmPassword("")
      
      // Reset validations
      firstNameValidation.reset()
      lastNameValidation.reset()
      emailValidation.reset()
      
      // Also clear any values that might be in the DOM directly
      const emailInput = document.getElementById('email') as HTMLInputElement
      const passwordInput = document.getElementById('password') as HTMLInputElement
      const confirmPasswordInput = document.getElementById('confirmPassword') as HTMLInputElement
      const firstNameInput = document.getElementById('firstname') as HTMLInputElement
      const lastNameInput = document.getElementById('lastname') as HTMLInputElement
      
      if (emailInput) emailInput.value = ""
      if (passwordInput) passwordInput.value = ""
      if (confirmPasswordInput) confirmPasswordInput.value = ""
      if (firstNameInput) firstNameInput.value = ""
      if (lastNameInput) lastNameInput.value = ""
    }

    // Clear immediately
    clearFormFields()
    
    // Also clear after a small delay to catch any delayed auto-fill
    const timer = setTimeout(clearFormFields, 100)
    
    // Clear again after page is fully loaded
    const timer2 = setTimeout(clearFormFields, 500)

    return () => {
      clearTimeout(timer)
      clearTimeout(timer2)
    }
  }, []) // Empty dependency array to run only once on mount

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Smart validation: Only check for business rules that sanitization can't fix
    const isFirstNameValid = firstNameValidation.validate()
    const isLastNameValid = lastNameValidation.validate()
    const isEmailValid = emailValidation.validate()

    // Only show toast for empty fields or length issues (not format issues)
    if (!isFirstNameValid || !isLastNameValid) {
      const firstError = firstNameValidation.error
      const lastError = lastNameValidation.error
      
      // Only show toast for business rule violations (empty, too long)
      if (firstError?.includes('required') || firstError?.includes('must be') ||
          lastError?.includes('required') || lastError?.includes('must be')) {
        toast({
          title: "Name Required",
          description: "Please enter both first and last names",
          variant: "destructive",
        })
        return
      }
    }

    if (!isEmailValid) {
      const emailError = emailValidation.error
      // Only show toast for business rule violations (empty, structure issues after sanitization)
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

    // Password validation
    if (password.length < 6) {
      toast({
        title: "Password Too Short",
        description: "Password must be at least 6 characters long",
        variant: "destructive",
      })
      return
    }

    if (password !== confirmPassword) {
      toast({
        title: "Password Mismatch",
        description: "Password and confirm password does not match",
        variant: "destructive",
      })
      return
    }

    try {
      await signup(firstNameValidation.value, lastNameValidation.value, emailValidation.value, password)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Signup failed"
      
      // Determine the appropriate toast message based on the error
      if (errorMessage.toLowerCase().includes("email") || errorMessage.toLowerCase().includes("mail")) {
        toast({
          title: "Email Already Exists",
          description: "An account with this email already exists. Please use a different email or try logging in.",
          variant: "destructive",
        })
      } else if (errorMessage.toLowerCase().includes("password")) {
        toast({
          title: "Password Error",
          description: errorMessage,
          variant: "destructive",
        })
      } else {
        toast({
          title: "Signup Failed",
          description: errorMessage,
          variant: "destructive",
        })
      }
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-lg shadow-sm border border-gray-200 rounded-xl">
        <CardHeader className="text-center pb-2">
          <div className="flex justify-center mb-2">
            <div className="p-2 bg-emerald-100 rounded-full">
              <Stethoscope className="h-6 w-6 text-emerald-600" />
            </div>
          </div>
          <CardTitle className="text-xl font-bold text-gray-900">Create Account</CardTitle>
          <CardDescription className="text-sm">Join SOAP Medical Notes today</CardDescription>
        </CardHeader>
        <CardContent className="pt-2">
          <form onSubmit={handleSubmit} className="space-y-3" autoComplete="off" data-form-type="signup">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="firstname" className="text-sm">First Name <span className="text-red-500">*</span></Label>
                <Input
                  id="firstname"
                  name="firstname"
                  type="text"
                  placeholder="John"
                  value={firstNameValidation.value}
                  onChange={firstNameValidation.handleChange}
                  onBlur={firstNameValidation.handleBlur}
                  className={`h-9 ${firstNameValidation.displayError ? "border-red-500" : ""}`}
                  autoComplete="given-name"
                  required
                />
                {firstNameValidation.displayError && (
                  <p className="text-xs text-red-500">{firstNameValidation.displayError}</p>
                )}
              </div>
              <div className="space-y-1">
                <Label htmlFor="lastname" className="text-sm">Last Name <span className="text-red-500">*</span></Label>
                <Input
                  id="lastname"
                  name="lastname"
                  type="text"
                  placeholder="Smith"
                  value={lastNameValidation.value}
                  onChange={lastNameValidation.handleChange}
                  onBlur={lastNameValidation.handleBlur}
                  className={`h-9 ${lastNameValidation.displayError ? "border-red-500" : ""}`}
                  autoComplete="family-name"
                  required
                />
                {lastNameValidation.displayError && (
                  <p className="text-xs text-red-500">{lastNameValidation.displayError}</p>
                )}
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="email" className="text-sm">Email <span className="text-red-500">*</span></Label>
              <Input
                id="email"
                name="signup-email"
                type="email"
                placeholder="doctor@hospital.com"
                value={emailValidation.value}
                onChange={emailValidation.handleChange}
                autoComplete="new-email"
                className={`h-9 ${emailValidation.error ? "border-red-500" : ""}`}
                required
              />
              {emailValidation.error && (
                <p className="text-xs text-red-500">{emailValidation.error}</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="password" className="text-sm">Password <span className="text-red-500">*</span></Label>
                <div className="relative">
                  <Input
                    id="password"
                    name="signup-password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    className={`h-9 pr-10 ${password.length > 0 && password.length < 6 ? "border-red-500" : ""}`}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                  </button>
                </div>
                {password.length > 0 && password.length < 6 && (
                  <p className="text-xs text-red-500">Min 6 characters</p>
                )}
              </div>
              <div className="space-y-1">
                <Label htmlFor="confirmPassword" className="text-sm">Confirm Password <span className="text-red-500">*</span></Label>
                <div className="relative">
                  <Input
                    id="confirmPassword"
                    name="signup-confirm-password"
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                    className={`h-9 pr-10 ${confirmPassword.length > 0 && password !== confirmPassword ? "border-red-500" : ""}`}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600"
                  >
                    {showConfirmPassword ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                  </button>
                </div>
                {confirmPassword.length > 0 && password !== confirmPassword && (
                  <p className="text-xs text-red-500">Passwords don't match</p>
                )}
              </div>
            </div>
            <p className="text-xs text-gray-500">Password must be at least 6 characters long</p>
            <Button type="submit" className="w-full h-9" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating account...
                </>
              ) : (
                "Create Account"
              )}
            </Button>
          </form>

          <div className="mt-4 text-center">
            <p className="text-sm text-gray-600">
              Already have an account?{" "}
              <Link href="/login" className="text-emerald-600 hover:underline">
                Sign in
              </Link>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
