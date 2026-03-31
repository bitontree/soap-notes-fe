"use client"

import React, { useState, useEffect, useMemo } from "react"
import { Header } from "@/components/layout/header"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Search,
  Calendar,
  FileText,
  Activity,
  ShieldCheck,
  ShieldAlert,
  Loader2,
  ExternalLink,
  ChevronRight,
  User,
  History,
  Receipt
} from "lucide-react"
import { soapApi, billingCodesApi, billsApi, fetchReports, type ICDBillingCodeItem } from "@/lib/api"
import { useToast } from "@/hooks/use-toast"
import { useAuth } from "@/contexts/auth-context"
import PatientSelector from "@/components/patient-selector"
import ClaimCopilot from "@/components/insurance/claim-copilot"

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

export default function InsuranceClaimsPage() {
  const { user } = useAuth()
  const { toast } = useToast()
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null)

  const [isLoading, setIsLoading] = useState(false)
  const [soapNotes, setSoapNotes] = useState<any[]>([])
  const [healthReports, setHealthReports] = useState<any[]>([])
  const [savedCodes, setSavedCodes] = useState<ICDBillingCodeItem[]>([])

  const [activeTab, setActiveTab] = useState("soap-notes")
  const [pastBills, setPastBills] = useState<any[]>([])
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null)
  const [showAnalysis, setShowAnalysis] = useState(false)
  const [expandedBillId, setExpandedBillId] = useState<string | null>(null)

  // Fetch all patient data when selectedPatient changes
  useEffect(() => {
    if (selectedPatient && user) {
      loadPatientData()
    } else {
      setSoapNotes([])
      setHealthReports([])
      setSavedCodes([])
      setPastBills([])
      setSelectedSourceId(null)
      setShowAnalysis(false)
    }
  }, [selectedPatient, user])

  const loadPatientData = async () => {
    if (!selectedPatient || !user) return

    setIsLoading(true)
    try {
      const userId = user.id || (user as any)._id

      const [notesResp, reportsResp, codesResp, billsResp] = await Promise.all([
        soapApi.getNotes({ patientId: selectedPatient.id, limit: 50 }),
        fetchReports({ patient_id: selectedPatient.id, limit: 100 }),
        billingCodesApi.getSavedCodesByPatient(selectedPatient.id, userId),
        billsApi.getPatientBills(selectedPatient.id)
      ])

      setSoapNotes(notesResp.soap_notes || [])
      setHealthReports(reportsResp.reports || [])
      setSavedCodes(codesResp || [])
      setPastBills(billsResp || [])

      // Auto-select latest SOAP note if available
      if (notesResp.soap_notes && notesResp.soap_notes.length > 0) {
        setSelectedSourceId(notesResp.soap_notes[0].id)
      }
    } catch (error: any) {
      console.error("Failed to load patient insurance data:", error)
      toast({
        title: "Error",
        description: error.message || "Failed to load patient records",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  // Temporary debug logging for claim matching
  useEffect(() => {
    if (pastBills.length > 0 && (soapNotes.length > 0 || healthReports.length > 0)) {
      console.log("🛠️ CLAIM DEBUG:", {
        billsCount: pastBills.length,
        notesCount: soapNotes.length,
        reportsCount: healthReports.length,
        firstBillNoteId: pastBills[0].soap_note_id,
        firstNoteId: soapNotes[0]?.id
      });
    }
  }, [pastBills, soapNotes, healthReports]);

  const formatDate = (dateString: string) => {
    if (!dateString) return "N/A"
    return new Date(dateString).toLocaleDateString()
  }

  // Robust ID and date matching helper
  const isMatch = (id1: any, id2: any, date1?: any, date2?: any) => {
    // 1. Check direct ID match (if both exist)
    if (id1 && id2) {
      const match = String(id1).trim().toLowerCase() === String(id2).trim().toLowerCase()
      if (match) return true
    }

    // 2. Falling back to date match (if IDs are missing but dates exist)
    if (date1 && date2) {
      try {
        const d1 = new Date(date1)
        const d2 = new Date(date2)
        
        // Match if same day
        const dayMatch = d1.toISOString().split('T')[0] === d2.toISOString().split('T')[0]
        if (dayMatch) return true

        // Safety Net: Match if within 26 hours (handles overnight/timezone shifts)
        const diffMs = Math.abs(d1.getTime() - d2.getTime())
        if (diffMs <= 26 * 60 * 60 * 1000) return true
      } catch (e) {
        // ignore date parse errors
      }
    }
    
    return false
  }

  // Filter saved codes by selected SOAP note or health report
  const filteredCodes = useMemo(() => {
    if (!selectedSourceId) return savedCodes
    return savedCodes.filter(c =>
      c.soap_note_id === selectedSourceId ||
      c.health_report_id === selectedSourceId
    )
  }, [savedCodes, selectedSourceId])

  const selectedSourceName = useMemo(() => {
    if (!selectedSourceId) return "All Saved Codes"
    const soap = soapNotes.find(n => n.id === selectedSourceId)
    if (soap) return `Codes for SOAP Note (${formatDate(soap.created_at)})`
    const report = healthReports.find(r => r.report_id === selectedSourceId)
    if (report) return `Codes for Health Report (${formatDate(report.test_date || report.created_at)})`
    return "Filtered Codes"
  }, [selectedSourceId, soapNotes, healthReports])

  // Check if the current selected source already has a claim
  const isSelectedSourceClaimed = useMemo(() => {
    if (!selectedSourceId) return false
    
    // Check SOAP notes
    const note = soapNotes.find(n => n.id === selectedSourceId)
    if (note) {
      return pastBills.some(bill => 
        isMatch(bill.soap_note_id, note.id, bill.form_details?.additional_info?.date_of_service || bill.created_at, note.created_at) ||
        isMatch(bill.form_details?.additional_info?.soap_note_id, note.id)
      )
    }
    
    // Check health reports
    const report = healthReports.find(r => r.report_id === selectedSourceId)
    if (report) {
      return pastBills.some(bill => 
        isMatch(bill.form_details?.additional_info?.health_report_id, report.report_id, bill.form_details?.additional_info?.date_of_service || bill.created_at, report.test_date || report.created_at) ||
        isMatch(bill.form_details?.additional_info?.report_id, report.report_id)
      )
    }
    
    return false
  }, [selectedSourceId, soapNotes, healthReports, pastBills])

  // Calculate current step for the stepper
  const currentStep = useMemo(() => {
    if (!selectedPatient) return 1
    if (selectedSourceId) return 3
    return 2
  }, [selectedPatient, selectedSourceId])

  return (

    <div className="flex flex-col min-h-screen bg-[#f8fafc]">
      <Header
        title="Insurance Claims"
        description="Streamlined workflow for processing patient insurance claims"
      />

      <div className="flex-1 overflow-y-auto px-4 py-8 md:px-8">
        <div className="max-w-4xl mx-auto space-y-8">

          {/* Progress Stepper */}
          <div className="w-full max-w-2xl mx-auto mb-10">
            <div className="flex items-center justify-between">
              {/* Step 1 */}
              <div className="flex flex-col items-center flex-shrink-0">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300
                  ${currentStep >= 1 ? "bg-blue-600 text-white shadow-lg scale-110" : "bg-white text-gray-400 border-2 border-gray-100"}
                `}>
                  <User className="h-5 w-5" />
                </div>
                <span className={`text-xs mt-2 font-medium ${currentStep >= 1 ? "text-blue-700" : "text-gray-400"}`}>Select Patient</span>
              </div>
              {/* Connector 1 */}
              <div className="flex-1 h-0.5 mx-2 md:mx-4 bg-gray-100 relative">
                <div className={`absolute left-0 top-0 h-full transition-all duration-500 ${currentStep > 1 ? "bg-blue-600 w-full" : "bg-gray-100 w-full"}`}></div>
              </div>
              {/* Step 2 */}
              <div className="flex flex-col items-center flex-shrink-0">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300
                  ${currentStep >= 2 ? "bg-blue-600 text-white shadow-lg scale-110" : "bg-white text-gray-400 border-2 border-gray-100"}
                `}>
                  <FileText className="h-5 w-5" />
                </div>
                <span className={`text-xs mt-2 font-medium ${currentStep >= 2 ? "text-blue-700" : "text-gray-400"}`}>Review Records</span>
              </div>
              {/* Connector 2 */}
              <div className="flex-1 h-0.5 mx-2 md:mx-4 bg-gray-100 relative">
                <div className={`absolute left-0 top-0 h-full transition-all duration-500 ${currentStep > 2 ? "bg-blue-600 w-full" : "bg-gray-100 w-full"}`}></div>
              </div>
              {/* Step 3 */}
              <div className="flex flex-col items-center flex-shrink-0">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300
                  ${currentStep >= 3 ? "bg-blue-600 text-white shadow-lg scale-110" : "bg-white text-gray-400 border-2 border-gray-100"}
                `}>
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <span className={`text-xs mt-2 font-medium ${currentStep >= 3 ? "text-blue-700" : "text-gray-400"}`}>Confirm Claim</span>
              </div>
            </div>
          </div>

          {/* Patient Selection Segment */}
          <div className="flex justify-center">
            <div className="w-full max-w-4xl transition-all duration-300">
              <PatientSelector
                selectedPatient={selectedPatient as any}
                onPatientSelect={(p) => setSelectedPatient(p as any)}
              />
            </div>
          </div>

          {selectedPatient ? (
            <div className="max-w-4xl mx-auto">
              {!showAnalysis ? (
                <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
                  {/* Left Column: Records (md: 7/12) */}
                  <div className="md:col-span-7 space-y-6">
                    <Card className="shadow-xl border-0 bg-white rounded-2xl overflow-hidden ring-1 ring-black/5 h-full min-h-[500px]">
                      <CardHeader className="pb-4 bg-white border-b">
                        <div className="flex items-center justify-between">
                          <div>
                            <CardTitle className="text-xl font-bold flex items-center gap-2 text-slate-900">
                              <FileText className="h-5 w-5 text-blue-600" /> Clinical History
                            </CardTitle>
                            <CardDescription className="text-slate-500 text-xs mt-1">
                              Review patient encounters and health reports
                            </CardDescription>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="p-0">
                        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                          <div className="pt-2 border-b bg-slate-50/50">
                            <TabsList className="grid w-full grid-cols-3 bg-slate-100/80 p-1 h-11 border-0 rounded-none shadow-sm">
                              <TabsTrigger value="soap-notes" className="data-[state=active]:bg-white data-[state=active]:text-blue-700 data-[state=active]:shadow-sm transition-all font-bold text-xs">
                                SOAP Notes
                              </TabsTrigger>
                              <TabsTrigger value="health-reports" className="data-[state=active]:bg-white data-[state=active]:text-blue-700 data-[state=active]:shadow-sm transition-all font-bold text-xs">
                                Health Reports
                              </TabsTrigger>
                              <TabsTrigger value="past-claims" className="data-[state=active]:bg-white data-[state=active]:text-blue-700 data-[state=active]:shadow-sm transition-all font-bold text-xs">
                                Past Claims
                              </TabsTrigger>
                            </TabsList>
                          </div>

                          <TabsContent value="soap-notes" className="m-0 focus-visible:outline-none animate-in fade-in duration-300">
                            {isLoading ? (
                              <div className="flex justify-center py-20">
                                <Loader2 className="h-10 w-10 animate-spin text-blue-500" />
                              </div>
                            ) : soapNotes.length > 0 ? (
                              <div className="overflow-hidden">
                                <Table>
                                  <TableHeader>
                                    <TableRow className="border-b bg-slate-50/30 hover:bg-slate-50/30">
                                      <TableHead className="w-[110px] px-4 py-4 text-xs uppercase tracking-widest font-bold text-slate-500">Date</TableHead>
                                      <TableHead className="px-4 py-4 text-xs uppercase tracking-widest font-bold text-slate-500">Assessment</TableHead>
                                      <TableHead className="text-right px-4 py-4 text-xs uppercase tracking-widest font-bold text-slate-500">Action</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {soapNotes.map((note) => {
                                      const hasClaim = pastBills.some(bill => 
                                        isMatch(bill.soap_note_id, note.id, bill.form_details?.additional_info?.date_of_service || bill.created_at, note.created_at) ||
                                        isMatch(bill.form_details?.additional_info?.soap_note_id, note.id)
                                      );
                                      return (
                                        <TableRow
                                          key={note.id}
                                          className={`
                                            transition-all duration-300 border-b last:border-0
                                            ${hasClaim 
                                              ? (selectedSourceId === note.id ? "bg-blue-50/60 ring-1 ring-inset ring-blue-100/50 cursor-pointer" : "bg-slate-50/40 hover:bg-slate-50/60 cursor-pointer") 
                                              : (selectedSourceId === note.id ? "bg-blue-50/60 ring-1 ring-inset ring-blue-100/50 cursor-pointer" : "hover:bg-slate-50/80 cursor-pointer")
                                            }
                                          `}
                                          onClick={() => {
                                            setSelectedSourceId(note.id)
                                          }}
                                        >
                                          <TableCell className="px-4 py-3 font-mono text-[10px] text-slate-600">
                                            {formatDate(note.created_at)}
                                          </TableCell>
                                          <TableCell className="px-4 py-4">
                                            <div className="line-clamp-1 text-sm text-slate-700 font-medium max-w-[240px]">
                                              {note.soap_data.assessment || note.summary || "No clinical description"}
                                            </div>
                                          </TableCell>
                                          <TableCell className="text-right px-4 py-3">
                                            <div className="flex items-center justify-end gap-1">
                                              {hasClaim ? (
                                                <span className="text-[9px] font-black tracking-widest uppercase text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md border border-emerald-100 flex items-center gap-1 shadow-sm">
                                                  CLAIMED
                                                </span>
                                              ) : (
                                                <div className={`
                                                  w-7 h-7 rounded-full flex items-center justify-center transition-all
                                                  ${selectedSourceId === note.id ? "bg-blue-600 text-white shadow-sm" : "bg-slate-100 text-slate-400"}
                                                `}>
                                                  <ChevronRight className="h-3.5 w-3.5" />
                                                </div>
                                              )}
                                            </div>
                                          </TableCell>
                                        </TableRow>
                                      )
                                    })}
                                  </TableBody>
                                </Table>
                              </div>
                            ) : (
                              <div className="text-center py-20 text-slate-400 text-xs italic">No SOAP notes available</div>
                            )}
                          </TabsContent>

                          <TabsContent value="health-reports" className="m-0 focus-visible:outline-none animate-in fade-in duration-300">
                            {isLoading ? (
                              <div className="flex justify-center py-20">
                                <Loader2 className="h-10 w-10 animate-spin text-blue-500" />
                              </div>
                            ) : healthReports.length > 0 ? (
                              <div className="overflow-hidden">
                                <Table>
                                  <TableHeader>
                                    <TableRow className="border-b bg-slate-50/30 hover:bg-slate-50/30">
                                      <TableHead className="px-4 py-4 text-xs uppercase tracking-widest font-bold text-slate-500">Date</TableHead>
                                      <TableHead className="px-4 py-4 text-xs uppercase tracking-widest font-bold text-slate-500">Test</TableHead>
                                      <TableHead className="text-right px-4 py-4 text-xs uppercase tracking-widest font-bold text-slate-500">Action</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {healthReports.map((report) => {
                                      const hasClaim = pastBills.some(bill => 
                                        isMatch(bill.form_details?.additional_info?.health_report_id, report.report_id, bill.form_details?.additional_info?.date_of_service || bill.created_at, report.test_date || report.created_at) ||
                                        isMatch(bill.form_details?.additional_info?.report_id, report.report_id)
                                      );
                                      return (
                                        <TableRow
                                          key={report.report_id}
                                          className={`
                                            transition-all duration-300 border-b last:border-0
                                            ${hasClaim 
                                              ? (selectedSourceId === report.report_id ? "bg-blue-50/60 ring-1 ring-inset ring-blue-100/50 cursor-pointer" : "bg-slate-50/40 hover:bg-slate-50/60 cursor-pointer") 
                                              : (selectedSourceId === report.report_id ? "bg-blue-50/60 ring-1 ring-inset ring-blue-100/50 cursor-pointer" : "hover:bg-slate-50/80 cursor-pointer")
                                            }
                                          `}
                                          onClick={() => {
                                            setSelectedSourceId(report.report_id)
                                          }}
                                        >
                                          <TableCell className="px-4 py-3 font-mono text-[10px] text-slate-600">
                                            {formatDate(report.test_date || report.created_at)}
                                          </TableCell>
                                          <TableCell className="px-4 py-3">
                                            <div className="text-xs text-slate-700 font-medium line-clamp-1">
                                              {report.report_name || "Unknown Report"}
                                            </div>
                                          </TableCell>
                                          <TableCell className="text-right px-4 py-3">
                                            <div className="flex items-center justify-end gap-1">
                                              {hasClaim ? (
                                                <span className="text-[9px] font-black tracking-widest uppercase text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md border border-emerald-100 flex items-center gap-1 shadow-sm">
                                                  CLAIMED
                                                </span>
                                              ) : (
                                                <div className={`
                                                  w-7 h-7 rounded-full flex items-center justify-center transition-all
                                                  ${selectedSourceId === report.report_id ? "bg-blue-600 text-white shadow-sm" : "bg-slate-100 text-slate-400"}
                                                `}>
                                                  <ChevronRight className="h-3.5 w-3.5" />
                                                </div>
                                              )}
                                            </div>
                                          </TableCell>
                                        </TableRow>
                                      )
                                    })}
                                  </TableBody>
                                </Table>
                              </div>
                            ) : (
                              <div className="text-center py-20 text-slate-400 text-xs italic">No health reports available</div>
                            )}
                          </TabsContent>
                          <TabsContent value="past-claims" className="m-0 focus-visible:outline-none animate-in fade-in duration-300">
                            {isLoading ? (
                              <div className="flex justify-center py-20">
                                <Loader2 className="h-10 w-10 animate-spin text-blue-500" />
                              </div>
                            ) : pastBills.length > 0 ? (
                              <div className="overflow-hidden">
                                <Table>
                                  <TableHeader>
                                    <TableRow className="border-b bg-slate-50/30 hover:bg-slate-50/30">
                                      <TableHead className="px-4 py-4 text-[10px] uppercase tracking-widest font-bold text-slate-500">Date</TableHead>
                                      <TableHead className="px-4 py-4 text-[10px] uppercase tracking-widest font-bold text-slate-500">Payer</TableHead>
                                      <TableHead className="px-4 py-4 text-[10px] uppercase tracking-widest font-bold text-slate-500">Amount</TableHead>
                                      <TableHead className="text-right px-4 py-4 text-[10px] uppercase tracking-widest font-bold text-slate-500">Status</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {pastBills.map((bill) => (
                                      <React.Fragment key={bill.id}>
                                        <TableRow
                                          className={`hover:bg-slate-50/80 transition-all border-b last:border-0 h-16 cursor-pointer ${expandedBillId === bill.id ? 'bg-blue-50/50 border-l-4 border-l-blue-600' : ''}`}
                                          onClick={() => setExpandedBillId(expandedBillId === bill.id ? null : bill.id)}
                                        >
                                          <TableCell className="px-4 py-3 font-mono text-[10px] text-slate-600">
                                            {formatDate(bill.created_at || bill.form_details?.additional_info?.date_of_service)}
                                          </TableCell>
                                          <TableCell className="px-4 py-3">
                                            <div className="text-xs text-slate-700 font-bold leading-tight text-white group-hover:text-blue-600 transition-colors">
                                              {bill.form_details?.insurance_details?.payer_name || "Unknown Payer"}
                                            </div>
                                          </TableCell>
                                          <TableCell className="px-4 py-3 text-xs font-bold text-slate-900">
                                            ${bill.form_details?.total_amount?.toFixed(2) || "0.00"}
                                          </TableCell>
                                          <TableCell className="text-right px-4 py-3">
                                            <Badge className={`
                                              ${bill.status === "Submitted" ? "bg-blue-50 text-blue-700 border-blue-100" :
                                                bill.status === "Paid" ? "bg-emerald-50 text-emerald-700 border-emerald-100" :
                                                  "bg-slate-100 text-slate-600 border-slate-200"}
                                              px-2 py-0.5 text-[9px] uppercase font-black rounded-md
                                            `}>
                                              {bill.status}
                                            </Badge>
                                          </TableCell>
                                        </TableRow>
                                      </React.Fragment>
                                    ))}
                                  </TableBody>
                                </Table>
                              </div>
                            ) : (
                              <div className="flex flex-col items-center justify-center py-20 grayscale opacity-40">
                                <History className="h-10 w-10 text-slate-300 mb-2" />
                                <p className="text-[10px] font-bold text-slate-400 tracking-tight">NO PAST CLAIMS FOUND</p>
                              </div>
                            )}
                          </TabsContent>
                        </Tabs>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Right Column: ICD (md: 5/12) */}
                  <div className="md:col-span-5 relative self-stretch">
                    <div className="md:absolute md:inset-0 rounded-2xl bg-white border shadow-xl flex flex-col h-full overflow-hidden ring-1 ring-black/5 min-h-[500px]">
                      <header className="px-5 py-5 border-b bg-white flex justify-between items-center h-[72px]">
                        <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                          {activeTab === 'past-claims' ? <Receipt className="h-5 w-5 text-blue-600" /> : <Activity className="h-5 w-5 text-orange-600" />}
                          {activeTab === 'past-claims' ? "Claim Metadata" : "Billing Codes"}
                        </h3>
                        {(selectedSourceId || (activeTab === 'past-claims' && expandedBillId)) && (
                          <Button
                            variant="link"
                            size="sm"
                            className="text-xs h-auto p-0 text-blue-600 hover:text-blue-800 font-bold"
                            onClick={() => {
                              setSelectedSourceId(null);
                              setExpandedBillId(null);
                            }}
                          >
                            Reset
                          </Button>
                        )}
                      </header>
                      <CardContent className="px-3 pb-4 pt-3 flex-1 flex flex-col bg-slate-50/30 overflow-hidden">
                        <div className="space-y-3 flex-1 overflow-hidden flex flex-col">
                          {isLoading ? (
                            <div className="flex justify-center items-center h-40">
                              <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
                            </div>
                          ) : activeTab === 'past-claims' && expandedBillId ? (
                            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500 overflow-hidden flex flex-col h-full">
                              <div className="flex items-center gap-2 mb-2 p-1 shrink-0">
                                <Receipt className="h-5 w-5 text-blue-600" />
                                <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest">Selected Claim Details</h4>
                              </div>

                              {(() => {
                                const bill = pastBills.find(b => b.id === expandedBillId);
                                if (!bill) return null;
                                return (
                                  <div className="space-y-6 overflow-y-auto pr-1 flex-1 pb-4 scrollbar-thin">
                                    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm ring-1 ring-black/5">
                                      <h5 className="text-[10px] uppercase font-black tracking-widest text-slate-400 mb-4 flex items-center gap-2">
                                        <div className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                                        Line Items & Charges
                                      </h5>
                                      <div className="space-y-3">
                                        {bill.form_details?.claim_lines?.length > 0 ? bill.form_details.claim_lines.map((line: any, idx: number) => (
                                          <div key={idx} className="flex justify-between items-start gap-4 p-3 bg-slate-50 rounded-xl border border-slate-100">
                                            <div>
                                              <span className="bg-slate-900 text-white px-2 py-0.5 rounded text-[10px] font-mono font-bold mr-2">{line.code}</span>
                                              <span className="text-xs font-bold text-slate-700 leading-tight block mt-1.5">{line.description}</span>
                                            </div>
                                            <div className="text-xs font-black text-slate-900 shrink-0">${line.charge_amount?.toFixed(2)}</div>
                                          </div>
                                        )) : (
                                          <div className="text-xs italic text-slate-400 p-3 bg-slate-50 rounded-xl">No line items recorded.</div>
                                        )}
                                        <div className="flex justify-between items-center pt-4 border-t border-slate-100 mt-2 px-1">
                                          <span className="text-[10px] uppercase font-black tracking-widest text-slate-400">Total Bill Amount</span>
                                          <span className="text-lg font-black text-slate-900">${bill.form_details?.total_amount?.toFixed(2) || "0.00"}</span>
                                        </div>
                                      </div>
                                    </div>

                                    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm ring-1 ring-black/5">
                                      <h5 className="text-[10px] uppercase font-black tracking-widest text-slate-400 mb-4 flex items-center gap-2">
                                        <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                        Audit & AI Insights
                                      </h5>
                                      <div className="space-y-4">
                                        <div className="flex justify-between items-center border-b border-slate-50 pb-3">
                                          <span className="text-xs font-bold text-slate-500">Eligibility Check</span>
                                          <Badge className={bill.form_details?.audit_report?.is_eligible ? "bg-emerald-50 text-emerald-700 border-emerald-100 shadow-sm uppercase font-black" : "bg-amber-50 text-amber-700 border-amber-100 shadow-sm uppercase font-black"}>
                                            {bill.form_details?.audit_report?.is_eligible ? "Fully Eligible" : "Manual Override"}
                                          </Badge>
                                        </div>
                                        {bill.form_details?.audit_report?.policy_violation && (
                                          <div className="bg-red-50 border border-red-100 p-3 rounded-xl flex items-start gap-3 animate-pulse shadow-sm">
                                            <ShieldAlert className="h-4 w-4 text-red-600 mt-0.5" />
                                            <div>
                                              <p className="text-[10px] font-black text-red-800 uppercase tracking-widest leading-none mb-1">Policy Violation Detected</p>
                                              <p className="text-[11px] font-bold text-red-600 leading-tight">{bill.form_details.audit_report.policy_violation}</p>
                                            </div>
                                          </div>
                                        )}
                                        <div className="flex justify-between items-center border-b border-slate-50 pb-2">
                                          <span className="text-xs font-bold text-slate-500">Frequency Status</span>
                                          <span className="text-[11px] font-bold text-slate-700 text-right max-w-[150px] leading-tight">
                                            {bill.form_details?.audit_report?.frequency_audit || "Standard frequency verified."}
                                          </span>
                                        </div>
                                        <div className="flex justify-between items-center border-b border-slate-50 pb-2">
                                          <span className="text-xs font-bold text-slate-500">Financial Status</span>
                                          <span className="text-[11px] font-bold text-slate-700 text-right max-w-[150px] leading-tight">
                                            {bill.form_details?.audit_report?.financial_audit || "No outstanding balances."}
                                          </span>
                                        </div>
                                        <div className="flex justify-between items-center border-b border-slate-50 pb-3">
                                          <span className="text-xs font-bold text-slate-500">AI Match Score</span>
                                          <div className="flex items-center gap-2">
                                            <div className="h-1.5 w-24 bg-slate-100 rounded-full overflow-hidden">
                                              <div 
                                                className="h-full bg-blue-600 rounded-full" 
                                                style={{ width: `${bill.form_details?.audit_report?.policy_score || 0}%` }}
                                              />
                                            </div>
                                            <span className="text-xs font-black text-slate-900">{bill.form_details?.audit_report?.policy_score || 0}%</span>
                                          </div>
                                        </div>
                                        <div>
                                          <span className="text-[10px] uppercase font-black tracking-widest text-slate-400 block mb-2">Policy Auditor Feedback</span>
                                          <div className="text-[11px] font-medium text-slate-600 bg-slate-50 p-4 rounded-xl leading-relaxed italic border border-slate-100 shadow-inner">
                                            {bill.form_details?.audit_report?.explanation || "AI-driven policy check: Documentation appears consistent with payer requirements for frequency and clinical necessity."}
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                )
                              })()}
                            </div>
                          ) : filteredCodes.length > 0 ? (
                            <div className="space-y-3">
                              <p className="px-1 text-[9px] font-bold text-slate-400 tracking-wider">
                                {filteredCodes.length} {filteredCodes.length === 1 ? 'CODE' : 'CODES'} READY FOR CLAIM
                              </p>
                              {filteredCodes.map((item, idx) => (
                                <div
                                  key={`${item.code}-${idx}`}
                                  className="group p-3 bg-white border border-slate-200 rounded-xl shadow-sm hover:border-blue-300 transition-all duration-300"
                                >
                                  <div className="flex justify-between items-center mb-1">
                                    <span className="font-black text-slate-900 text-base tracking-tight">
                                      {item.code}
                                    </span>
                                    <Badge className={`
                                  ${item.code_type.includes('symptom')
                                        ? "bg-amber-100 text-amber-800 border-0"
                                        : "bg-blue-100 text-blue-800 border-0"}
                                  px-1.5 py-0 text-[8px] uppercase font-black rounded
                                `}>
                                      {item.code_type.includes('symptom') ? "Sympt" : "Diag"}
                                    </Badge>
                                  </div>
                                  <p className="text-[11px] text-slate-600 font-medium leading-tight line-clamp-2">
                                    {item.description}
                                  </p>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="flex flex-col items-center justify-center h-full py-16 text-center grayscale opacity-40">
                              <Activity className="h-8 w-8 text-slate-300 mb-2" />
                              <p className="text-[10px] font-bold text-slate-400 tracking-tight px-4">
                                {activeTab === 'past-claims' ? 'SELECT A CLAIM ON THE LEFT' : 'SELECT A RECORD ON THE LEFT'}
                              </p>
                            </div>
                          )}
                        </div>

                        <div className="pt-4 border-t border-slate-200 mt-auto">
                          {activeTab === 'past-claims' ? (
                            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between">
                              <span className="text-[10px] font-black uppercase text-slate-400">Claim Status</span>
                              <Badge className="bg-emerald-50 text-emerald-700 border-emerald-100 shadow-sm uppercase font-black px-3 py-1 text-[10px]">VERIFIED</Badge>
                            </div>
                          ) : (
                            <Button
                              className={`w-full h-11 text-sm font-black shadow-lg transition-all rounded-xl gap-2 tracking-wide ${
                                isSelectedSourceClaimed 
                                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 cursor-not-allowed" 
                                  : "bg-blue-600 hover:bg-blue-700 text-white shadow-blue-200"
                              }`}
                              onClick={() => !isSelectedSourceClaimed && setShowAnalysis(true)}
                              disabled={!selectedSourceId || filteredCodes.length === 0 || isSelectedSourceClaimed}
                            >
                              {isSelectedSourceClaimed ? (
                                <>ALREADY CLAIMED <ShieldCheck className="h-4 w-4" /></>
                              ) : (
                                <>PROCEED TO CLAIM <ChevronRight className="h-4 w-4" /></>
                              )}
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="animate-in fade-in slide-in-from-right-4 duration-500">
                  <ClaimCopilot
                    onBack={() => setShowAnalysis(false)}
                    onSuccess={() => {
                      setShowAnalysis(false);
                      loadPatientData(); 
                    }}
                    selectedPatient={selectedPatient}
                    selectedSourceId={selectedSourceId!}
                    selectedCodes={filteredCodes}
                    patientRecord={
                      activeTab === "soap-notes"
                        ? soapNotes.find(n => n.id === selectedSourceId) || {}
                        : healthReports.find(r => r.report_id === selectedSourceId) || {}
                    }
                  />
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 max-w-4xl mx-auto bg-white/50 backdrop-blur-sm rounded-3xl border-2 border-dashed border-slate-200 text-slate-400 shadow-inner">
              <div className="bg-white p-6 rounded-3xl shadow-xl mb-6 ring-1 ring-slate-100">
                <User className="h-12 w-12 text-blue-500 opacity-20" />
              </div>
              <h3 className="text-lg font-bold text-slate-700">Identify Patient First</h3>
              <p className="text-slate-500 text-xs max-w-xs text-center mt-2 leading-relaxed">
                Use the selector above to find the patient you want to process insurance for.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
