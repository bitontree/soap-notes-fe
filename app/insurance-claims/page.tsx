"use client"

import { useState, useEffect, useMemo } from "react"
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
  Loader2, 
  ExternalLink,
  ChevronRight,
  User
} from "lucide-react"
import { soapApi, billingCodesApi, fetchReports, type ICDBillingCodeItem } from "@/lib/api"
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
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null)
  const [showAnalysis, setShowAnalysis] = useState(false)

  // Fetch all patient data when selectedPatient changes
  useEffect(() => {
    if (selectedPatient && user) {
      loadPatientData()
    } else {
      setSoapNotes([])
      setHealthReports([])
      setSavedCodes([])
      setSelectedSourceId(null)
      setShowAnalysis(false)
    }
  }, [selectedPatient, user])

  const loadPatientData = async () => {
    if (!selectedPatient || !user) return
    
    setIsLoading(true)
    try {
      const userId = user.id || (user as any)._id
      
      const [notesResp, reportsResp, codesResp] = await Promise.all([
        soapApi.getNotes({ patientId: selectedPatient.id, limit: 50 }),
        fetchReports({ patient_id: selectedPatient.id, limit: 100 }),
        billingCodesApi.getSavedCodesByPatient(selectedPatient.id, userId)
      ])

      setSoapNotes(notesResp.soap_notes || [])
      setHealthReports(reportsResp.reports || [])
      setSavedCodes(codesResp || [])
      
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

  const formatDate = (dateString: string) => {
    if (!dateString) return "N/A"
    return new Date(dateString).toLocaleDateString()
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
            <div className="flex items-center justify-between relative">
              {[
                { step: 1, label: "Select Patient", icon: User },
                { step: 2, label: "Review Records", icon: FileText },
                { step: 3, label: "Confirm Claim", icon: ShieldCheck },
              ].map((item, idx) => (
                <div key={item.step} className="flex flex-col items-center z-10 relative">
                  <div className={`
                    w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300
                    ${currentStep >= item.step ? "bg-blue-600 text-white shadow-lg scale-110" : "bg-white text-gray-400 border-2 border-gray-100"}
                  `}>
                    <item.icon className="h-5 w-5" />
                  </div>
                  <span className={`text-xs mt-2 font-medium ${currentStep >= item.step ? "text-blue-700" : "text-gray-400"}`}>
                    {item.label}
                  </span>
                  
                  {idx < 2 && (
                    <div className="absolute top-5 left-10 w-[calc(100vw/5.5)] lg:w-48 h-[2px] -z-0">
                       <div className={`h-full transition-all duration-500 ${currentStep > item.step ? "bg-blue-600" : "bg-gray-100"}`} />
                    </div>
                  )}
                </div>
              ))}
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
                      <div className="px-4 pt-3 border-b bg-slate-50/50">
                        <TabsList className="grid w-full grid-cols-2 bg-slate-200/50 p-1 h-9 border-0">
                          <TabsTrigger value="soap-notes" className="data-[state=active]:bg-white data-[state=active]:text-blue-700 data-[state=active]:shadow-sm transition-all font-semibold text-xs">
                            SOAP Notes
                          </TabsTrigger>
                          <TabsTrigger value="health-reports" className="data-[state=active]:bg-white data-[state=active]:text-blue-700 data-[state=active]:shadow-sm transition-all font-semibold text-xs">
                            Health Reports
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
                                {soapNotes.map((note) => (
                                  <TableRow 
                                    key={note.id} 
                                    className={`
                                      transition-all duration-300 cursor-pointer border-b last:border-0
                                      ${selectedSourceId === note.id ? "bg-blue-50/60 ring-1 ring-inset ring-blue-100/50" : "hover:bg-slate-50/80"}
                                    `}
                                    onClick={() => setSelectedSourceId(note.id)}
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
                                        <div className={`
                                          w-7 h-7 rounded-full flex items-center justify-center transition-all
                                          ${selectedSourceId === note.id ? "bg-blue-600 text-white shadow-sm" : "bg-slate-100 text-slate-400"}
                                        `}>
                                          <ChevronRight className="h-3.5 w-3.5" />
                                        </div>
                                      </div>
                                    </TableCell>
                                  </TableRow>
                                ))}
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
                                {healthReports.map((report) => (
                                  <TableRow 
                                    key={report.report_id} 
                                    className={`
                                      transition-all duration-300 cursor-pointer border-b last:border-0
                                      ${selectedSourceId === report.report_id ? "bg-blue-50/60 ring-1 ring-inset ring-blue-100/50" : "hover:bg-slate-50/80"}
                                    `}
                                    onClick={() => setSelectedSourceId(report.report_id)}
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
                                        <div className={`
                                          w-7 h-7 rounded-full flex items-center justify-center transition-all
                                          ${selectedSourceId === report.report_id ? "bg-blue-600 text-white shadow-sm" : "bg-slate-100 text-slate-400"}
                                        `}>
                                          <ChevronRight className="h-3.5 w-3.5" />
                                        </div>
                                      </div>
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        ) : (
                          <div className="text-center py-20 text-slate-400 text-xs italic">No health reports available</div>
                        )}
                      </TabsContent>
                    </Tabs>
                  </CardContent>
                </Card>
              </div>

              {/* Right Column: ICD (md: 5/12) */}
              <div className="md:col-span-5">
                <div className="rounded-2xl bg-white border shadow-xl flex flex-col h-full overflow-hidden ring-1 ring-black/5 min-h-[500px]">
                  <header className="px-5 py-5 border-b bg-white flex justify-between items-center h-[72px]">
                    <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                      <Activity className="h-5 w-5 text-orange-600" /> Billing Codes
                    </h3>
                    {selectedSourceId && (
                      <Button 
                        variant="link" 
                        size="sm" 
                        className="text-xs h-auto p-0 text-blue-600 hover:text-blue-800 font-bold"
                        onClick={() => setSelectedSourceId(null)}
                      >
                        Reset
                      </Button>
                    )}
                  </header>
                  <CardContent className="px-3 pb-4 pt-3 flex-1 flex flex-col bg-slate-50/30">
                    <div className="space-y-3 flex-1">
                      {isLoading ? (
                        <div className="flex justify-center items-center h-40">
                          <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
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
                          <p className="text-[10px] font-bold text-slate-400 tracking-tight px-4">SELECT A RECORD ON THE LEFT</p>
                        </div>
                      )}
                    </div>

                    <div className="pt-4 border-t border-slate-200 mt-auto">
                      <Button 
                        className="w-full bg-blue-600 hover:bg-blue-700 h-11 text-sm font-black shadow-lg shadow-blue-200 transition-all rounded-xl gap-2 tracking-wide"
                        onClick={() => setShowAnalysis(true)}
                        disabled={!selectedSourceId || filteredCodes.length === 0}
                      >
                        PROCEED TO CLAIM <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </div>
              </div>
            </div>
          ) : (
            <div className="animate-in fade-in slide-in-from-right-4 duration-500">
              <ClaimCopilot 
                onBack={() => setShowAnalysis(false)}
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
