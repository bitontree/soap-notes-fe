"use client"

import { useState, useEffect } from "react"
import { Header } from "@/components/layout/header"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useToast } from "@/hooks/use-toast"
import { useAuth } from "@/contexts/auth-context"
import { authApi } from "@/lib/api"
import { User, Save } from "lucide-react"  

export default function SettingsPage() {
  const [settings, setSettings] = useState({
    name: "Dr. John Smith",
    email: "john.smith@hospital.com",
    phone: "+1 (555) 123-4567",
    specialty: "Internal Medicine",
    emailNotifications: true,
    pushNotifications: false,
    weeklyReports: true,
    dataRetention: "7years",
    shareAnalytics: false,
    theme: "light",
    language: "en",
    timezone: "America/New_York",
    autoSave: true,
  })

  const { toast } = useToast()
  const { user } = useAuth()

  useEffect(() => {
    if (user) {
      setSettings((prev) => ({
        ...prev,
        name: user.firstname + " " + user.lastname,
        email: user.email,
      }))
    }
  }, [user])

  const handleSave = async () => {
    try {
      const [firstname, lastname] = settings.name.split(" ")
      await authApi.updateProfile({
        firstname: firstname || "",
        lastname: lastname || "",
        email: settings.email,
        phone: settings.phone,
        specialty: settings.specialty,
      })

      toast({
        title: "Settings Saved",
        description: "Your profile has been updated successfully",
      })
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Unable to save settings",
        variant: "destructive",
      })
    }
  }

  return (
    <div>
      <Header title="Settings" description="Manage your account preferences and application settings" />

      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <Tabs defaultValue="profile" className="w-full">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="profile">Profile</TabsTrigger>
            <TabsTrigger value="notifications">Notifications</TabsTrigger>
            <TabsTrigger value="privacy">Privacy</TabsTrigger>
            <TabsTrigger value="preferences">Preferences</TabsTrigger>
            <TabsTrigger value="data">Data</TabsTrigger>
          </TabsList>

          <TabsContent value="profile" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Profile Information
                </CardTitle>
                <CardDescription>Update your personal and professional information</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Full Name</Label>
                    <Input id="name" value={settings.name} onChange={(e) => setSettings({ ...settings, name: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email Address</Label>
                    <Input id="email" type="email" value={settings.email} onChange={(e) => setSettings({ ...settings, email: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone Number</Label>
                    <Input id="phone" value={settings.phone} onChange={(e) => setSettings({ ...settings, phone: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="specialty">Medical Specialty</Label>
                    <Select value={settings.specialty} onValueChange={(val) => setSettings({ ...settings, specialty: val })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Internal Medicine">Internal Medicine</SelectItem>
                        <SelectItem value="Family Medicine">Family Medicine</SelectItem>
                        <SelectItem value="Cardiology">Cardiology</SelectItem>
                        <SelectItem value="Neurology">Neurology</SelectItem>
                        <SelectItem value="Pediatrics">Pediatrics</SelectItem>
                        <SelectItem value="Emergency Medicine">Emergency Medicine</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          
        </Tabs>

        <div className="flex justify-end">
          <Button onClick={handleSave} size="lg">
            <Save className="mr-2 h-5 w-5" />
            Save Changes
          </Button>
        </div>
      </div>
    </div>
  )
}
