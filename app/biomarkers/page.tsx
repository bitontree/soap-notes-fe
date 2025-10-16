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
interface BiomarkerReading { timestamp: string; result_value: string; unit?: string | null; status?: string | null }
interface Biomarker { name: string; result_value?: string; unit?: string | null; reference_range?: string | null; status?: string | null; category?: string | null; readings?: BiomarkerReading[] }
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
  series?: { t: number; v: number; rawTime: string }[]
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
  const [trendView, setTrendView] = useState<{
    name: string
    category: string
    dateIso: string
    unit?: string | null
    series: { t: number; v: number; rawTime: string }[]
  } | null>(null)
  const [trendHover, setTrendHover] = useState<{ x: number; y: number; t: number; v: number } | null>(null)

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
        // Fetch SOAP notes with pagination to avoid missing later entries
        const PAGE_SIZE = 50
        const MAX_PAGES = 20 // safety cap (1000 notes)
        let page = 1
        const allNotes: any[] = []
        // Fetch pages until exhausted or safety cap reached
        // This keeps the logic simple while ensuring we don't miss recent notes
        while (page <= MAX_PAGES) {
          const pageData = await soapApi.getNotes(page, PAGE_SIZE)
          const current = pageData?.soap_notes || []
          allNotes.push(...current)
          if (current.length < PAGE_SIZE) break
          page += 1
        }

        const patientNotes = allNotes.filter((note: any) => 
          note.patient_name?.toLowerCase().includes(selectedPatient.firstname.toLowerCase()) ||
          note.patient_name?.toLowerCase().includes(selectedPatient.lastname.toLowerCase())
        )
        
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
      const patientId = patient.id

      // Build params including optional date range filters (backend expects yyyy-MM-dd)
      const params: any = { page: 1, limit: 100, patient_id: patientId }
      if (dateRange.from) params.test_date_from = format(dateRange.from, "yyyy-MM-dd")
      if (dateRange.to) params.test_date_to = format(dateRange.to, "yyyy-MM-dd")

      const res = await fetchReports(params)
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

  // Reload reports when date range changes for the currently selected patient
  useEffect(() => {
    // only load when a patient is selected
    if (!selectedPatient) return
    loadReports(selectedPatient)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange.from, dateRange.to])

  // Robust date normalization: tries many formats; only falls back to created_at if test_date missing
  const normalizeTestDate = (dateStr?: string, createdAtIso?: string): string | undefined => {
    const raw = (dateStr || "").trim()
    if (!raw) return createdAtIso // only fall back when test_date is absent

    // Candidate strings: try raw and common separator replacements
    const candidates = Array.from(new Set([
      raw,
      raw.replace(/\./g, "/"),
      raw.replace(/-/g, "/"),
      raw.replace(/_/g, "/"),
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
    if (cell.series && cell.series.length > 0) return "bg-gray-50" // keep neutral for trend cells
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

    const hasMeaningfulValue = (v: unknown) => {
      if (v === null || v === undefined) return false
      const s = String(v).trim()
      return s.length > 0 // treats "0", "Negative", "No signal" as valid
    }

    for (const rpt of filteredReports) {
      const reportIso = normalizeTestDate(rpt.test_date, (rpt.created_at || "").split("T")[0])
      const createdAtMs = rpt.created_at ? Date.parse(rpt.created_at) || 0 : 0

      let addedForThisReport = 0
      for (const bm of rpt.biomarkers || []) {
        const nName = normalizeName(bm.name)
        const nCat = normalizeCategory(bm.category)
        if (!nName) continue
        if (!categoryToNames.has(nCat)) categoryToNames.set(nCat, new Set())
        categoryToNames.get(nCat)!.add(nName)

        const key = `${nName}|||${nCat}`

        // Handle continuous readings if present
        if (Array.isArray(bm.readings) && bm.readings.length > 0) {
          // Bucket readings by their own date (yyyy-MM-dd)
          const buckets = new Map<string, { t: number; v: number; rawTime: string }[]>()
          for (const rd of bm.readings) {
            if (!rd?.timestamp || rd.result_value == null) continue
            const t = Date.parse(rd.timestamp)
            if (isNaN(t)) continue
            const v = Number(String(rd.result_value).replace(/,/g, ""))
            if (isNaN(v)) continue
            const dIso = format(new Date(t), "yyyy-MM-dd")
            if (!buckets.has(dIso)) buckets.set(dIso, [])
            buckets.get(dIso)!.push({ t, v, rawTime: rd.timestamp })
          }
          // Sort each bucket by time and store as series in cells
          for (const [dIso, arr] of buckets.entries()) {
            if (!dateToCells.has(dIso)) dateToCells.set(dIso, new Map())
            const cellMap = dateToCells.get(dIso)!
            arr.sort((a, b) => a.t - b.t)
            const prev = cellMap.get(key)
            const nextCell: AggregatedCell = {
              value: "", // trend only in table cell
              unit: bm.unit ?? (bm.readings[0]?.unit ?? null),
              status: bm.status ?? null,
              reference_range: bm.reference_range ?? undefined,
              createdAtMs,
              series: arr,
            }
            if (!prev || nextCell.createdAtMs >= prev.createdAtMs) {
              cellMap.set(key, nextCell)
              addedForThisReport += 1
            }
            if (!nameRefRange.has(key) && bm.reference_range) nameRefRange.set(key, bm.reference_range)
            dateSet.add(dIso)
          }
          continue
        }

        // Fallback: discrete value handling (standard reports)
        const iso = reportIso
        if (!iso) continue
        if (!dateToCells.has(iso)) dateToCells.set(iso, new Map())
        const cellMap = dateToCells.get(iso)!

        const hasContent = hasMeaningfulValue(bm.result_value) || hasMeaningfulValue(bm.unit) || hasMeaningfulValue(bm.status) || hasMeaningfulValue(bm.reference_range)
        if (!hasContent) continue
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
          addedForThisReport += 1
        }
        if (!nameRefRange.has(key) && bm.reference_range) nameRefRange.set(key, bm.reference_range)
        dateSet.add(iso)
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

  // Loading skeletons for table and tiny sparklines
  const SparklineSkeleton = () => (
    <svg width={100} height={20} className="opacity-60 animate-pulse">
      <defs>
        <linearGradient id="sk-grad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#e5e7eb" />
          <stop offset="50%" stopColor="#f3f4f6" />
          <stop offset="100%" stopColor="#e5e7eb" />
        </linearGradient>
      </defs>
      <path d="M5,15 L25,5 L45,10 L65,6 L85,12" stroke="url(#sk-grad)" strokeWidth="3" fill="none" strokeLinecap="round" />
    </svg>
  )

  const renderSkeletonTable = () => {
    const placeholderRows = Array.from({ length: 8 })
    const placeholderCols = Array.from({ length: 6 }) // biomarker + 5 dates
    return (
      <Card className="shadow-sm border border-gray-200">
        <CardContent className="p-0">
          <div className="w-full max-w-full overflow-x-auto">
            <table className="w-full border-separate border-spacing-0 bg-white text-sm">
              <thead className="sticky top-0 z-20">
                <tr className="bg-gray-50 border-b-2 border-gray-300">
                  {placeholderCols.map((_, i) => (
                    <th key={`skh-${i}`} className={cn("text-left p-3 font-medium text-gray-900 border-r border-gray-200", i === 0 ? "min-w-[160px]" : "min-w-[120px]")}>{i === 0 ? "Biomarker" : ""}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {placeholderRows.map((_, r) => (
                  <tr key={`skr-${r}`} className="border-b border-gray-200">
                    {placeholderCols.map((_, c) => (
                      <td key={`skc-${r}-${c}`} className={cn("p-3 border-r border-gray-200", c === 0 ? "min-w-[160px]" : "min-w-[120px]")}>
                        {c === 0 ? (
                          <div className="h-4 w-40 bg-gray-200 rounded animate-pulse" />
                        ) : (
                          <div className="flex items-center justify-center">
                            <SparklineSkeleton />
                          </div>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Render the biomarker reports table (and its empty/loading states)
  const renderTable = () => {
    if (!selectedPatient) {
      return (
        <Card className="min-h-[400px]">
          <CardContent className="py-10 flex items-center justify-center gap-2 text-gray-600">
            <div className="text-center">
              <p className="text-lg font-medium mb-2">Select a Patient</p>
              <p className="text-sm text-gray-500">Choose a patient above to view their biomarker reports</p>
            </div>
          </CardContent>
        </Card>
      )
    }

    if (isLoading) {
      return renderSkeletonTable()
    }

    if (reports.length === 0) {
      return (
        <Card className="min-h-[400px]">
          <CardContent className="py-10 flex items-center justify-center gap-2 text-gray-600">
            <div className="text-center">
              <p className="text-lg font-medium mb-2">No Reports Found</p>
              <p className="text-sm text-gray-500">No biomarker reports found for the selected patient</p>
            </div>
          </CardContent>
        </Card>
      )
    }

    if (sortedBiomarkers.length === 0) {
      return (
        <Card className="min-h-[400px]">
          <CardContent className="py-10 flex items-center justify-center gap-2 text-gray-600">
            <div className="text-center">
              <p className="text-lg font-medium mb-2">No Biomarkers Found</p>
              <p className="text-sm text-gray-500">The selected patient has no biomarker data in their reports</p>
            </div>
          </CardContent>
        </Card>
      )
    }

    return (
      <Card className="shadow-sm border border-gray-200">
        <CardContent className="p-0">
          <div className={cn("w-full max-w-full overflow-x-auto", isSidebarOpen ? "max-h-[calc(100vh-200px)]" : "max-h-[calc(100vh-200px)]")}>
            <table className={cn("w-full border-separate border-spacing-0 bg-white text-sm", isSidebarOpen ? "min-w-full" : "min-w-full")}> 
              <thead className="sticky top-0 z-20">
                <tr className="bg-gray-50 border-b-2 border-gray-300">
                  {/* First Column - Biomarker */}
                  <th className={cn("text-left p-3 font-medium text-gray-900 border-r-2 border-gray-300 sticky left-0 bg-gray-50 z-30", isSidebarOpen ? "min-w-[140px]" : "min-w-[180px]")}>Biomarker</th>
                  {sortedDates.map((dateIso) => (
                    <th key={dateIso} className={cn("text-center p-3 font-medium text-gray-900 border-r border-gray-300", isSidebarOpen ? "min-w-[100px]" : "min-w-[120px]")}>{formatDate(dateIso)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from(filteredCategories).map((category) => (
                  <React.Fragment key={`category-${category}`}>
                    <tr className="bg-gray-25 border-b-2 border-gray-200">
                      {/* Sticky category label in first column */}
                      <td className={cn("p-2 font-medium text-gray-700 text-xs uppercase tracking-wide sticky left-0 bg-white z-10 border-r-2 border-gray-300", isSidebarOpen ? "min-w-[140px]" : "min-w-[180px]")}>{category as string}</td>
                      {/* Spacer cell spanning all date columns to preserve layout */}
                      <td colSpan={sortedDates.length} className="p-0"></td>
                    </tr>
                    {sortedBiomarkers.filter((name) => (categoryToNames.get(category as string)?.has(name))).map((name) => (
                      <tr key={`${category}-${name}`} className="border-b border-gray-200 hover:bg-gray-25">
                        <td className={cn("p-3 border-r-2 border-b border-gray-300 sticky left-0 bg-white z-10", isSidebarOpen ? "min-w-[140px]" : "min-w-[180px]")}>
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
                            <td key={`${name}-${dateIso}`} className={cn("p-3 text-center border-r border-b min-w-[120px] border-gray-200", getCellBackgroundColor(cell, rr))}>
                              {cell?.series && cell.series.length > 1 ? (
                                <button
                                  className="w-full h-10 flex items-center justify-center"
                                  onClick={() => {
                                    setTrendView({ name, category: String(category), dateIso, unit: cell.unit, series: cell.series! })
                                  }}
                                  aria-label="View trend"
                                >
                                  {(() => {
                                    const s = cell.series!
                                    const w = 100, h = 28, pad = 2
                                    const xs = s.map(p => p.t)
                                    const ys = s.map(p => p.v)
                                    const minX = Math.min(...xs), maxX = Math.max(...xs)
                                    const minY = Math.min(...ys), maxY = Math.max(...ys)
                                    const scaleX = (t: number) => minX === maxX ? w/2 : pad + (t - minX) * (w - 2*pad) / (maxX - minX)
                                    const scaleY = (v: number) => {
                                      if (minY === maxY) return h/2
                                      const y = pad + (v - minY) * (h - 2*pad) / (maxY - minY)
                                      return h - y
                                    }
                                    const d = s.map((p, i) => `${i === 0 ? 'M' : 'L'}${scaleX(p.t)},${scaleY(p.v)}`).join(' ')
                                    return (
                                      <svg width={w} height={h} className="text-blue-600">
                                        <path d={d} fill="none" stroke="currentColor" strokeWidth="1.5" />
                                      </svg>
                                    )
                                  })()}
                                </button>
                              ) : cell?.series && cell.series.length === 1 ? (
                                <div className="font-medium text-gray-900">
                                  {String(cell.series[0].v)}
                                  {cell.unit && <span className="text-gray-600 ml-1">{cell.unit}</span>}
                                </div>
                              ) : cell && cell.value !== "" ? (
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
    )
  }

  return (
    <div>
      <Header title="Biomarkers" description="Explore biomarker measurements over time" />
      
      {/* Main Layout with Sidebar */}
      <div className="flex h-[calc(100vh-120px)] flex-1 overflow-hidden">
        {/* Main Content Area */}
        <div className={cn("flex-1 min-w-0 transition-all duration-300 overflow-y-auto scrollbar-hide", isSidebarOpen ? "mr-4" : "mr-0")}>
          <div className="space-y-6 w-full p-6 min-h-[calc(100vh-200px)]">
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
                <div className={cn(isSidebarOpen ? "grid grid-cols-1 gap-3" : "flex flex-wrap items-center justify-between gap-3")}> 
                  <div className={cn("flex items-center gap-4", isSidebarOpen ? "col-span-1 w-full flex-nowrap" : "flex-wrap min-w-0")}> 
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

                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className="text-sm text-gray-600">Date Range:</span>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className={cn(isSidebarOpen ? "w-full" : "w-[280px] max-w-full", "justify-start text-left font-normal h-9 text-sm", !dateRange.from && !dateRange.to && "text-muted-foreground") }>
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {dateRange.from ? (dateRange.to ? (<>{format(dateRange.from, "LLL dd, y")} - {format(dateRange.to, "LLL dd, y")}</>) : (format(dateRange.from, "LLL dd, y"))) : (<span>Pick a date range</span>)}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start" side="bottom" sideOffset={4} avoidCollisions={true}>
                          <Calendar
                            initialFocus
                            mode="range"
                            captionLayout="dropdown"
                            fromMonth={new Date(1900, 0, 1)}
                            toMonth={new Date()}
                            defaultMonth={dateRange.from}
                            selected={dateRange}
                            onSelect={(range: any) => setDateRange({ from: range?.from, to: range?.to })}
                            numberOfMonths={isSidebarOpen ? 1 : 2}
                            disabled={(date) => date > new Date()}
                          />
                          <div className="p-3 border-t"><Button variant="outline" size="sm" onClick={() => setDateRange({ from: undefined, to: undefined })} className="w-full">Clear dates</Button></div>
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>
                  <div className={cn("flex gap-2 shrink-0", isSidebarOpen && "col-span-1 order-2 justify-start place-self-start w-full")}> 
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
            {renderTable()}
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

      {/* Biomarker Trend Modal (state-driven) */}
      <Dialog open={Boolean(trendView)} onOpenChange={(open) => { if (!open) setTrendView(null) }}>
        <DialogContent className="max-w-7xl w-[90vw]">
          {trendView && (() => {
            const { name, dateIso, unit, series } = trendView
            const w = 1200, h = 360, padL = 56, padR = 18, padT = 12, padB = 42
            const xs = series.map((p: any) => p.t)
            const ys = series.map((p: any) => p.v)
            const minX = Math.min(...xs), maxX = Math.max(...xs)
            const rawMinY = Math.min(...ys), rawMaxY = Math.max(...ys)
            const yRange = Math.max(1, rawMaxY - rawMinY)
            const yPad = yRange * 0.08
            const minY = rawMinY - yPad
            const maxY = rawMaxY + yPad
            const sx = (t: number) => padL + (t - minX) * (w - padL - padR) / Math.max(1, (maxX - minX))
            const sy = (v: number) => padT + (maxY - v) * (h - padT - padB) / Math.max(1, (maxY - minY))
            const d = series.map((p: any, i: number) => `${i === 0 ? 'M' : 'L'}${sx(p.t)},${sy(p.v)}`).join(' ')
            // Build ticks only from actual data values/times (sampled to keep it readable)
            const uniq = <T,>(arr: T[]) => Array.from(new Set(arr))
            const pickSpaced = (arr: number[], count: number) => {
              if (arr.length <= count) return arr
              const res: number[] = []
              for (let i = 0; i < count; i++) {
                const idx = Math.round(i * (arr.length - 1) / (count - 1))
                res.push(arr[idx])
              }
              return Array.from(new Set(res))
            }
            // Y labels: always include the true minimum from data as the first tick
            const uniqY = uniq(ys).sort((a,b)=>a-b)
            const rest = uniqY.filter(v => v !== rawMinY)
            const yVals = [rawMinY, ...pickSpaced(rest, 4)]
            // X ticks: start at the lowest reading time, then every full hour thereafter, ending at next full hour after max
            const ceilToHour = (ms: number) => { const d = new Date(ms); const p = d.getMinutes() !== 0 || d.getSeconds() !== 0 || d.getMilliseconds() !== 0; d.setMinutes(0,0,0); if (p) d.setHours(d.getHours()+1); return d.getTime() }
            // Ensure the axis ends at a round hour strictly greater than the highest reading time
            let endHour = ceilToHour(maxX)
            const maxDate = new Date(maxX)
            if (maxDate.getMinutes() === 0 && maxDate.getSeconds() === 0 && maxDate.getMilliseconds() === 0) {
              endHour += 60 * 60 * 1000
            }
            const hourMs = 60 * 60 * 1000
            const halfHourMs = 30 * 60 * 1000
            const startHour = ceilToHour(minX)
            // Adaptive tick step: if the total time window is small, use 30 minutes for better readability
            const totalSpanMs = Math.max(0, endHour - startHour)
            const stepMs = totalSpanMs <= 4 * hourMs ? halfHourMs : hourMs
            const floorToStep = (ms: number, step: number) => {
              const d = new Date(ms)
              const minutes = d.getMinutes()
              const stepMin = Math.max(1, Math.round(step / 60000))
              const delta = minutes % stepMin
              d.setMinutes(minutes - delta, 0, 0)
              return d.getTime()
            }
            const startTick = floorToStep(minX, stepMs)
            const xVals: number[] = []
            for (let t = startTick; t <= endHour; t += stepMs) xVals.push(t)
            const clamp = (x: number, min: number, max: number) => Math.max(min, Math.min(max, x))
            return (
              <div className="space-y-2">
                <div className="font-semibold">{name} · {new Date(dateIso).toLocaleDateString()} {unit ? `(${unit})` : ""}</div>
                <div className="overflow-x-auto">
                  <svg
                    width="100%"
                    height={h}
                    viewBox={`0 0 ${w} ${h}`}
                    className="text-blue-600"
                    onMouseMove={(e) => {
                      const svg = e.currentTarget
                      const rect = svg.getBoundingClientRect()
                      const mouseX = (e.clientX - rect.left) * (w / rect.width)
                      // Invert sx to time
                      const t = minX + (mouseX - padL) * Math.max(1, (maxX - minX)) / Math.max(1, (w - padL - padR))
                      // Find nearest series point
                      let nearest = series[0]
                      let best = Infinity
                      for (const p of series) {
                        const dx = Math.abs(p.t - t)
                        if (dx < best) { best = dx; nearest = p as any }
                      }
                      setTrendHover({ x: sx((nearest as any).t), y: sy((nearest as any).v), t: (nearest as any).t, v: (nearest as any).v })
                    }}
                    onMouseLeave={() => setTrendHover(null)}
                  >
                    {/* Y labels only (no background grid) */}
                    {yVals.map((yv, i) => (
                      <text key={`yl-${i}`} x={padL - 8} y={sy(yv) + 3} textAnchor="end" fontSize="11" fill="#6b7280">{Math.round(yv)}</text>
                    ))}
                    {/* X labels only; clamp first/last inside chart to avoid overflow */}
                    {xVals.map((xv, i) => {
                      // Omit the first label at origin and hide the very last label at the right edge
                      if (i === 0 || i === xVals.length - 1) return null
                      const cx = i === 0 ? Math.max(padL, sx(xv)) : clamp(sx(xv), padL + 22, w - padR - 22)
                      const anchor = 'middle'
                      return (
                        <g key={`xl-${i}`}>
                          <line x1={cx} y1={h - padB - 3} x2={cx} y2={h - padB + 3} stroke="#1d4ed8" strokeWidth="1.5" />
                          <text x={cx} y={h - padB + 14} textAnchor={anchor as any} fontSize="11" fill="#6b7280">{new Date(xv).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</text>
                        </g>
                      )
                    })}
                    {/* Axis */}
                    <line x1={padL} y1={padT} x2={padL} y2={h - padB} stroke="#9ca3af" />
                    <line x1={padL} y1={h - padB} x2={w - padR} y2={h - padB} stroke="#9ca3af" />
                    {/* Line */}
                    <path d={d} fill="none" stroke="currentColor" strokeWidth="2.25" />
                    {/* Points */}
                    {series.map((p: any, idx: number) => (
                      <g key={`pt-${idx}`}>
                        <circle cx={sx(p.t)} cy={sy(p.v)} r={2.5} fill="#ffffff" stroke="currentColor" strokeWidth="1.5" />
                        <title>{`${new Date(p.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • ${p.v}${unit ? ` ${unit}` : ''}`}</title>
                      </g>
                    ))}
                    {/* Hover guideline and marker */}
                    {trendHover && (() => {
                      const tipW = 140
                      const tipH = 28
                      const gap = 8
                      // Prefer showing tooltip on the right; if it would overflow, show on the left
                      let tx = trendHover.x + gap
                      if (tx + tipW > w - padR) tx = trendHover.x - tipW - gap
                      // Keep tooltip vertically within the chart
                      let ty = trendHover.y - 20
                      if (ty < padT + 4) ty = padT + 4
                      if (ty + tipH > h - padB - 4) ty = h - padB - tipH - 4
                      return (
                        <g pointerEvents="none">
                          <line x1={trendHover.x} y1={padT} x2={trendHover.x} y2={h - padB} stroke="#93c5fd" strokeWidth="1" strokeDasharray="3,3" />
                          <circle cx={trendHover.x} cy={trendHover.y} r={4} fill="#1d4ed8" stroke="#fff" strokeWidth="1.5" />
                          <rect x={tx} y={ty} width={tipW} height={tipH} rx="4" fill="#111827" opacity="0.9" />
                          <text x={tx + 8} y={ty + 18} fontSize="11" fill="#f9fafb">
                            {new Date(trendHover.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {trendHover.v}{unit ? ` ${unit}` : ''}
                          </text>
                        </g>
                      )
                    })()}
                  </svg>
                </div>
              </div>
            )
          })()}
        </DialogContent>
      </Dialog>
    </div>
  )
}
