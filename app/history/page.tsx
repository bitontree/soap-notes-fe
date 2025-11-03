"use client"

import { useState, useEffect } from "react"
import { Header } from "@/components/layout/header"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Search, Filter, Calendar, FileText, Eye, Download, MoreHorizontal, Loader2, CheckCircle, Copy, User, Stethoscope, ClipboardList, Target, X } from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { soapApi } from "@/lib/api"
import { useToast } from "@/hooks/use-toast"
import { useAuth } from "@/contexts/auth-context"
import { exportSOAPNoteToPDF } from "@/lib/pdf-export"
import { DatePicker } from '@/components/ui/date-picker'

interface SOAPNote {
  id: string
  user_id: string
  patient_name?: string  // Patient name from backend
  soap_data: {
    subjective: any  // Object in your backend
    objective: any   // Object in your backend
    assessment: string
    plan: any        // Object in your backend
    patient_id?: string  // Optional patient ID field
  }
  summary: string
  transcript: string
  diarized_transcript: string
  s3_key: string
  created_at: string
}


export default function HistoryPage() {
  const [notes, setNotes] = useState<SOAPNote[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [dateFilter, setDateFilter] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState("all")
  const [typeFilter, setTypeFilter] = useState("all")
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalNotes, setTotalNotes] = useState(0)
  const [selectedNote, setSelectedNote] = useState<SOAPNote | null>(null)
  const [isViewModalOpen, setIsViewModalOpen] = useState(false)
  const [isExportingPDF, setIsExportingPDF] = useState(false)
  const { toast } = useToast()
  const { user } = useAuth()

  // Fetch SOAP notes from API
  useEffect(() => {
    if (user) {
      console.log('👤 User is authenticated:', user.email)
      loadNotes()
    } else {
      console.log('❌ User is not authenticated')
      setIsLoading(false)
    }
  }, [currentPage, user])

  const loadNotes = async () => {
    try {
      setIsLoading(true)
  const response = await soapApi.getNotes({ page: currentPage, limit: 10 })
      setNotes(response.soap_notes)
      setTotalPages(response.pagination.total_pages)
      setTotalNotes(response.pagination.total)
    } catch (error) {
      console.error('Failed to load SOAP notes:', error)
      toast({
        title: "Error",
        description: "Failed to load SOAP notes. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  // Debounced server-side search: when user types a name or date, call backend with filter_flag
  useEffect(() => {
    const term = searchTerm.trim()
    const date = (dateFilter || "").trim()
    const timer = setTimeout(async () => {
      // If both empty, reload normal list for current page
      if (!term && !date) {
        await loadNotes()
        return
      }

      try {
        setIsLoading(true)
        // Use backend filtering: send patient_name/date and set filter_flag=true so backend ignores patient_id
        const resp = await soapApi.getNotes({ patientName: term || undefined, date: date || undefined, filter_flag: true, page: 1, limit: 50 })
        setNotes(resp.soap_notes)
        setTotalPages(resp.pagination.total_pages)
        setTotalNotes(resp.pagination.total)
        setCurrentPage(1)
      } catch (error) {
        console.error('Failed to search SOAP notes:', error)
        toast({ title: 'Error', description: 'Failed to search SOAP notes. Please try again.', variant: 'destructive' })
      } finally {
        setIsLoading(false)
      }
    }, 400)

    return () => clearTimeout(timer)
  }, [searchTerm, dateFilter, user])

  // Filter notes based on search and filters
  const filteredNotes = notes.filter((note) => {
    const matchesSearch =
      note.summary.toLowerCase().includes(searchTerm.toLowerCase()) ||
      note.transcript.toLowerCase().includes(searchTerm.toLowerCase()) ||
      note.soap_data.assessment.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (typeof note.soap_data.subjective === 'string' ? note.soap_data.subjective.toLowerCase().includes(searchTerm.toLowerCase()) : true)
    
    // For now, all notes are considered "completed" since we don't have status in API
    const matchesStatus = statusFilter === "all" || statusFilter === "completed"
    
    // Type filter can be based on assessment content
    const matchesType = typeFilter === "all" || 
      note.soap_data.assessment.toLowerCase().includes(typeFilter.toLowerCase())

    return matchesSearch && matchesStatus && matchesType
  })

  // Helper function to safely extract string from object
  const extractText = (data: any, maxLength: number = 100): string => {
    if (typeof data === 'string') {
      return data
    }
    if (typeof data === 'object' && data !== null) {
      // Try to extract meaningful text from object
      const textValues = Object.values(data).filter(v => typeof v === 'string').join(' ')
      return textValues || 'No text content'
    }
    return 'No content'
  }

  // Helper function to format SOAP data like generate page
  const formatSubjective = (subjective: any): string => {
    if (!subjective) return ""
    if (typeof subjective === 'string') return subjective
    return Object.values(subjective)
      .filter(Boolean)
      .join("\n\n")
  }

  const formatObjective = (objective: any): string => {
    if (!objective) return ""
    if (typeof objective === 'string') return objective
    return Object.values(objective)
      .filter(Boolean)
      .join("\n\n")
  }

  const formatPlan = (plan: any): string => {
    if (!plan) return ""
    if (typeof plan === 'string') return plan
    if (typeof plan === 'object' && plan.recommendations) {
      const recs = plan.recommendations
        ? plan.recommendations.map((r: string, i: number) => `${i + 1}. ${r}`).join("\n")
        : ""
      return `Recommendations:\n${recs}\n\nFollow-up: ${plan.follow_up || ""}`
    }
    return Object.values(plan).filter(Boolean).join("\n\n")
  }

  // Format date for display
  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    })
  }

  // Format time for display
  const formatTime = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  // Calculate duration (placeholder - you might want to add duration field to your API)
  const getDuration = () => {
    return "15:30" // Placeholder - you can add duration field to your SOAP note model
  }

  const handleDeleteNote = async (noteId: string) => {
    try {
      await soapApi.deleteNote(noteId)
      setNotes(notes.filter(note => note.id !== noteId))
      toast({
        title: "Success",
        description: "SOAP note deleted successfully",
      })
    } catch (error) {
      console.error('Failed to delete SOAP note:', error)
      toast({
        title: "Error",
        description: "Failed to delete SOAP note. Please try again.",
        variant: "destructive",
      })
    }
  }

  const handlePageChange = (page: number) => {
    setCurrentPage(page)
  }

  const handleViewNote = (note: SOAPNote) => {
    setSelectedNote(note)
    setIsViewModalOpen(true)
  }

  const copyToClipboard = async (text: string) => {
    try {
      const out = typeof text === "string" ? text.replace(/\\r\\n/g, "\r\n").replace(/\\n/g, "\n").replace(/\\t/g, "\t") : JSON.stringify(text, null, 2)
      await navigator.clipboard.writeText(out)
      toast({ title: "Copied!", description: "Text copied to clipboard" })
    } catch (error) {
      toast({ title: "Error", description: "Failed to copy text", variant: "destructive" })
    }
  }

  const exportToPDF = async (note?: SOAPNote) => {
    const targetNote = note || selectedNote
    if (!targetNote) {
      toast({
        title: "Error",
        description: "No note selected for export",
        variant: "destructive",
      })
      return
    }

    setIsExportingPDF(true)
    try {
      const filename = `soap-note-${targetNote.patient_name || 'patient'}-${new Date(targetNote.created_at).toISOString().split('T')[0]}.pdf`
      
      await exportSOAPNoteToPDF(targetNote, {
        filename,
        orientation: 'portrait',
        format: 'a4',
        margin: 20
      })

      toast({
        title: "Success",
        description: "PDF exported successfully",
      })
    } catch (error) {
      console.error('Failed to export PDF:', error)
      toast({
        title: "Export Failed",
        description: error instanceof Error ? error.message : "Failed to export PDF. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsExportingPDF(false)
    }
  }

  // NOTE: don't early-return while loading so header and filters stay visible.
  // We'll render a loading state only for the results area below.

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
                    placeholder="Search by Name..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              <div className="w-full md:w-48">
                <DatePicker
                  value={dateFilter ?? undefined}
                  onChange={(val) => setDateFilter(val)}
                  placeholder="Filter by date"
                  allowClear
                  buttonClassName="h-9 w-full"
                />
              </div>
              {/* <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full md:w-48">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-full md:w-48">
                  <SelectValue placeholder="Filter by type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="follow-up">Follow-up</SelectItem>
                  <SelectItem value="initial">Initial Consultation</SelectItem>
                  <SelectItem value="annual">Annual Checkup</SelectItem>
                  <SelectItem value="urgent">Urgent Care</SelectItem>
                </SelectContent>
              </Select> */}
            </div>
          </CardContent>
        </Card>

        {/* Results area - show loader only for results while keeping filters visible */}
        {isLoading ? (
          <div className="p-6 flex items-center justify-center">
            <div className="flex items-center gap-2">
              <Loader2 className="h-6 w-6 animate-spin" />
              <span>Loading SOAP notes...</span>
            </div>
          </div>
        ) : (
          <>
            {/* Results Summary */}
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-600">
                Showing {filteredNotes.length} of {totalNotes} SOAP notes (Page {currentPage} of {totalPages})
              </p>
            </div>

            {/* Notes List */}
            <div className="space-y-4">
              {filteredNotes.map((note) => (
                <Card key={note.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 space-y-3">
                        <div className="flex items-center gap-3">
                          <h3 className="text-lg font-semibold text-gray-900">
                            {note.patient_name || 'Unknown Patient'}
                          </h3>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-600">
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4" />
                            {formatDate(note.created_at)}
                          </div>
                          <div className="flex items-start gap-2">
                            <span className="font-medium text-gray-700 min-w-fit">Chief Complaint:</span>
                            <span className="text-gray-600">
                              {(note.soap_data.subjective as any)?.chief_complaint
                              || (note.soap_data.subjective as any)?.CC
                               }
                            </span>
                          </div>
                        </div>

                      </div>

                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => handleViewNote(note)}>
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
                            <DropdownMenuItem onClick={() => exportToPDF(note)}>
                              <Download className="mr-2 h-4 w-4" />
                              Export PDF
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              className="text-red-600"
                              onClick={() => handleDeleteNote(note.id)}
                            >
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                >
                  Previous
                </Button>
                <span className="text-sm text-gray-600">
                  Page {currentPage} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages}
                >
                  Next
                </Button>
              </div>
            )}

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
          </>
        )}

        {/* View SOAP Note Modal */}
        <Dialog open={isViewModalOpen} onOpenChange={setIsViewModalOpen}>
          <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle className="h-6 w-6 text-green-600" />
                <span>SOAP Note Details</span>
              </DialogTitle>
            </DialogHeader>

            {selectedNote && (
              <div className="space-y-6">
                <div className="flex items-center justify-end gap-2">
                  <Button 
                    variant="outline" 
                    onClick={() => exportToPDF(selectedNote)}
                    disabled={isExportingPDF}
                  >
                    {isExportingPDF ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Exporting...
                      </>
                    ) : (
                      <>
                        <Download className="mr-2 h-4 w-4" />
                        Export PDF
                      </>
                    )}
                  </Button>
                  <Button variant="outline" onClick={() => copyToClipboard(JSON.stringify(selectedNote, null, 2))}>
                    <Copy className="mr-2 h-4 w-4" />
                    Copy All
                  </Button>
                </div>

                <Tabs defaultValue="soap" className="w-full">
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="soap">SOAP Note</TabsTrigger>
                    <TabsTrigger value="transcript">Transcript</TabsTrigger>
                    <TabsTrigger value="summary">Summary</TabsTrigger>
                  </TabsList>

                  <TabsContent value="soap" className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Card>
                        <CardHeader className="pb-3">
                          <CardTitle className="flex items-center gap-2 text-lg">
                            <User className="h-5 w-5 text-blue-600" />
                            Subjective
                          </CardTitle>
                        </CardHeader>
                                                 <CardContent>
                           <pre className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">
                             {formatSubjective(selectedNote.soap_data.subjective)}
                           </pre>
                           <Button variant="ghost" size="sm" className="mt-2" onClick={() => copyToClipboard(formatSubjective(selectedNote.soap_data.subjective))}>
                             <Copy className="mr-1 h-3 w-3" />
                             Copy
                           </Button>
                         </CardContent>
                      </Card>

                      <Card>
                        <CardHeader className="pb-3">
                          <CardTitle className="flex items-center gap-2 text-lg">
                            <Stethoscope className="h-5 w-5 text-green-600" />
                            Objective
                          </CardTitle>
                        </CardHeader>
                                                 <CardContent>
                           <pre className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">
                             {formatObjective(selectedNote.soap_data.objective)}
                           </pre>
                           <Button variant="ghost" size="sm" className="mt-2" onClick={() => copyToClipboard(formatObjective(selectedNote.soap_data.objective))}>
                             <Copy className="mr-1 h-3 w-3" />
                             Copy
                           </Button>
                         </CardContent>
                      </Card>

                      <Card>
                        <CardHeader className="pb-3">
                          <CardTitle className="flex items-center gap-2 text-lg">
                            <ClipboardList className="h-5 w-5 text-orange-600" />
                            Assessment
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-sm text-gray-700 leading-relaxed">{selectedNote.soap_data.assessment}</p>
                          <Button variant="ghost" size="sm" className="mt-2" onClick={() => copyToClipboard(selectedNote.soap_data.assessment)}>
                            <Copy className="mr-1 h-3 w-3" />
                            Copy
                          </Button>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader className="pb-3">
                          <CardTitle className="flex items-center gap-2 text-lg">
                            <Target className="h-5 w-5 text-purple-600" />
                            Plan
                          </CardTitle>
                        </CardHeader>
                                                 <CardContent>
                           <pre className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{formatPlan(selectedNote.soap_data.plan)}</pre>
                           <Button variant="ghost" size="sm" className="mt-2" onClick={() => copyToClipboard(formatPlan(selectedNote.soap_data.plan))}>
                             <Copy className="mr-1 h-3 w-3" />
                             Copy
                           </Button>
                         </CardContent>
                      </Card>
                    </div>
                  </TabsContent>

                  <TabsContent value="transcript">
                    <Card>
                      <CardHeader>
                        <CardTitle>Diarized Transcript</CardTitle>
                        <CardDescription>Raw diarized transcript text from backend</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <pre className="whitespace-pre-wrap text-gray-700">
                          {selectedNote.diarized_transcript
                            ? selectedNote.diarized_transcript
                                .replace(/\[([^\]]+)\]/g, "$1:")  // Replace [Speaker] with Speaker:
                                .replace(/(\n)?([A-Za-z]+:)/g, "\n$2") // Ensure a newline before speaker label
                            : "No diarized transcript available."}
                        </pre>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="summary">
                    <Card>
                      <CardHeader>
                        <CardTitle>Session Summary</CardTitle>
                        <CardDescription>Key metrics and insights from the consultation</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          <pre className="whitespace-pre-wrap text-gray-700">{selectedNote.summary || 'No summary available'}</pre>
                        </div>
                      </CardContent>
                    </Card>
                  </TabsContent>
                </Tabs>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
