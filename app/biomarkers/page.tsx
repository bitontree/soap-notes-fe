"use client"

import React, { useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { CalendarIcon, Loader2, RefreshCw, ChevronLeft, ChevronRight, User, FileText, Calendar as CalendarIcon2, Mail, Phone, CheckCircle, Stethoscope, ClipboardList, Target, Copy } from "lucide-react"
import { format, parse, isValid } from "date-fns"
import { cn } from "@/lib/utils"
import { Header } from "@/components/layout/header"
import { fetchReports, authApi, soapApi } from "@/lib/api"
import { useToast } from "@/hooks/use-toast"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { CardDescription } from "@/components/ui/card"

// Custom CSS to hide scrollbars
const scrollbarHideStyles = `
  .scrollbar-hide {
    -ms-overflow-style: none;  /* Internet Explorer 10+ */
    scrollbar-width: none;     /* Firefox */
  }
  .scrollbar-hide::-webkit-scrollbar {
    display: none;             /* Safari and Chrome */
  }
`

interface PatientInfo { name?: string; gender?: string }
interface Biomarker { name: string; result_value: string; unit?: string | null; reference_range?: string | null; status?: string | null; category?: string | null }
interface Report { report_id: string; patient_info?: PatientInfo; test_date: string; test_category: string; biomarkers: Biomarker[]; created_at?: string }

interface Patient {
  id: string
  firstname: string
  lastname: string
  age: number
  gender: string
  dob: string
  email?: string
  phone?: string
  address?: string
  created_at: string
}

interface SOAPNote {
  id: string
  user_id: string
  patient_name?: string
  soap_data: {
    subjective: any
    objective: any
    assessment: string
    plan: any
    patient_id?: string
  }
  summary: string
  transcript?: string // Added for transcript tab
  diarized_transcript?: string // Added for diarized transcript
  s3_key: string
  created_at: string
}

type AggregatedCell = {
  value: string
  unit?: string | null
  status?: string | null
  reference_range?: string | null
  createdAtMs: number
}

export default function BiomarkersPage() {
  const { toast } = useToast()
  const [selectedTestType, setSelectedTestType] = useState<string>("all")
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null)
  const [availablePatients, setAvailablePatients] = useState<Patient[]>([])
  const [dateRange, setDateRange] = useState<{ from: Date | undefined; to: Date | undefined }>({ from: undefined, to: undefined })
  const [reports, setReports] = useState<Report[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingPatients, setIsLoadingPatients] = useState(true)
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const [lastSoapNote, setLastSoapNote] = useState<SOAPNote | null>(null)
  const [isLoadingSoap, setIsLoadingSoap] = useState(false)
  const [isViewModalOpen, setIsViewModalOpen] = useState(false)
  const [selectedNote, setSelectedNote] = useState<SOAPNote | null>(null)

  // Inject custom CSS for hiding scrollbars
  useEffect(() => {
    const styleElement = document.createElement('style')
    styleElement.textContent = scrollbarHideStyles
    document.head.appendChild(styleElement)

    return () => {
      document.head.removeChild(styleElement)
    }
  }, [])

  // Load available patients
  useEffect(() => {
    const loadPatients = async () => {
      setIsLoadingPatients(true)
      try {
        const patientsData = await authApi.getPatients()
        setAvailablePatients(patientsData)
        // Auto-select first patient if available
        if (patientsData.length > 0) {
          setSelectedPatient(patientsData[0])
        }
      } catch (error: any) {
        console.error("Failed to load patients:", error)
        toast({
          title: "Error",
          description: error.message || "Failed to load patients",
          variant: "destructive",
        })
      } finally {
        setIsLoadingPatients(false)
      }
    }
    loadPatients()
  }, [toast])

  // Load last SOAP note for selected patient
  useEffect(() => {
    const loadLastSoapNote = async () => {
      if (!selectedPatient) {
        setLastSoapNote(null)
        return
      }

      setIsLoadingSoap(true)
      try {
        // Fetch SOAP notes for the patient
        const notesData = await soapApi.getNotes(1, 10) // Get first 10 notes
        const patientNotes = notesData.soap_notes?.filter((note: any) => 
          note.patient_name?.toLowerCase().includes(selectedPatient.firstname.toLowerCase()) ||
          note.patient_name?.toLowerCase().includes(selectedPatient.lastname.toLowerCase())
        ) || []
        
        if (patientNotes.length > 0) {
          // Sort by created_at and get the most recent
          const sortedNotes = patientNotes.sort((a: any, b: any) => 
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          )
          setLastSoapNote(sortedNotes[0])
        } else {
          setLastSoapNote(null)
        }
      } catch (error: any) {
        console.error("Failed to load SOAP notes:", error)
        setLastSoapNote(null)
      } finally {
        setIsLoadingSoap(false)
      }
    }

    loadLastSoapNote()
  }, [selectedPatient])

  const loadReports = async (patient: Patient | null) => {
    if (!patient) {
      setReports([])
      return
    }

    setIsLoading(true)
    try {
      // Use the patient's first name for the API call as the backend expects
      const patientName = patient.firstname.toLowerCase()
      const res = await fetchReports({ page: 1, limit: 100, patient_name: patientName })
      setReports((res.reports as any) || [])
    } catch (e: any) {
      toast({ title: "Failed to load reports", description: e?.message || "Please try again later", variant: "destructive" })
      setReports([])
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadReports(selectedPatient)
  }, [selectedPatient])

  // Robust date normalization: tries many formats; only falls back to created_at if test_date missing
  const normalizeTestDate = (dateStr?: string, createdAtIso?: string): string | undefined => {
    const raw = (dateStr || "").trim()
    if (!raw) return createdAtIso // only fall back when test_date is absent

    // Candidate strings: try raw and common separator replacements
    const candidates = Array.from(new Set([
      raw,
      raw.replace(/\./g, "/"),
      raw.replace(/-/g, "/"),
      raw.replace(/\s+/g, " "),
      raw.replace(/[,]/g, ""),
    ]))

    // Supported formats (add as needed)
    const formats = [
      "d/M/yy", "d/M/yyyy", "dd/MM/yy", "dd/MM/yyyy",
      "M/d/yy", "M/d/yyyy", "MM/dd/yy", "MM/dd/yyyy",
      "d-M-yy", "d-M-yyyy", "dd-MM-yy", "dd-MM-yyyy",
      "d.M.yy", "d.M.yyyy", "dd.MM.yy", "dd.MM.yyyy",
      "d MMM yyyy", "dd MMM yyyy", "d-MMM-yyyy", "dd-MMM-yyyy",
      "MMM d, yyyy", "yyyy-MM-dd"
    ] as const

    for (const candidate of candidates) {
      for (const fmt of formats) {
        const parsed = parse(candidate, fmt, new Date())
        if (isValid(parsed)) {
          // Output YYYY-MM-DD
          return format(parsed, "yyyy-MM-dd")
        }
      }
    }

    // As a last resort, try native Date parsing
    const native = new Date(raw)
    if (!isNaN(native.getTime())) return format(native, "yyyy-MM-dd")

    // Unparsable: do NOT use createdAt fallback here
    return undefined
  }

  const formatDate = (dateString: string) => {
    try {
      // If already ISO
      const isoParsed = new Date(dateString)
      if (!isNaN(isoParsed.getTime())) return isoParsed.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })

      const normalized = normalizeTestDate(dateString)
      if (normalized) {
        const dt = new Date(normalized)
        return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
      }
      return dateString
    } catch { return dateString }
  }

  // Range-aware coloring
  const parseFirstNumber = (s?: string | null): number | null => {
    if (!s) return null
    const m = String(s).replace(/,/g, "").match(/[-+]?\d*\.?\d+(?:e[-+]?\d+)?/i)
    return m ? Number(m[0]) : null
  }

  const parseRange = (s?: string | null): { lower?: number; upper?: number } | null => {
    if (!s) return null
    const txt = s.toLowerCase()
    // Between form: 70-100
    const between = txt.match(/(-?\d+(?:\.\d+)?)\s*[-–—]\s*(-?\d+(?:\.\d+)?)/)
    if (between) {
      const lower = Number(between[1])
      const upper = Number(between[2])
      if (!isNaN(lower) && !isNaN(upper)) return { lower, upper }
    }
    // Upper-only: <150, <=150, ≤150
    const upper = txt.match(/(?:<=|≤|<)\s*(-?\d+(?:\.\d+)?)/)
    if (upper) {
      const u = Number(upper[1])
      if (!isNaN(u)) return { upper: u }
    }
    // Lower-only: >40, >=40, ≥40
    const lower = txt.match(/(?:>=|≥|>)\s*(-?\d+(?:\.\d+)?)/)
    if (lower) {
      const l = Number(lower[1])
      if (!isNaN(l)) return { lower: l }
    }
    // Fallback: try to pick two numbers in order -> treat as range
    const nums = Array.from(txt.matchAll(/-?\d+(?:\.\d+)?/g)).map(m => Number(m[0]))
    if (nums.length >= 2 && !isNaN(nums[0]) && !isNaN(nums[1])) return { lower: nums[0], upper: nums[1] }
    if (nums.length === 1 && !isNaN(nums[0])) return { lower: nums[0] }
    return null
  }

  const getCellBackgroundColor = (cell?: AggregatedCell | null, refRange?: string | null) => {
    if (!cell) return "bg-gray-100"
    const value = parseFirstNumber(cell.value)
    if (value == null) return "bg-gray-100"
    const rng = parseRange(cell.reference_range || refRange)
    if (!rng || (rng.lower == null && rng.upper == null)) return "bg-gray-100"

    if (rng.lower != null && rng.upper != null) {
      // Bounds exist
      if (value >= rng.upper) return "bg-red-100" // at or above upper => red
      if (value <= rng.lower) return "bg-yellow-100" // at or below lower => yellow
      return "bg-green-100" // strictly inside
    }
    if (rng.upper != null) {
      // Upper only
      return value >= rng.upper ? "bg-red-100" : "bg-green-100"
    }
    if (rng.lower != null) {
      // Lower only
      return value <= rng.lower ? "bg-yellow-100" : "bg-green-100"
    }
    return "bg-gray-100"
  }

  // Derived collections
  const allTestCategories = useMemo(() => new Set(reports.map(r => r.test_category).filter(Boolean)), [reports])

  // Apply filters client-side (simple, avoids API complexity for now)
  const filteredReports = useMemo(() => {
    return reports.filter((report) => {
      const matchesType = selectedTestType === "all" || report.test_category === selectedTestType
      if (!matchesType) return false
      if (dateRange.from || dateRange.to) {
        try {
          const iso = normalizeTestDate(report.test_date, (report.created_at || "").split("T")[0])
          if (!iso) return matchesType
          const dt = new Date(iso)
          if (dateRange.from && dt < dateRange.from) return false
          if (dateRange.to && dt > dateRange.to) return false
        } catch { return matchesType }
      }
      return true
    })
  }, [reports, selectedTestType, dateRange])

  // Aggregate per-date and per-biomarker, keeping newest by created_at for that date
  const { datesISO, categoryToNames, dateToCells, nameRefRange } = useMemo(() => {
    const dateSet = new Set<string>()
    const categoryToNames = new Map<string, Set<string>>()
    const dateToCells = new Map<string, Map<string, AggregatedCell>>()
    const nameRefRange = new Map<string, string>() // key = name|||category

    const normalizeName = (s?: string | null) => (s || "").trim().replace(/\s*-[\s]*/g, "-").replace(/\s+/g, " ")
    const normalizeCategory = (s?: string | null) => ((s || "Unspecified").trim() || "Unspecified")

    for (const rpt of filteredReports) {
      const iso = normalizeTestDate(rpt.test_date, (rpt.created_at || "").split("T")[0])
      if (!iso) continue
      dateSet.add(iso)
      if (!dateToCells.has(iso)) dateToCells.set(iso, new Map())
      const cellMap = dateToCells.get(iso)!
      const createdAtMs = rpt.created_at ? Date.parse(rpt.created_at) || 0 : 0

      for (const bm of rpt.biomarkers || []) {
        const nName = normalizeName(bm.name)
        const nCat = normalizeCategory(bm.category)
        if (!nName) continue
        if (!categoryToNames.has(nCat)) categoryToNames.set(nCat, new Set())
        categoryToNames.get(nCat)!.add(nName)

        const key = `${nName}|||${nCat}`
        const nextCell: AggregatedCell = {
          value: String(bm.result_value ?? ""),
          unit: bm.unit ?? null,
          status: bm.status ?? null,
          reference_range: bm.reference_range ?? undefined,
          createdAtMs,
        }
        const prev = cellMap.get(key)
        if (!prev || nextCell.createdAtMs >= prev.createdAtMs) {
          cellMap.set(key, nextCell)
        }
        if (!nameRefRange.has(key) && bm.reference_range) {
          nameRefRange.set(key, bm.reference_range)
        }
      }
    }

    // Changed to ascending order (oldest to newest)
    const datesISO = Array.from(dateSet).sort((a, b) => (a < b ? -1 : 1))
    return { datesISO, categoryToNames, dateToCells, nameRefRange }
  }, [filteredReports])

  const filteredCategories = useMemo(() => new Set(Array.from(categoryToNames.keys())), [categoryToNames])

  const filteredBiomarkers = useMemo(() => {
    const s = new Set<string>()
    for (const names of categoryToNames.values()) for (const n of names) s.add(n)
    return s
  }, [categoryToNames])

  const sortedDates = datesISO

  const sortedBiomarkers = useMemo(() => Array.from(filteredBiomarkers).sort(), [filteredBiomarkers])

  const patientInfo: PatientInfo | undefined = reports[0]?.patient_info

  // Helper function to format SOAP data
  const formatSoapData = (data: any): string => {
    if (!data) return "No data available"
    if (typeof data === 'string') return data
    if (typeof data === 'object') {
      return Object.values(data).filter(Boolean).join("\n")
    }
    return String(data)
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

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      toast({
        title: "Copied to clipboard",
        description: "SOAP data copied to clipboard.",
      })
    }).catch((err) => {
      console.error("Failed to copy text: ", err)
      toast({
        title: "Copy failed",
        description: "Failed to copy SOAP data to clipboard.",
        variant: "destructive",
      })
    })
  }

  return (
    <div>
      <Header title="Biomarkers" description="Explore biomarker measurements over time" />
      
      {/* Main Layout with Sidebar */}
      <div className="flex h-[calc(100vh-120px)] flex-1 overflow-x-hidden">
        {/* Main Content Area */}
        <div className={cn("flex-1 transition-all duration-300", isSidebarOpen ? "mr-4" : "mr-0")}>
          <div className="space-y-6 w-full p-6">
            {/* Patient Selection */}
            <div className="bg-white rounded-lg shadow-sm p-4 border border-gray-200">
              <div className="flex items-center gap-4">
                <label className="text-sm font-medium text-gray-700">Patient:</label>
                <Select 
                  value={selectedPatient?.id || ""} 
                  onValueChange={(value) => {
                    const patient = availablePatients.find(p => p.id === value)
                    setSelectedPatient(patient || null)
                  }}
                  disabled={isLoadingPatients}
                >
                  <SelectTrigger className="w-64 h-9 text-sm">
                    <SelectValue placeholder={isLoadingPatients ? "Loading patients..." : "Select a patient"} />
                  </SelectTrigger>
                  <SelectContent>
                    {availablePatients.map((patient) => (
                      <SelectItem key={patient.id} value={patient.id} className="text-sm">
                        {patient.firstname} {patient.lastname} ({patient.age} years)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Filters - Only show if a patient is selected */}
            {selectedPatient && (
              <div className="bg-white rounded-lg shadow-sm p-4 border border-gray-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <label className="text-sm font-medium text-gray-700">Filter:</label>
                    <Select value={selectedTestType} onValueChange={setSelectedTestType}>
                      <SelectTrigger className="w-48 h-9 text-sm">
                        <SelectValue placeholder="All test types" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all" className="text-sm">All Test Types</SelectItem>
                        {Array.from(allTestCategories).sort().map((tc) => (
                          <SelectItem key={tc as string} value={tc as string} className="text-sm">{tc as string}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-600">Date Range:</span>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className={cn("w-[280px] justify-start text-left font-normal h-9 text-sm", !dateRange.from && !dateRange.to && "text-muted-foreground") }>
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {dateRange.from ? (dateRange.to ? (<>{format(dateRange.from, "LLL dd, y")} - {format(dateRange.to, "LLL dd, y")}</>) : (format(dateRange.from, "LLL dd, y"))) : (<span>Pick a date range</span>)}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar initialFocus mode="range" defaultMonth={dateRange.from} selected={dateRange} onSelect={(range: any) => setDateRange({ from: range?.from, to: range?.to })} numberOfMonths={2} />
                          <div className="p-3 border-t"><Button variant="outline" size="sm" onClick={() => setDateRange({ from: undefined, to: undefined })} className="w-full">Clear dates</Button></div>
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => loadReports(selectedPatient)}
                      disabled={isLoading}
                      className="h-9"
                    >
                      <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
                    </Button>
                    <Badge variant="outline" className="text-xs">{filteredReports.length} Reports</Badge>
                    <Badge variant="secondary" className="text-xs">{sortedBiomarkers.length} Tests</Badge>
                  </div>
                </div>
              </div>
            )}

            {/* Table - Only show if a patient is selected */}
            {!selectedPatient ? (
              <Card>
                <CardContent className="py-10 flex items-center justify-center gap-2 text-gray-600">
                  <div className="text-center">
                    <p className="text-lg font-medium mb-2">Select a Patient</p>
                    <p className="text-sm text-gray-500">Choose a patient above to view their biomarker reports</p>
                  </div>
                </CardContent>
              </Card>
            ) : isLoading ? (
              <Card>
                <CardContent className="py-10 flex items-center justify-center gap-2 text-gray-600">
                  <Loader2 className="h-5 w-5 animate-spin" /> Loading reports...
                </CardContent>
              </Card>
            ) : reports.length === 0 ? (
              <Card>
                <CardContent className="py-10 flex items-center justify-center gap-2 text-gray-600">
                  <div className="text-center">
                    <p className="text-lg font-medium mb-2">No Reports Found</p>
                    <p className="text-sm text-gray-500">No biomarker reports found for the selected patient</p>
                  </div>
                </CardContent>
              </Card>
            ) : sortedBiomarkers.length === 0 ? (
              <Card>
                <CardContent className="py-10 flex items-center justify-center gap-2 text-gray-600">
                  <div className="text-center">
                    <p className="text-lg font-medium mb-2">No Biomarkers Found</p>
                    <p className="text-sm text-gray-500">The selected patient has no biomarker data in their reports</p>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card className="shadow-sm border border-gray-200">
                <CardContent className="p-0">
                  <div className={cn("overflow-x-auto", isSidebarOpen ? "max-h-[calc(100vh-200px)]" : "max-h-[calc(100vh-200px)]")}>
                    <table className={cn("w-full border-collapse bg-white text-sm", isSidebarOpen ? "min-w-full" : "min-w-full")}>
                      <thead className="sticky top-0 z-10">
                        <tr className="bg-gray-50 border-b-2 border-gray-300">
                          {/* First Column - Biomarker */}
                          <th className={cn("text-left p-3 font-medium text-gray-900 border-r-2 border-gray-300 sticky left-0 bg-gray-50 z-20", isSidebarOpen ? "min-w-[140px]" : "min-w-[180px]")}>Biomarker</th>
                          {sortedDates.map((dateIso) => (
                            <th key={dateIso} className={cn("text-center p-3 font-medium text-gray-900 border-r border-gray-300", isSidebarOpen ? "min-w-[100px]" : "min-w-[120px]")}>{formatDate(dateIso)}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {Array.from(filteredCategories).map((category) => (
                          <React.Fragment key={`category-${category}`}>
                            <tr className="bg-gray-25 border-b-2 border-gray-200">
                              <td colSpan={sortedDates.length + 1} className="p-2 font-medium text-gray-700 text-xs uppercase tracking-wide">{category as string}</td>
                            </tr>
                            {sortedBiomarkers.filter((name) => (categoryToNames.get(category as string)?.has(name))).map((name) => (
                              <tr key={`${category}-${name}`} className="border-b border-gray-200 hover:bg-gray-25">
                                <td className={cn("p-3 border-r-2 border-gray-300 sticky left-0 bg-white z-10", isSidebarOpen ? "min-w-[140px]" : "min-w-[180px]")}>
                                  <div className="font-medium text-gray-900 text-sm">{name}</div>
                                  {(() => {
                                    const rr = nameRefRange.get(`${name}|||${category}`)
                                    return rr ? <div className="text-xs text-gray-500 mt-1">Normal: {rr}</div> : null
                                  })()}
                                </td>
                                {sortedDates.map((dateIso) => {
                                  const key = `${name}|||${category}`
                                  const cell = dateToCells.get(dateIso)?.get(key)
                                  const rr = nameRefRange.get(key)
                                  return (
                                    <td key={`${name}-${dateIso}`} className={cn("p-3 text-center border-r border-gray-200", isSidebarOpen ? "min-w-[100px]" : "min-w-[120px]", getCellBackgroundColor(cell, rr))}>
                                      {cell && cell.value !== "" ? (
                                        <div className="font-medium text-gray-900">
                                          {cell.value}
                                          {cell.unit && <span className="text-gray-600 ml-1">{cell.unit}</span>}
                                        </div>
                                      ) : (
                                        <span></span>
                                      )}
                                    </td>
                                  )
                                })}
                              </tr>
                            ))}
                          </React.Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* Patient Context Sidebar */}
        {selectedPatient && (
          <div className={cn(
            "bg-white shadow-lg transition-all duration-300 overflow-hidden flex flex-col flex-none",
            isSidebarOpen ? "w-72 border-l border-gray-200" : "w-0 border-l-0"
          )}>
            {/* Sidebar Header */}
            <div className="p-4 border-b border-gray-200 bg-gray-50 flex-shrink-0">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-gray-800">Patient Context</h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                  className="h-8 w-8 p-0"
                >
                  {isSidebarOpen ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            {/* Scrollable Content Area */}
            <div className="overflow-y-auto flex-1 scrollbar-hide">
              {/* Patient Information */}
              <div className="p-4 border-b border-gray-200">
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-gray-500" />
                    <span className="text-sm font-medium text-gray-900">
                      {selectedPatient.firstname} {selectedPatient.lastname}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CalendarIcon2 className="h-4 w-4 text-gray-500" />
                    <span className="text-sm text-gray-600">{selectedPatient.age} years old</span>
                  </div>
                  {selectedPatient.gender && (
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-gray-500" />
                      <span className="text-sm text-gray-600">{selectedPatient.gender}</span>
                    </div>
                  )}
                  {selectedPatient.email && (
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-gray-500" />
                      <span className="text-sm text-gray-600">{selectedPatient.email}</span>
                    </div>
                  )}
                  {selectedPatient.phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-gray-500" />
                      <span className="text-sm text-gray-600">{selectedPatient.phone}</span>
                    </div>
                  )}
                  {selectedPatient.dob && (
                    <div className="flex items-center gap-2">
                      <CalendarIcon2 className="h-4 w-4 text-gray-500" />
                      <span className="text-sm text-gray-600">
                        DOB: {new Date(selectedPatient.dob).toLocaleDateString()}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Last SOAP Note */}
              {lastSoapNote && (
                <div className="p-4">
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-blue-600" />
                      <h4 className="font-medium text-gray-900">Last SOAP Note</h4>
                    </div>
                    
                    <div className="text-xs text-gray-500 mb-3">
                      {new Date(lastSoapNote.created_at).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      })}
                    </div>
                    
                    <div className="space-y-3">
                      <div className="pt-2 border-t border-gray-100">
                        <span className="text-xs font-medium text-gray-700">Chief Complaint:</span>
                        <div className="text-sm text-gray-600 mt-1 p-2 bg-gray-50 rounded border">
                          {formatSoapData(lastSoapNote.soap_data?.subjective?.CC)}
                        </div>
                      </div>
                      
                      <div className="pt-2 border-t border-gray-100">
                        <span className="text-xs font-medium text-gray-700">Assessment:</span>
                        <div className="text-sm text-gray-600 mt-1 p-2 bg-gray-50 rounded border">
                          {lastSoapNote.soap_data?.assessment || 'No assessment available'}
                        </div>
                      </div>
                      
                      <div className="pt-2 border-t border-gray-100">
                        <span className="text-xs font-medium text-gray-700">Summary:</span>
                        <div className="text-sm text-gray-600 mt-1 p-2 bg-gray-50 rounded border text-justify">
                          {lastSoapNote.summary || 'No summary available'}
                        </div>
                      </div>
                    </div>
                    
                    <div className="pt-2 border-t border-gray-100">
                      <Button variant="outline" size="sm" className="w-full" onClick={() => { setSelectedNote(lastSoapNote); setIsViewModalOpen(true); }}>
                        View Full SOAP Note
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Sidebar Toggle Button (when collapsed) */}
        {selectedPatient && !isSidebarOpen && (
          <div className="fixed right-2 top-1/2 transform -translate-y-1/2 z-30">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsSidebarOpen(true)}
              className="h-10 w-10 p-0 rounded-full shadow-lg"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

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
                          {formatSubjective(selectedNote.soap_data?.subjective)}
                        </pre>
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
                        <pre className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">
                          {formatObjective(selectedNote.soap_data?.objective)}
                        </pre>
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
                        <pre className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">
                          {formatPlan(selectedNote.soap_data?.plan)}
                        </pre>
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
  )
}
