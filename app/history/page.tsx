"use client"

import { useState } from "react"
import { Header } from "@/components/layout/header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Search, Filter, Calendar, FileText, Eye, Download, MoreHorizontal } from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

const mockNotes = [
  {
    id: "1",
    patient: "John Doe",
    patientId: "P001",
    date: "2024-01-15",
    time: "10:30 AM",
    type: "Follow-up",
    status: "completed",
    duration: "15:30",
    chief_complaint: "Persistent headaches",
  },
  {
    id: "2",
    patient: "Jane Smith",
    patientId: "P002",
    date: "2024-01-15",
    time: "09:15 AM",
    type: "Initial Consultation",
    status: "completed",
    duration: "22:45",
    chief_complaint: "Chest pain evaluation",
  },
  {
    id: "3",
    patient: "Robert Johnson",
    patientId: "P003",
    date: "2024-01-14",
    time: "03:45 PM",
    type: "Annual Checkup",
    status: "completed",
    duration: "18:20",
    chief_complaint: "Routine physical examination",
  },
  {
    id: "4",
    patient: "Mary Wilson",
    patientId: "P004",
    date: "2024-01-14",
    time: "02:30 PM",
    type: "Follow-up",
    status: "completed",
    duration: "12:15",
    chief_complaint: "Diabetes management",
  },
  {
    id: "5",
    patient: "David Brown",
    patientId: "P005",
    date: "2024-01-13",
    time: "11:00 AM",
    type: "Urgent Care",
    status: "completed",
    duration: "25:10",
    chief_complaint: "Acute abdominal pain",
  },
]

export default function HistoryPage() {
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [typeFilter, setTypeFilter] = useState("all")

  const filteredNotes = mockNotes.filter((note) => {
    const matchesSearch =
      note.patient.toLowerCase().includes(searchTerm.toLowerCase()) ||
      note.patientId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      note.chief_complaint.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesStatus = statusFilter === "all" || note.status === statusFilter
    const matchesType = typeFilter === "all" || note.type === typeFilter

    return matchesSearch && matchesStatus && matchesType
  })

  return (
    <div>
      <Header title="SOAP Notes History" description="View and manage all your medical documentation" />

      <div className="p-6 space-y-6">
        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="h-5 w-5" />
              Filters & Search
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Search by patient name, ID, or complaint..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full md:w-48">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="processing">Processing</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                </SelectContent>
              </Select>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-full md:w-48">
                  <SelectValue placeholder="Filter by type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="Initial Consultation">Initial Consultation</SelectItem>
                  <SelectItem value="Follow-up">Follow-up</SelectItem>
                  <SelectItem value="Annual Checkup">Annual Checkup</SelectItem>
                  <SelectItem value="Urgent Care">Urgent Care</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Results Summary */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-600">
            Showing {filteredNotes.length} of {mockNotes.length} SOAP notes
          </p>
          <Button variant="outline" size="sm">
            <Download className="mr-2 h-4 w-4" />
            Export All
          </Button>
        </div>

        {/* Notes List */}
        <div className="space-y-4">
          {filteredNotes.map((note) => (
            <Card key={note.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1 space-y-3">
                    <div className="flex items-center gap-3">
                      <h3 className="text-lg font-semibold text-gray-900">{note.patient}</h3>
                      <Badge variant="outline" className="text-xs">
                        {note.patientId}
                      </Badge>
                      <Badge variant={note.status === "completed" ? "default" : "secondary"} className="text-xs">
                        {note.status}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {note.type}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-gray-600">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4" />
                        {note.date} at {note.time}
                      </div>
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4" />
                        Duration: {note.duration}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">Chief Complaint:</span>
                        {note.chief_complaint}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm">
                      <Eye className="mr-2 h-4 w-4" />
                      View
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem>
                          <Download className="mr-2 h-4 w-4" />
                          Export PDF
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          <FileText className="mr-2 h-4 w-4" />
                          Edit Note
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-red-600">Delete</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {filteredNotes.length === 0 && (
          <Card>
            <CardContent className="text-center py-12">
              <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No SOAP notes found</h3>
              <p className="text-gray-600 mb-4">
                {searchTerm || statusFilter !== "all" || typeFilter !== "all"
                  ? "Try adjusting your search criteria or filters"
                  : "Start by generating your first SOAP note"}
              </p>
              <Button>
                <FileText className="mr-2 h-4 w-4" />
                Generate New Note
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
