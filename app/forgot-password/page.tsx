"use client"

import type React from "react"
import { useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Stethoscope, Loader2, ArrowLeft, CheckCircle, Shield } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { useEmailValidation } from "@/hooks/use-email-validation"
import { authApi } from "@/lib/api"

export default function ForgotPasswordPage() {
  const emailValidation = useEmailValidation("")
  const [isLoading, setIsLoading] = useState(false)
  const [isEmailSent, setIsEmailSent] = useState(false)
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
    
    setIsLoading(true)

    try {
      await authApi.forgotPassword(emailValidation.value)
      
      setIsEmailSent(true)
      toast({
        title: "Email Sent",
        description: "If the email exists, a password reset link has been sent.",
      })
    } catch (error: any) {
      console.error('Forgot password error:', error)
      toast({
        title: "Error",
        description: error.message || "Failed to send reset email. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  if (isEmailSent) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8 bg-slate-50">
        <div className="w-full max-w-md">
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
              <div className="flex justify-center mb-4">
                <div className="p-3 bg-emerald-100 rounded-full">
                  <CheckCircle className="h-8 w-8 text-emerald-600" />
                </div>
              </div>
              <CardTitle className="text-2xl font-semibold text-slate-800">Check Your Email</CardTitle>
              <CardDescription className="text-slate-500">
                We've sent a password reset link to {emailValidation.value}
              </CardDescription>
            </CardHeader>
            <CardContent className="px-8 pb-8 text-center">
              <p className="text-sm text-slate-600 mb-6">
                Click the link in the email to reset your password. The link will expire in 1 minutes.
              </p>
              <div className="space-y-3">
                <Button asChild className="w-full h-11 bg-blue-900 hover:bg-blue-800 text-white font-medium rounded-lg transition-colors">
                  <Link href="/login">
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back to Login
                  </Link>
                </Button>
                <Button 
                  variant="outline" 
                  className="w-full h-11 rounded-lg border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors"
                  onClick={() => {
                    setIsEmailSent(false)
                    emailValidation.reset()
                  }}
                >
                  Send Another Email
                </Button>
              </div>
            </CardContent>
          </Card>

          <p className="text-center text-xs text-slate-500 mt-6 flex items-center justify-center gap-1.5">
            <Shield className="h-3.5 w-3.5 text-emerald-600"/>
            Protected by HIPAA-compliant security
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-8 bg-slate-50">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-8">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-900 rounded-xl">
              <Stethoscope className="h-6 w-6 text-white"/>
            </div>
            <span className="text-xl font-semibold text-blue-900">SOAP Notes</span>
          </div>
        </div>

        <Card className="border border-slate-200 shadow-sm bg-white">
          <CardHeader className="text-center pb-4">
            <CardTitle className="text-2xl font-semibold text-slate-800">Forgot Password</CardTitle>
            <CardDescription className="text-slate-500">
              Enter your email address and we'll send you a link to reset your password
            </CardDescription>
          </CardHeader>
          <CardContent className="px-8 pb-8">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-medium text-slate-600">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="doctor@hospital.com"
                  value={emailValidation.value}
                  onChange={emailValidation.handleChange}
                  className={`h-11 rounded-lg bg-slate-50 border-slate-200 focus:bg-white focus:border-blue-400 focus:ring-1 focus:ring-blue-400 transition-all ${emailValidation.error ? "border-red-400 focus:border-red-400 focus:ring-red-400" : ""}`}
                  required
                />
                {emailValidation.error && (
                  <p className="text-xs text-red-500">{emailValidation.error}</p>
                )}
              </div>
              <Button type="submit" className="w-full h-11 bg-blue-900 hover:bg-blue-800 text-white font-medium rounded-lg transition-colors" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  "Send Reset Link"
                )}
              </Button>
            </form>

            <div className="mt-6 pt-6 border-t border-slate-100 text-center">
              <Link href="/login" className="text-sm text-blue-600 hover:text-blue-700 font-medium inline-flex items-center">
                <ArrowLeft className="mr-1 h-3 w-3" />
                Back to Login
              </Link>
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-slate-500 mt-6 flex items-center justify-center gap-1.5">
          <Shield className="h-3.5 w-3.5 text-emerald-600" />
          Protected by HIPAA-compliant security
        </p>
      </div>
    </div>
  )
} 