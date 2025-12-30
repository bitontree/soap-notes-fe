"use client"

import { useEffect, useState } from "react"
import { Header } from "@/components/layout/header"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { FileText, Clock, TrendingUp, Users, Plus, Calendar, Activity, CheckCircle, User as UserIcon, Stethoscope, ClipboardList, Target, Download, Copy, Loader2, Eye, X, ChevronLeft, ChevronRight } from "lucide-react"
import Link from "next/link"
import { soapApi, getDashboardStats, type DashboardStats, billingCodesApi, type ICDBillingCodeItem } from "@/lib/api" 
import { useToast } from "@/hooks/use-toast"
import { useAuth } from "@/contexts/auth-context"
import { exportSOAPNoteToPDF } from "@/lib/pdf-export"


export default function DashboardPage() {
  const [recentNotes, setRecentNotes] = useState<any[]>([])
  const { toast } = useToast()
  const { user } = useAuth()
  const [selectedNote, setSelectedNote] = useState<any | null>(null)
  const [isViewModalOpen, setIsViewModalOpen] = useState(false)
  const [isExportingPDF, setIsExportingPDF] = useState(false)
  const [stats, setStats] = useState<DashboardStats>({ totalNotes: 0, thisWeek: 0, avgProcessingTimeMs: null, activePatients: 0, changes: {} })
  const [isStatsLoading, setIsStatsLoading] = useState<boolean>(true)
  const [icdCodes, setIcdCodes] = useState<ICDBillingCodeItem[]>([])
  const [isLoadingIcdCodes, setIsLoadingIcdCodes] = useState(false)
  const [selectedIcdCodesSet, setSelectedIcdCodesSet] = useState<Set<string>>(new Set())
  const [icdOriginalSelection, setIcdOriginalSelection] = useState<string[]>([])
  // ICD search UI state
  const [icdQuery, setIcdQuery] = useState<string>("")
  const [icdSearchResults, setIcdSearchResults] = useState<Array<{ code?: string; description?: string }>>([])
  const [isSearchingIcd, setIsSearchingIcd] = useState<boolean>(false)
  const [icdPage, setIcdPage] = useState<number>(1)
  const [icdPageSize, setIcdPageSize] = useState<number>(10)
  const [icdHasMore, setIcdHasMore] = useState<boolean>(false)
  const [selectedCodeType, setSelectedCodeType] = useState<'icd' | 'drugs' | 'cpt' | 'hcpcs'>('icd')


  useEffect(() => {
    const fetchNotes = async () => {
      try {
  const data = await soapApi.getNotes({ page: 1, limit: 3 }) // page=1, limit=3
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

  useEffect(() => {
    const fetchStats = async () => {
      setIsStatsLoading(true)
      try {
        const s = await getDashboardStats()
        setStats(s)
      } catch (error: any) {
        toast({
          title: "Error loading stats",
          description: error.message || "Failed to fetch dashboard stats",
          variant: "destructive",
        })
      } finally {
        setIsStatsLoading(false)
      }
    }
    fetchStats()
  }, [toast])

  const formatSubjective = (subjective: any): string => {
    if (!subjective) return ""
    if (typeof subjective === 'string') return subjective
    return Object.values(subjective).filter(Boolean).join("\n\n")
  }

  const formatObjective = (objective: any): string => {
    if (!objective) return ""
    if (typeof objective === 'string') return objective
    return Object.values(objective).filter(Boolean).join("\n\n")
  }

  const formatPlan = (plan: any): string => {
    if (!plan) return ""
    if (typeof plan === 'string') return plan
    if (typeof plan === 'object' && plan.recommendations) {
      const recs = plan.recommendations ? plan.recommendations.map((r: string, i: number) => `${i + 1}. ${r}`).join("\n") : ""
      return `Recommendations:\n${recs}\n\nFollow-up: ${plan.follow_up || ""}`
    }
    return Object.values(plan).filter(Boolean).join("\n\n")
  }

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast({ title: "Copied!", description: "Text copied to clipboard" })
    } catch {
      toast({ title: "Error", description: "Failed to copy text", variant: "destructive" })
    }
  }

  const exportToPDF = async (note: any) => {
    if (!note) return
    setIsExportingPDF(true)
    try {
      const filename = `soap-note-${note.patient_name || 'patient'}-${new Date(note.created_at).toISOString().split('T')[0]}.pdf`
      await exportSOAPNoteToPDF(note, { filename, orientation: 'portrait', format: 'a4', margin: 20 })
      toast({ title: "Success", description: "PDF exported successfully" })
    } catch (error: any) {
      toast({ title: "Export Failed", description: error?.message || "Failed to export PDF", variant: "destructive" })
    } finally {
      setIsExportingPDF(false)
    }
  }

  const fetchIcdCodes = async (note: any) => {
    const noteId = note?.id
    const userId = user?.id  // Use current logged-in user's ID
    const patientId = note?.soap_data?.patient_id || note?.patient_id
    
    if (!noteId || !userId || !patientId) {
      console.log("Missing ICD codes params:", { noteId, userId, patientId })
      setIcdCodes([])
      return
    }
    
    setIsLoadingIcdCodes(true)
    try {
      let response: any = null
      if (selectedCodeType === 'drugs') {
        response = await billingCodesApi.getDrugBillingCodes({ user_id: userId, patient_id: patientId, soap_note_id: noteId })
      } else {
        response = await billingCodesApi.getICDCodes({ user_id: userId, patient_id: patientId, soap_note_id: noteId })
      }
      const codes = (response && response.codes) ? response.codes : []
      setIcdCodes(codes)
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
      const rawResults = await billingCodesApi.searchByType(selectedCodeType, query, pageToUse, limitToUse)
      const results = (rawResults || []).map((it: any) => ({ code: it.code || it.Code || it.code_value || '', description: it.description || it.name || it.intent || '' }))
      setIcdSearchResults(results)
      setIcdPage(pageToUse)
      setIcdPageSize(limitToUse)
      setIcdHasMore((results?.length ?? 0) >= limitToUse)
    } catch (error: any) {
      console.error("Search failed:", error)
      toast({ title: "Search failed", description: error?.message || "Failed to search codes", variant: "destructive" })
      setIcdSearchResults([])
      setIcdHasMore(false)
    } finally {
      setIsSearchingIcd(false)
    }
  }

  const handleViewNote = (note: any) => {
    setSelectedNote(note)
    setIsViewModalOpen(true)
    setIcdCodes([])
    setSelectedIcdCodesSet(new Set())
    setIcdOriginalSelection([])
    fetchIcdCodes(note)
  }

  useEffect(() => {
    if (selectedNote) fetchIcdCodes(selectedNote)
  }, [selectedCodeType])

  const toggleIcdSelection = (code?: string) => {
    if (!code) return
    setSelectedIcdCodesSet((prev) => {
      const next = new Set(Array.from(prev))
      if (next.has(code)) next.delete(code)
      else next.add(code)
      return next
    })
  }

  const handleSaveIcdSelection = () => {
    const selected = Array.from(selectedIcdCodesSet)
    console.log('Saving ICD selection for note', selectedNote?.id, selected)
    setIsViewModalOpen(false)
  }

  const handleCancelIcdSelection = () => {
    setSelectedIcdCodesSet(new Set(icdOriginalSelection))
    setIsViewModalOpen(false)
  }

  return (
    <div>
      <Header title="Dashboard" description="Overview of your medical documentation activity" />
      <div className="p-6 space-y-6">
        {/* Stats Grid (dynamic) */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Total SOAP Notes</CardTitle>
              <FileText className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900">{isStatsLoading ? '—' : stats.totalNotes}</div>
              <div className="flex items-center text-xs text-gray-600 mt-1">
                <TrendingUp className="h-3 w-3 mr-1" />
                {isStatsLoading ? '—' : (stats.changes?.totalNotesPct != null ? `${stats.changes.totalNotesPct > 0 ? '+' : ''}${stats.changes.totalNotesPct}% from last month` : 'Updated now')}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">This Week</CardTitle>
              <Calendar className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900">{isStatsLoading ? '—' : stats.thisWeek}</div>
              <div className="flex items-center text-xs text-gray-600 mt-1">
                <TrendingUp className="h-3 w-3 mr-1" />
                {isStatsLoading ? '—' : (stats.changes?.thisWeekPct != null ? `${stats.changes.thisWeekPct > 0 ? '+' : ''}${stats.changes.thisWeekPct}% from last week` : 'Last 7 days')}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Avg. Processing Time</CardTitle>
              <Clock className="h-4 w-4 text-orange-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900">
                {isStatsLoading ? '—' : (stats.avgProcessingTimeMs == null ? '—' : `${(stats.avgProcessingTimeMs / 60000).toFixed(1)}m`)}
              </div>
              <div className="flex items-center text-xs text-gray-600 mt-1">
                <TrendingUp className="h-3 w-3 mr-1" />
                {isStatsLoading ? '—' : (stats.changes?.avgProcessingTimePct != null ? `${stats.changes.avgProcessingTimePct > 0 ? '+' : ''}${stats.changes.avgProcessingTimePct}% vs last month` : 'Based on recent records')}
              </div>
            </CardContent>
          </Card>

          <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Active Patients</CardTitle>
              <Users className="h-4 w-4 text-purple-600" />
              </CardHeader>
              <CardContent>
              <div className="text-2xl font-bold text-gray-900">{isStatsLoading ? '—' : stats.activePatients}</div>
                <div className="flex items-center text-xs text-gray-600 mt-1">
                  <TrendingUp className="h-3 w-3 mr-1" />
                {isStatsLoading ? '—' : (stats.changes?.activePatientsPct != null ? `${stats.changes.activePatientsPct > 0 ? '+' : ''}${stats.changes.activePatientsPct}% from last month` : 'Patients in system')}
                </div>
              </CardContent>
            </Card>
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
              <div className="flex gap-2">
                {/* Quick action buttons only (Appointment drawer moved to schedules page) */}
              </div>
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
                          {/* Status badge intentionally hidden in UI for now. Keep the component here commented
                              so it can be re-enabled later if needed. */}
                          {/*
                          <Badge variant={note.status === "completed" ? "default" : "secondary"}>
                            {note.status || "unknown"}
                          </Badge>
                          */}
                        </div>
                        <div className="text-sm text-gray-600 mt-1">
                          {note.type || "SOAP Note"} •{" "}
                          {note.created_at ? new Date(note.created_at).toLocaleDateString() : "Unknown date"}
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleViewNote(note)}
                      >
                        <Eye className="mr-2 h-4 w-4" />
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
        {/* View SOAP Note Modal (same UX as history) */}
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
                            <UserIcon className="h-5 w-5 text-blue-600" />
                            Subjective
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <pre className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{formatSubjective(selectedNote.soap_data?.subjective)}</pre>
                          <Button variant="ghost" size="sm" className="mt-2" onClick={() => copyToClipboard(formatSubjective(selectedNote.soap_data?.subjective))}>
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
                          <pre className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{formatObjective(selectedNote.soap_data?.objective)}</pre>
                          <Button variant="ghost" size="sm" className="mt-2" onClick={() => copyToClipboard(formatObjective(selectedNote.soap_data?.objective))}>
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
                          <p className="text-sm text-gray-700 leading-relaxed">{selectedNote.soap_data?.assessment}</p>
                          <Button variant="ghost" size="sm" className="mt-2" onClick={() => copyToClipboard(selectedNote.soap_data?.assessment)}>
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
                          <pre className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{formatPlan(selectedNote.soap_data?.plan)}</pre>
                          <Button variant="ghost" size="sm" className="mt-2" onClick={() => copyToClipboard(formatPlan(selectedNote.soap_data?.plan))}>
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
                                .replace(/\[([^\]]+)\]/g, "$1:")
                                .replace(/(\n)?([A-Za-z]+:)/g, "\n$2")
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
                        {/* ICD Search Box */}
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

                        {/* Search results (if any) */}
                        {icdSearchResults && icdSearchResults.length > 0 && (
                          <div className="mb-4">
                            <div className="flex items-center justify-between">
                              <h4 className="font-medium">Search Results</h4>
                              <div className="text-sm text-gray-600">
                                {(() => {
                                  const start = icdSearchResults.length === 0 ? 0 : (icdPage - 1) * icdPageSize + 1
                                  const end = (icdPage - 1) * icdPageSize + icdSearchResults.length
                                  return `Showing ${start} - ${end}`
                                })()}
                              </div>
                            </div>

                            <div className="space-y-2 mt-2">
                              {icdSearchResults.map((r, idx) => (
                                <div key={idx} className="flex items-center justify-between rounded border p-3">
                                  <div className="flex items-center gap-3">
                                    <input
                                      type="checkbox"
                                      checked={selectedIcdCodesSet.has(String(r.code || ""))}
                                      onChange={() => toggleIcdSelection(String(r.code || ""))}
                                      className="h-4 w-4"
                                    />
                                    <Badge variant="secondary" className="font-mono">{r.code}</Badge>
                                    <div className="text-sm text-gray-800">{r.description || 'No description'}</div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Button variant="ghost" size="sm" onClick={() => copyToClipboard(`${r.code} - ${r.description || ''}`)}>
                                      <Copy className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                          {icdSearchResults && icdSearchResults.length > 0 && (
                            <div className="flex items-center gap-2 mb-4">
                              <Button size="sm" onClick={() => searchIcdCodes(icdQuery, Math.max(1, icdPage - 1), icdPageSize)} disabled={icdPage <= 1 || isSearchingIcd} aria-label="Previous page">
                                <ChevronLeft className="h-4 w-4" />
                              </Button>
                              <div className="text-sm text-gray-700">Page {icdPage}</div>
                              <Button size="sm" onClick={() => searchIcdCodes(icdQuery, icdPage + 1, icdPageSize)} disabled={!icdHasMore || isSearchingIcd} aria-label="Next page">
                                <ChevronRight className="h-4 w-4" />
                              </Button>
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
                                    <div className="flex items-center gap-3">
                                      <input
                                        type="checkbox"
                                        checked={selectedIcdCodesSet.has(String(ic.code || ""))}
                                        onChange={() => toggleIcdSelection(String(ic.code || ""))}
                                        className="h-4 w-4"
                                      />
                                      <Badge variant="secondary" className="font-mono">{ic.code}</Badge>
                                      <div className="text-sm text-gray-800">{ic.description || 'No description'}</div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <Button variant="ghost" size="sm" onClick={() => copyToClipboard(`${ic.code} - ${ic.description || ''}`)}>
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

                        <div className="flex items-center justify-end gap-2 mt-4">
                          <Button variant="outline" onClick={handleCancelIcdSelection}>Cancel</Button>
                          <Button onClick={handleSaveIcdSelection}>Save</Button>
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
