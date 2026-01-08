"use client"

import { useState, useEffect } from "react"
import { Header } from "@/components/layout/header"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Search, Filter, Calendar, FileText, Eye, Download, MoreHorizontal, Loader2, CheckCircle, Copy, User, Stethoscope, ClipboardList, Target, X, ChevronLeft, ChevronRight } from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { soapApi, billingCodesApi, type ICDBillingCodeItem } from "@/lib/api"
import { icdBus } from '@/lib/icdBus'
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
  const [icdCodes, setIcdCodes] = useState<ICDBillingCodeItem[]>([])
  const [isLoadingIcdCodes, setIsLoadingIcdCodes] = useState(false)
  const [selectedIcdCodesSet, setSelectedIcdCodesSet] = useState<Set<string>>(new Set())
  const [icdOriginalSelection, setIcdOriginalSelection] = useState<string[]>([])
  const [icdBillingId, setIcdBillingId] = useState<string | null>(null)
  // ICD search UI state for modal
  const [icdQuery, setIcdQuery] = useState<string>("")
  const [icdSearchResults, setIcdSearchResults] = useState<Array<{ code?: string; description?: string; intent?: string }>>([])
  const [isSearchingIcd, setIsSearchingIcd] = useState<boolean>(false)
  const [icdPage, setIcdPage] = useState<number>(1)
  const [icdPageSize, setIcdPageSize] = useState<number>(10)
  const [icdHasMore, setIcdHasMore] = useState<boolean>(false)
  // Code type: 'icd' = Diseases & Injuries, 'drugs' = Drugs, 'cpt'/'hcpcs' fallback to icd
  const [selectedCodeType, setSelectedCodeType] = useState<'icd' | 'drugs' | 'cpt' | 'hcpcs'>('icd')
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

  const fetchIcdCodes = async (note: SOAPNote) => {
    // fetch codes for selected type
    const noteId = note?.id
    const userId = user?.id  // Use current logged-in user's ID
    const patientId = (note.soap_data as any)?.patient_id || (note as any)?.patient_id
    
    const healthReportId = (note as any)?.health_report_id || (note.soap_data as any)?.health_report_id || undefined
    if (!userId || !patientId || (!noteId && !healthReportId)) {
      console.log("Missing ICD codes params:", { noteId, userId, patientId, healthReportId })
      setIcdCodes([])
      return
    }
    
    setIsLoadingIcdCodes(true)
    try {
      let response: any = null
      // If the note was generated from a health report, prefer sending health_report_id as available
      const payloadBase: any = { user_id: userId, patient_id: patientId }
      if (healthReportId) payloadBase.health_report_id = healthReportId
      else payloadBase.soap_note_id = noteId

      if (selectedCodeType === 'drugs') {
        response = await billingCodesApi.getDrugBillingCodes(payloadBase)
      } else {
        // icd / cpt / hcpcs fallback
        response = await billingCodesApi.getICDCodes(payloadBase)
      }

      const codes = (response && response.codes) ? response.codes : []
      setIcdCodes(codes)
      setIcdBillingId(response?.id ?? null)
      const codeKeys = (codes || []).map((c: any) => String(c.code || ""))
      setSelectedIcdCodesSet(new Set(codeKeys))
      setIcdOriginalSelection(codeKeys)
    } catch (error: any) {
      console.error("Failed to fetch codes:", error)
      setIcdCodes([])
    } finally {
      setIsLoadingIcdCodes(false)
    }
  }

  const handleViewNote = (note: SOAPNote) => {
    setSelectedNote(note)
    setIsViewModalOpen(true)
    setIcdCodes([])
    setSelectedIcdCodesSet(new Set())
    setIcdOriginalSelection([])
    fetchIcdCodes(note)
  }

  // Re-fetch codes when the selected code type changes while viewing a note
  useEffect(() => {
    if (selectedNote) {
      fetchIcdCodes(selectedNote)
    }
  }, [selectedCodeType])

  // Subscribe to global ICD events so the modal updates whenever ICD API returns
  useEffect(() => {
    const unsub = icdBus.subscribe((ev) => {
      if (!isViewModalOpen) return
      try {
        if (ev.kind === 'codes') {
          const resp = ev.payload
          // only update if codes are relevant to current selected note's patient/user
          setIcdCodes(resp.codes || [])
          setIcdBillingId(resp.id ?? null)
          const codeKeys = (resp.codes || []).map((c: any) => String(c.code || ""))
          setSelectedIcdCodesSet(new Set(codeKeys))
          setIcdOriginalSelection(codeKeys)
          setIsLoadingIcdCodes(false)
        }
        if (ev.kind === 'search') {
          // map to search result shape
          const results = (ev.payload || []).map((it: any) => ({ code: it.code, description: it.description, intent: it.intent }))
          setIcdSearchResults(results)
          setIsSearchingIcd(false)
        }
      } catch (e) {
        console.warn('Error handling icdBus event', e)
      }
    })

    return () => { unsub(); }
  }, [isViewModalOpen, selectedNote])

  const toggleIcdSelection = (code?: string) => {
    if (!code) return
    setSelectedIcdCodesSet((prev) => {
      const next = new Set(Array.from(prev))
      if (next.has(code)) next.delete(code)
      else next.add(code)
      return next
    })
  }

  const handleSaveIcdSelection = async () => {
    const selected = Array.from(selectedIcdCodesSet)
    if (!icdBillingId) {
      toast({ title: 'Error', description: 'Missing billing document id. Cannot save codes.', variant: 'destructive' })
      return
    }

    const items = icdCodes
      .filter(c => selected.includes(String(c.code)))
      .map(c => ({
        soap_note_id: (c as any).soap_note_id || '',
        health_report_id: (c as any).health_report_id || undefined,
        code_type: (c as any).code_type || selectedCodeType,
        code: c.code,
        description: (c as any).description || ''
      }))

    try {
      setIsLoadingIcdCodes(true)
      await billingCodesApi.addSavedCodes(icdBillingId, items)
      toast({ title: 'Saved', description: 'Billing codes saved successfully' })
      setIcdOriginalSelection(items.map((it: any) => String(it.code)))
      setIsViewModalOpen(false)
    } catch (error: any) {
      console.error('Failed to save ICD codes:', error)
      toast({ title: 'Error', description: error?.message || 'Failed to save billing codes', variant: 'destructive' })
    } finally {
      setIsLoadingIcdCodes(false)
    }
  }

  const handleCancelIcdSelection = () => {
    setSelectedIcdCodesSet(new Set(icdOriginalSelection))
    setIsViewModalOpen(false)
  }

  // Search implementation routed by selected code type
  const searchIcdCodes = async (q?: string, page?: number, limit?: number) => {
    const query = (q ?? icdQuery ?? "").trim()
    if (!query) {
      setIcdSearchResults([])
      setIcdHasMore(false)
      return
    }

    const pageToUse = page ?? icdPage ?? 1
    const limitToUse = limit ?? icdPageSize ?? 10

    setIsSearchingIcd(true)
    try {
      // Build optional context: send user_id, patient_id and note identifiers when available
      const userId = user?.id
      const noteId = selectedNote?.id
      const patientId = (selectedNote?.soap_data as any)?.patient_id || (selectedNote as any)?.patient_id
      const healthReportId = (selectedNote as any)?.health_report_id || (selectedNote?.soap_data as any)?.health_report_id

      const context: any = {}
      if (userId) context.user_id = userId
      if (patientId) context.patient_id = patientId
      if (healthReportId) context.health_report_id = healthReportId
      else if (noteId) context.soap_note_id = noteId

      const rawResults = await billingCodesApi.searchByType(selectedCodeType, query, pageToUse, limitToUse, context)
      // Normalize results to {code, description, intent}
      const results = (rawResults || []).map((it: any) => ({
        code: it.code || it.Code || it.code_value || '',
        description: it.description || it.name || '',
        intent: it.intent || ''
      }))
      setIcdSearchResults(results)
      setIcdPage(pageToUse)
      setIcdPageSize(limitToUse)
      setIcdHasMore((results?.length ?? 0) >= limitToUse)
    } catch (error: any) {
      console.error('Search failed:', error)
      toast({ title: 'Search failed', description: error?.message || 'Failed to search codes', variant: 'destructive' })
      setIcdSearchResults([])
      setIcdHasMore(false)
    } finally {
      setIsSearchingIcd(false)
    }
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
                    <TabsList className="grid w-full grid-cols-4">
                    <TabsTrigger value="soap">SOAP Note</TabsTrigger>
                    <TabsTrigger value="transcript">Transcript</TabsTrigger>
                    <TabsTrigger value="summary">Summary</TabsTrigger>
                    <TabsTrigger value="icd">Billing Codes</TabsTrigger>
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

                  {/* ICD-10 Disease & Injury Codes (Diagnoses) */}
                  <TabsContent value="icd">
                    <Card>
                      <CardHeader>
                        <CardTitle>Billing Codes</CardTitle>
                        <CardDescription>Search and manage ICD-10-CM Diseases & Injuries, ICD-10-CM Drugs, CPT, and HCPCS billing codes.</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:gap-2">
                          <div className="flex items-center gap-2 w-full">
                            <select
                              value={selectedCodeType}
                              onChange={(e) => setSelectedCodeType(e.target.value as any)}
                              className="rounded border px-3 py-2 text-sm"
                              aria-label="Select code type"
                            >
                              <option value="icd">ICD-10-CM Diseases & Injuries</option>
                              <option value="drugs">ICD-10-CM Drugs</option>
                              <option value="cpt">CPT</option>
                              <option value="hcpcs">HCPCS</option>
                            </select>

                            <div className="relative flex-1">
                              <input
                                value={icdQuery}
                                onChange={(e) => setIcdQuery(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') { searchIcdCodes(icdQuery, 1, icdPageSize) } }}
                                placeholder={selectedCodeType === 'drugs' ? "Search drug name or code (e.g. aspirin, NDC)" : "Search ICD code or description (e.g. E11, diabetes, chest pain)"}
                                className="w-full rounded border px-3 py-2 text-sm pr-10"
                              />
                              {icdQuery && icdQuery.length > 0 && (
                                <button
                                  type="button"
                                  onClick={() => setIcdQuery("")}
                                  aria-label="Clear search query"
                                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                                >
                                  <X className="h-4 w-4" />
                                </button>
                              )}
                            </div>
                          </div>
                          <div className="mt-2 sm:mt-0">
                            <Button size="sm" onClick={() => searchIcdCodes(icdQuery, 1, icdPageSize)} disabled={isSearchingIcd}>
                              {isSearchingIcd ? (
                                <>
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                  Searching...
                                </>
                              ) : (
                                <>Search</>
                              )}
                            </Button>
                          </div>
                        </div>

                        {icdSearchResults && icdSearchResults.length > 0 && (
                          <div className="mb-4">
                            <div className="flex items-center justify-between">
                              <h4 className="font-medium">Search Results</h4>
                              <div className="text-sm text-gray-600">{(() => {
                                const start = icdSearchResults.length === 0 ? 0 : (icdPage - 1) * icdPageSize + 1
                                const end = (icdPage - 1) * icdPageSize + icdSearchResults.length
                                return `Showing ${start} - ${end}`
                              })()}</div>
                            </div>

                            <div className="space-y-2 mt-2">
                              {icdSearchResults.map((r, idx) => (
                                <div key={idx} className="flex items-center justify-between rounded border p-3">
                                  <div className="flex flex-col sm:flex-row sm:items-center sm:gap-3 w-full">
                                    <div className="flex items-center gap-3">
                                      <input
                                        type="checkbox"
                                        checked={selectedIcdCodesSet.has(String(r.code || ""))}
                                        onChange={() => toggleIcdSelection(String(r.code || ""))}
                                        className="h-4 w-4"
                                      />
                                      <Badge variant="secondary" className="font-mono">{r.code}</Badge>
                                    </div>
                                    <div className="flex-1 mt-2 sm:mt-0">
                                      <div className="text-sm text-gray-800">{r.description || 'No description'}</div>
                                      {selectedCodeType === 'drugs' && r.intent && (
                                        <div className="text-xs text-gray-500 mt-1">Intent: {r.intent}</div>
                                      )}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Button variant="ghost" size="sm" onClick={() => copyToClipboard(`${r.code} - ${r.description || ''}${r.intent ? ' - Intent: ' + r.intent : ''}`)}>
                                      <Copy className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </div>
                              ))}
                            </div>

                            <div className="flex items-center gap-2 mb-4 mt-2">
                              <Button size="sm" onClick={() => searchIcdCodes(icdQuery, Math.max(1, icdPage - 1), icdPageSize)} disabled={icdPage <= 1 || isSearchingIcd} aria-label="Previous page">
                                <ChevronLeft className="h-4 w-4" />
                              </Button>
                              <div className="text-sm text-gray-700">Page {icdPage}</div>
                              <Button size="sm" onClick={() => searchIcdCodes(icdQuery, icdPage + 1, icdPageSize)} disabled={!icdHasMore || isSearchingIcd} aria-label="Next page">
                                <ChevronRight className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        )}

                        {isLoadingIcdCodes ? (
                          <div className="flex items-center gap-2 text-sm text-gray-600">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Loading ICD codes...
                          </div>
                        ) : icdCodes.length > 0 ? (
                          (() => {
                            const diagnoses = icdCodes.filter(c => String(c.code_type || '').toLowerCase().includes('diagnos'))
                            const symptoms = icdCodes.filter(c => String(c.code_type || '').toLowerCase().includes('symptom'))
                            const others = icdCodes.filter(c => !diagnoses.includes(c) && !symptoms.includes(c))
                            const renderList = (list: typeof icdCodes, label: string) => (
                              <div className="space-y-3">
                                {list.map((ic, idx) => (
                                  <div key={idx} className="flex items-center justify-between rounded border p-3">
                                    <div className="flex flex-col sm:flex-row sm:items-center sm:gap-3 w-full">
                                      <div className="flex items-center gap-3">
                                        <input
                                          type="checkbox"
                                          checked={selectedIcdCodesSet.has(String(ic.code || ""))}
                                          onChange={() => toggleIcdSelection(String(ic.code || ""))}
                                          className="h-4 w-4"
                                        />
                                        <Badge variant="secondary" className="font-mono">{ic.code}</Badge>
                                      </div>
                                      <div className="flex-1 mt-2 sm:mt-0">
                                        <div className="text-sm text-gray-800">{ic.description || 'No description'}</div>
                                        {selectedCodeType === 'drugs' && (ic as any).intent && (
                                          <div className="text-xs text-gray-500 mt-1">Intent: {(ic as any).intent}</div>
                                        )}
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <Button variant="ghost" size="sm" onClick={() => copyToClipboard(`${ic.code} - ${ic.description || ''}${(ic as any).intent ? ' - Intent: ' + (ic as any).intent : ''}`)}>
                                        <Copy className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )

                            return (
                              <div className="space-y-4">
                                {diagnoses.length > 0 && (
                                  <div>
                                    <h4 className="mb-2 font-medium">Diagnoses</h4>
                                    {renderList(diagnoses, 'Diagnosis')}
                                  </div>
                                )}
                                {symptoms.length > 0 && (
                                  <div>
                                    <h4 className="mb-2 font-medium">Symptoms</h4>
                                    {renderList(symptoms, 'Symptoms')}
                                  </div>
                                )}
                                {others.length > 0 && (
                                  <div>
                                    <h4 className="mb-2 font-medium">Other</h4>
                                    {renderList(others, 'Other')}
                                  </div>
                                )}
                              </div>
                            )
                          })()
                        ) : (
                          <div className="text-sm text-gray-700">
                            No ICD-10 diagnosis codes available for this note.
                          </div>
                        )}
                        </CardContent>
                        <div className="flex items-center justify-end gap-2 px-6 pb-6">
                          <Button variant="outline" onClick={handleCancelIcdSelection}>Cancel</Button>
                          <Button onClick={handleSaveIcdSelection}>Save</Button>
                        </div>
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
