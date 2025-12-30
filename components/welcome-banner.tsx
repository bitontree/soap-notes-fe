"use client"

import { useState, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { X, Sparkles } from "lucide-react"
import { useAuth } from "@/contexts/auth-context"

export function WelcomeBanner() {
  const [isVisible, setIsVisible] = useState(false)
  const { user } = useAuth()

  useEffect(() => {
    // Show welcome banner for new users (check if this is their first visit)
    const hasSeenWelcome = localStorage.getItem("hasSeenWelcome")
    if (!hasSeenWelcome && user) {
      setIsVisible(true)
    }
  }, [user])

  const handleDismiss = () => {
    setIsVisible(false)
    localStorage.setItem("hasSeenWelcome", "true")
  }

  if (!isVisible) return null

  return (
    <Card className="mb-6 bg-gradient-to-r from-emerald-50 to-teal-50 border-emerald-200">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-emerald-100 rounded-full">
              <Sparkles className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <h3 className="font-semibold text-emerald-900">Welcome to SOAP Medical Notes!</h3>
              <p className="text-sm text-emerald-700 mt-1">
                You're now using the demo version. Start by generating your first SOAP note from an audio recording or
                explore the EHR integration features.
              </p>
              <div className="flex gap-2 mt-3">
                <Button size="sm" className="bg-emerald-500 hover:bg-emerald-600">
                  Generate First Note
                </Button>
                <Button size="sm" variant="outline" className="bg-transparent border-emerald-300 text-emerald-700 hover:bg-emerald-50">
                  Take Tour
                </Button>
              </div>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDismiss}
            className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-100"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
