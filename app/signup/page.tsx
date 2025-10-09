"use client"

import type React from "react"

import { useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useAuth } from "@/contexts/auth-context"
import { Stethoscope, Loader2 } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { useNameValidation } from "@/hooks/use-name-validation"

export default function SignupPage() {
  const firstNameValidation = useNameValidation("", { fieldName: "First Name" })
  const lastNameValidation = useNameValidation("", { fieldName: "Last Name" })
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const { signup, isLoading } = useAuth()
  const { toast } = useToast()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Validate names
    const isFirstNameValid = firstNameValidation.validate()
    const isLastNameValid = lastNameValidation.validate()

    if (!isFirstNameValid || !isLastNameValid) {
      toast({
        title: "Invalid Name",
        description: "Please enter valid first and last names using only letters",
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
      await signup(firstNameValidation.value, lastNameValidation.value, email, password)
    } catch (error) {
      toast({
        title: "Signup Failed",
        description: "Mail already exists",
        variant: "destructive",
      })
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="p-3 bg-blue-100 rounded-full">
              <Stethoscope className="h-8 w-8 text-blue-600" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold text-gray-900">Create Account</CardTitle>
          <CardDescription>Join SOAP Medical Notes today</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstname">First Name</Label>
                <Input
                  id="firstname"
                  type="text"
                  placeholder="John"
                  value={firstNameValidation.value}
                  onChange={firstNameValidation.handleChange}
                  onBlur={firstNameValidation.handleBlur}
                  className={firstNameValidation.displayError ? "border-red-500" : ""}
                  required
                />
                {firstNameValidation.displayError && (
                  <p className="text-sm text-red-500">{firstNameValidation.displayError}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastname">Last Name</Label>
                <Input
                  id="lastname"
                  type="text"
                  placeholder="Smith"
                  value={lastNameValidation.value}
                  onChange={lastNameValidation.handleChange}
                  onBlur={lastNameValidation.handleBlur}
                  className={lastNameValidation.displayError ? "border-red-500" : ""}
                  required
                />
                {lastNameValidation.displayError && (
                  <p className="text-sm text-red-500">{lastNameValidation.displayError}</p>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="doctor@hospital.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={isLoading}>
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

          
          <div className="mt-6 text-center">
            <p className="text-sm text-gray-600">
              Already have an account?{" "}
              <Link href="/login" className="text-blue-600 hover:underline">
                Sign in
              </Link>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
