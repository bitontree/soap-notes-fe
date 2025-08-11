"use client"

import { useEffect, useState } from "react"
import { Header } from "@/components/layout/header"
import { WelcomeBanner } from "@/components/welcome-banner"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { FileText, Clock, TrendingUp, Users, Plus, Calendar, Activity } from "lucide-react"
import Link from "next/link"
import { soapApi } from "@/lib/api" 
import { useToast } from "@/hooks/use-toast"

const stats = [
  {
    title: "Total SOAP Notes",
    value: "247",
    change: "+12%",
    icon: FileText,
    color: "text-blue-600",
  },
  {
    title: "This Week",
    value: "18",
    change: "+5%",
    icon: Calendar,
    color: "text-green-600",
  },
  {
    title: "Avg. Processing Time",
    value: "2.3m",
    change: "-8%",
    icon: Clock,
    color: "text-orange-600",
  },
  {
    title: "Active Patients",
    value: "89",
    change: "+3%",
    icon: Users,
    color: "text-purple-600",
  },
]

export default function DashboardPage() {
  const [recentNotes, setRecentNotes] = useState<any[]>([])
  const { toast } = useToast()


  useEffect(() => {
    const fetchNotes = async () => {
      try {
        const data = await soapApi.getNotes(1, 3) // page=1, limit=3
        setRecentNotes(data.soap_notes || [])
      } catch (error: any) {
        toast({
          title: "Error loading recent notes",
          description: error.message || "Failed to fetch recent SOAP notes",
          variant: "destructive",
        })
      }
    }
    fetchNotes()
  }, [toast])

  return (
    <div>
      <Header title="Dashboard" description="Overview of your medical documentation activity" />
      <WelcomeBanner />

      <div className="p-6 space-y-6">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {stats.map((stat) => (
            <Card key={stat.title}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">{stat.title}</CardTitle>
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-gray-900">{stat.value}</div>
                <div className="flex items-center text-xs text-gray-600 mt-1">
                  <TrendingUp className="h-3 w-3 mr-1" />
                  {stat.change} from last month
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Plus className="h-5 w-5" />
                Quick Actions
              </CardTitle>
              <CardDescription>Start your medical documentation workflow</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Link href="/generate">
                <Button className="w-full justify-start gap-2">
                  <FileText className="h-4 w-4" />
                  Generate New SOAP Note
                </Button>
              </Link>
              <Link href="/ehr">
                <Button variant="outline" className="w-full justify-start gap-2 bg-transparent">
                  <Activity className="h-4 w-4" />
                  Import from EHR
                </Button>
              </Link>
              <Link href="/history">
                <Button variant="outline" className="w-full justify-start gap-2 bg-transparent">
                  <Clock className="h-4 w-4" />
                  View All Records
                </Button>
              </Link>
            </CardContent>
          </Card>

          {/* ✅ Recent Notes from API */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Recent SOAP Notes</CardTitle>
              <CardDescription>Your latest medical documentation</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {recentNotes.length > 0 ? (
                  recentNotes.map((note) => (
                    <div key={note.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h4 className="font-medium text-gray-900">{note.patient_name || "Unknown Patient"}</h4>
                          <Badge variant={note.status === "completed" ? "default" : "secondary"}>
                            {note.status || "unknown"}
                          </Badge>
                        </div>
                        <div className="text-sm text-gray-600 mt-1">
                          {note.type || "SOAP Note"} •{" "}
                          {note.created_at ? new Date(note.created_at).toLocaleDateString() : "Unknown date"}
                        </div>
                      </div>
                      <Button variant="ghost" size="sm">
                        View
                      </Button>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-gray-500">No recent notes available.</p>
                )}
              </div>
              <div className="mt-4 pt-4 border-t">
                <Link href="/history">
                  <Button variant="outline" className="w-full bg-transparent">
                    View All Notes
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
