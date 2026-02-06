"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import { Header } from "@/components/layout/header"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useDropzone } from "react-dropzone"
import {
  Upload,
  FileAudio,
  Loader2,
  CheckCircle,
  Download,
  Copy,
  User,
  Stethoscope,
  ClipboardList,
  Target,
  Mic,
  Square,
  Play,
  Pause,
  X,
  ChevronLeft,
  ChevronRight,
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { soapApi, billingCodesApi, type ICDBillingCodeItem } from "@/lib/api"
import { icdBus } from "@/lib/icdBus"
import { exportSOAPNoteToPDF } from "@/lib/pdf-export"
import PatientSelector from "@/components/patient-selector" 
import { useAuth } from "@/contexts/auth-context"
import { ProtectedRoute } from "@/components/protected-route"

interface SpeakerSegment {
  text: string
  timestamp: string
}

interface Speaker {
  id: string
  name: string
  segments: SpeakerSegment[]
}

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
  subjective: string
  objective: string
  assessment: string
  plan: string
  transcript: string
  summary: string
  speakers: Speaker[]
  diarized_transcript?: string
  icdCodes?: ICDBillingCodeItem[]
}
// include optional identifiers used elsewhere in the file
interface SOAPNoteExt extends SOAPNote {
  id?: string
  soap_data?: any
  health_report_id?: string
}

// Formatting helper functions
function formatSubjective(subjective: Record<string, string>): string {
  if (!subjective) return ""
  return Object.values(subjective)
    .filter(Boolean)
    .join("\n\n")
}

function formatObjective(objective: Record<string, string>): string {
  if (!objective) return ""
  return Object.values(objective)
    .filter(Boolean)
    .join("\n\n")
}

function formatPlan(plan: { recommendations: string[]; follow_up: string }): string {
  if (!plan) return ""
  const recs = plan.recommendations
    ? plan.recommendations.map((r, i) => `${i + 1}. ${r}`).join("\n")
    : ""
  return `Recommendations:\n${recs}\n\nFollow-up: ${plan.follow_up || ""}`
}

export default function GeneratePage() {
  const [file, setFile] = useState<File | null>(null)
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null)
  const [notes, setNotes] = useState("")
  const [isProcessing, setIsProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [soapNote, setSOAPNote] = useState<SOAPNoteExt | null>(null)
  
  // Audio recording states
  const [isRecording, setIsRecording] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  
  const { toast } = useToast()
  const { user } = useAuth()

  // ICD search UI state (used inside the generated note ICD tab)
  const [icdQuery, setIcdQuery] = useState<string>("")
  const [icdSearchResults, setIcdSearchResults] = useState<Array<{ code?: string; description?: string; intent?: string }>>([])
  const [isSearchingIcd, setIsSearchingIcd] = useState<boolean>(false)
  const [icdPage, setIcdPage] = useState<number>(1)
  const [icdPageSize, setIcdPageSize] = useState<number>(10)
  const [icdHasMore, setIcdHasMore] = useState<boolean>(false)
  const [selectedIcdCodesSet, setSelectedIcdCodesSet] = useState<Set<string>>(new Set())
  const [icdOriginalSelection, setIcdOriginalSelection] = useState<string[]>([])
  const [icdBillingId, setIcdBillingId] = useState<string | null>(null)
  
  // Refs for audio recording
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const recordingIntervalRef = useRef<number | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const onDrop = useCallback(
    (acceptedFiles: File[], fileRejections: any[]) => {
      // Handle rejections explicitly so users get feedback when they pick unsupported files
      if (fileRejections && fileRejections.length > 0) {
        const rej = fileRejections[0]
        const reasons = (rej.errors || []).map((e: any) => e.message).join("; ") || "Unsupported file type"
        toast({
          title: "Invalid file",
          description: `${rej.file?.name || 'File'} rejected: ${reasons}`,
          variant: "destructive",
        })
        return
      }

      const audioFile = acceptedFiles[0]
      if (audioFile) {
        setFile(audioFile)
        toast({
          title: "File uploaded",
          description: `${audioFile.name} is ready for processing`,
        })
      }
    },
    [toast]
  )
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "audio/*": [".mp3", ".wav", ".m4a"],
    },
    maxFiles: 1,
  })

  const handleGenerate = async () => {
    if (!file || !selectedPatient) {
      toast({
        title: "Missing Information",
        description: "Please upload an audio file and select a patient",
        variant: "destructive",
      })
      return
    }

    if (!user) {
      toast({
        title: "Authentication Error",
        description: "Please login again to continue",
        variant: "destructive",
      })
      return
    }

    const formData = new FormData()
    formData.append("file", file)
    formData.append("payload", JSON.stringify({ 
      user_id: user.id,
      patient_id: selectedPatient.id,
      patient_name: selectedPatient.firstname + " " + selectedPatient.lastname,
      patient_age: selectedPatient.age,
      notes: notes // Include additional notes if any
    }))

    try {
      setIsProcessing(true)
      setProgress(10)

      const data = await soapApi.generateSoapNote(formData, (percent: number) => {
        setProgress(percent * 0.6)
      })

      if (data && data.soap_data) {
        setSOAPNote({
          subjective: formatSubjective(data.soap_data.subjective),
          objective: formatObjective(data.soap_data.objective),
          assessment: data.soap_data.assessment || "",
          plan: formatPlan(data.soap_data.plan),
          transcript: data.transcript || "",
          summary: data.summary || "",
          speakers: data.speakers || [],
          diarized_transcript: data.diarized_transcript || "",
          icdCodes: data.billing_codes?.codes || []
        })
        setIcdBillingId(data.billing_codes?.id ?? null)
        // initialize selection to returned codes
        const returned = (data.billing_codes?.codes || []).map((c:any) => String(c.code || ""))
        setSelectedIcdCodesSet(new Set(returned))
        setIcdOriginalSelection(returned)
      } else {
        toast({
          title: "Invalid Response",
          description: "SOAP data missing from server response.",
          variant: "destructive",
        })
      }

      setProgress(100)
      setIsProcessing(false)
      
      // Clean up local files after successful processing
      cleanupLocalFiles()
    } catch (error: any) {
      setIsProcessing(false)

      const backendMsg = error?.message || ""
      const userMessage = backendMsg.includes("Raw transcript is empty")
        ? "Invalid audio file."
        : backendMsg || "Failed to generate SOAP note. Please try again."

      toast({
        title: "Error",
        description: userMessage,
        variant: "destructive",
      })

      // Clean up local files even on error
      cleanupLocalFiles()
    }
  }

  // Keep selection state in sync if soapNote.icdCodes changes elsewhere
  useEffect(() => {
    if (!soapNote) return
    const codes = (soapNote.icdCodes || []).map((c:any) => String(c.code || ""))
    setSelectedIcdCodesSet(new Set(codes))
    setIcdOriginalSelection(codes)
  }, [soapNote?.icdCodes])

  // Sync billing codes from global ICD bus while a note is shown
  useEffect(() => {
    const unsub = icdBus.subscribe((ev) => {
      if (!soapNote) return
      try {
        if (ev.kind === "codes") {
          const resp = ev.payload as any
          const nextCodes = resp.codes || []
          setSOAPNote({ ...soapNote, icdCodes: nextCodes })
          setIcdBillingId(resp.id ?? null)
          const codeKeys = (nextCodes || []).map((c: any) => String(c.code || ""))
          setSelectedIcdCodesSet(new Set(codeKeys))
          setIcdOriginalSelection(codeKeys)
        }
        // Ignore global search events to avoid overwriting local search results
      } catch (e) {
        console.warn("Error handling icdBus event", e)
      }
    })

    return () => { unsub() }
  }, [soapNote])

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
    return (async () => {
      if (!soapNote) return
      const selected = Array.from(selectedIcdCodesSet)
      if (!icdBillingId) {
        toast({ title: 'Error', description: 'Missing billing document id. Cannot save codes.', variant: 'destructive' })
        return
      }

      const items = (soapNote.icdCodes || [])
        .filter((c:any) => selected.includes(String(c.code || "")))
        .map((c:any) => ({
          soap_note_id: c.soap_note_id || '',
          health_report_id: c.health_report_id || undefined,
          code_type: c.code_type || 'icd',
          code: c.code,
          description: c.description || ''
        }))

      try {
        setIsSearchingIcd(true)
        await billingCodesApi.addSavedCodes(icdBillingId, items)
        setSOAPNote({ ...soapNote, icdCodes: items })
        setIcdOriginalSelection(items.map((it:any) => String(it.code)))
        toast({ title: 'Saved', description: 'Billing codes saved successfully' })
      } catch (error: any) {
        console.error('Failed to save ICD codes:', error)
        toast({ title: 'Error', description: error?.message || 'Failed to save billing codes', variant: 'destructive' })
      } finally {
        setIsSearchingIcd(false)
      }
    })()
  }

  const handleCancelIcdSelection = () => {
    setSelectedIcdCodesSet(new Set(icdOriginalSelection))
    console.log('Cancelled ICD selection')
  }

  const copyToClipboard = (textOrObj: string | object) => {
    try {
      let out = typeof textOrObj === "string" ? textOrObj : JSON.stringify(textOrObj, null, 2)
      // Replace escaped sequences so multiline fields (transcript/diarized_transcript) paste with real newlines
      out = out.replace(/\\r\\n/g, "\r\n").replace(/\\n/g, "\n").replace(/\\t/g, "\t")
      navigator.clipboard.writeText(out)
      toast({
        title: "Copied to clipboard",
        description: "Text has been copied to your clipboard",
      })
    } catch (e) {
      toast({ title: "Copy failed", description: "Failed to copy text to clipboard", variant: "destructive" })
    }
  }

  const exportToPDF = async () => {
    if (!soapNote) {
      toast({ title: "No SOAP Note", description: "Nothing to export", variant: "destructive" })
      return
    }

    toast({ title: "Export Started", description: "PDF export will begin shortly" })

    try {
      const filename = `soap-note-${selectedPatient?.firstname || 'patient'}-${new Date().toISOString().split('T')[0]}.pdf`

      // The PDF exporter expects a note object with `soap_data` and `created_at`.
      const noteForExport = {
        id: Date.now().toString(),
        patient_name: selectedPatient ? `${selectedPatient.firstname} ${selectedPatient.lastname}` : "Unknown",
        created_at: new Date().toISOString(),
        soap_data: {
          subjective: soapNote.subjective,
          objective: soapNote.objective,
          assessment: soapNote.assessment,
          plan: soapNote.plan,
        },
        summary: soapNote.summary || "",
      }

      await exportSOAPNoteToPDF(noteForExport as any, { filename, orientation: 'portrait', format: 'a4', margin: 20 })

      // Delay success message slightly so the download can start before the toast appears
      setTimeout(() => {
        toast({ title: "Success", description: "PDF exported successfully" })
      }, 1000)
    } catch (error: any) {
      console.error('Failed to export PDF:', error)
      toast({ title: "Export Failed", description: error?.message || "Failed to export PDF. Please try again.", variant: "destructive" })
    }
  }

  // Audio recording functions
  const startRecording = async () => {
    try {
             const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
       
       // Try to use more compatible audio format
       let mimeType = 'audio/webm;codecs=opus'
       if (MediaRecorder.isTypeSupported('audio/mp4')) {
         mimeType = 'audio/mp4'
       } else if (MediaRecorder.isTypeSupported('audio/wav')) {
         mimeType = 'audio/wav'
       }
       
       const mediaRecorder = new MediaRecorder(stream, {
         mimeType: mimeType
       })
      
      mediaRecorderRef.current = mediaRecorder
      const chunks: Blob[] = []
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data)
        }
      }
      
             mediaRecorder.onstop = () => {
         const blob = new Blob(chunks, { type: mimeType })
         setAudioBlob(blob)
         const url = URL.createObjectURL(blob)
         setAudioUrl(url)
         
         // Convert blob to File object for processing
         const extension = mimeType.includes('mp4') ? 'm4a' : mimeType.includes('wav') ? 'wav' : 'webm'
         const audioFile = new File([blob], `recording_${Date.now()}.${extension}`, { type: mimeType })
         
         console.log('🎙️ Recording completed:', {
           mimeType,
           extension,
           fileName: audioFile.name,
           fileSize: audioFile.size,
           fileType: audioFile.type
         })
         
         setFile(audioFile)
        
        // Stop all tracks
        stream.getTracks().forEach(track => track.stop())
        
        toast({
          title: "Recording completed",
          description: "Audio recording saved and ready for processing",
        })
      }
      
      mediaRecorder.start()
      setIsRecording(true)
      setIsPaused(false)
      setRecordingTime(0)
      
      // Start timer (use browser window.setInterval to get a numeric id)
      recordingIntervalRef.current = window.setInterval(() => {
        setRecordingTime(prev => prev + 1)
      }, 1000)
      
    } catch (error) {
      toast({
        title: "Recording failed",
        description: "Please allow microphone access to record audio",
        variant: "destructive",
      })
    }
  }
  
  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
      setIsPaused(false)
      
      if (recordingIntervalRef.current) {
        window.clearInterval(recordingIntervalRef.current as number)
        recordingIntervalRef.current = null
      }
    }
  }
  
  const pauseRecording = () => {
    if (mediaRecorderRef.current && isRecording && !isPaused) {
      mediaRecorderRef.current.pause()
      setIsPaused(true)
      
      if (recordingIntervalRef.current) {
        window.clearInterval(recordingIntervalRef.current as number)
        recordingIntervalRef.current = null
      }
    }
  }
  
  const resumeRecording = () => {
    if (mediaRecorderRef.current && isRecording && isPaused) {
      mediaRecorderRef.current.resume()
      setIsPaused(false)
      
      // Resume timer (use browser window.setInterval)
      recordingIntervalRef.current = window.setInterval(() => {
        setRecordingTime(prev => prev + 1)
      }, 1000)
    }
  }
  
  const playRecording = () => {
    if (audioRef.current && audioUrl) {
      audioRef.current.play()
      setIsPlaying(true)
    }
  }
  
  const pausePlayback = () => {
    if (audioRef.current) {
      audioRef.current.pause()
      setIsPlaying(false)
    }
  }
  
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }
  
  const clearRecording = () => {
    setAudioBlob(null)
    setAudioUrl(null)
    setFile(null)
    setRecordingTime(0)
    setIsRecording(false)
    setIsPaused(false)
    setIsPlaying(false)
    
    if (recordingIntervalRef.current) {
      window.clearInterval(recordingIntervalRef.current as number)
      recordingIntervalRef.current = null
    }
    
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
    }
  }

  // ICD search implementation (calls billingCodesApi.searchCodes which returns an array)
  const searchIcdCodes = async (q?: string, page?: number, limit?: number) => {
    const query = (q ?? icdQuery ?? "").trim()
    if (!query) {
      setIcdSearchResults([])
      setIcdHasMore(false)
      return
    }

    const pageToUse = page ?? icdPage ?? 1
    const limitToUse = limit ?? icdPageSize ?? 10

    // Clear previous results immediately to avoid showing stale data
    setIcdSearchResults([])
    setIcdHasMore(false)
    setIcdPage(pageToUse)
    setIcdPageSize(limitToUse)
    setIsSearchingIcd(true)
    try {
      const userId = user?.id
      const patientId = selectedPatient?.id
      const noteId = soapNote?.id
      const healthReportId = (soapNote as any)?.health_report_id || (soapNote?.soap_data as any)?.health_report_id

      const context: any = {}
      if (userId) context.user_id = userId
      if (patientId) context.patient_id = patientId
      if (healthReportId) context.health_report_id = healthReportId
      else if (noteId) context.soap_note_id = noteId

      const rawResults = await billingCodesApi.searchCodes(query, pageToUse, limitToUse, context)
      const normalizedArray = Array.isArray(rawResults)
        ? rawResults
        : Array.isArray((rawResults as any)?.results)
          ? (rawResults as any).results
          : Array.isArray((rawResults as any)?.codes)
            ? (rawResults as any).codes
            : []
      const results = normalizedArray.map((it: any) => ({
        code: it.code || it.Code || it.code_value || it.icd_code || '',
        description: it.description || it.Description || it.name || '',
        intent: it.intent || ''
      }))
      setIcdSearchResults(results)
      setIcdPage(pageToUse)
      setIcdPageSize(limitToUse)
      setIcdHasMore((results?.length ?? 0) >= limitToUse)
    } catch (error: any) {
      console.error('ICD search failed:', error)
      toast({ title: 'Search failed', description: error?.message || 'Failed to search ICD codes', variant: 'destructive' })
      setIcdSearchResults([])
      setIcdHasMore(false)
    } finally {
      setIsSearchingIcd(false)
    }
  }
  
  // Cleanup function to delete local files after processing
  const cleanupLocalFiles = () => {
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl)
      setAudioUrl(null)
    }
    setAudioBlob(null)
  }

    return (
      <div>
        <Header
          title="Generate SOAP Note"
          description="Upload audio recordings to generate structured medical documentation"
        />

        <div className="p-6 max-w-6xl mx-auto space-y-6">
          {!soapNote ? (
            <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Audio Input Section */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileAudio className="h-5 w-5" /> Audio Input
                  </CardTitle>
                  <CardDescription>Upload or record your patient consultation</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Tabs defaultValue="upload" className="w-full">
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="upload">Upload File</TabsTrigger>
                      <TabsTrigger value="record">Record Audio</TabsTrigger>
                    </TabsList>
                    
                    <TabsContent value="upload" className="space-y-4">
                      <div
                        {...getRootProps()}
                        className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                          isDragActive ? "border-blue-400 bg-blue-50" : "border-gray-300 hover:border-gray-400"
                        }`}
                      >
                        <input {...getInputProps()} />
                                                 {file ? (
                           <div className="space-y-2">
                             <FileAudio className="h-12 w-12 text-blue-600 mx-auto" />
                             <p className="font-medium text-gray-900">{file.name}</p>
                             <p className="text-sm text-gray-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                             <Badge variant="secondary">Ready to process</Badge>
                           </div>
                         ) : (
                          <div className="space-y-2">
                            <Upload className="h-12 w-12 text-gray-400 mx-auto" />
                            <p className="text-lg font-medium text-gray-900">
                              {isDragActive ? "Drop your audio file here" : "Upload audio file"}
                            </p>
                            <p className="text-sm text-gray-500">Supports MP3, WAV, M4A files up to 100MB</p>
                          </div>
                        )}
                      </div>
                    </TabsContent>
                    
                    <TabsContent value="record" className="space-y-4">
                      {!audioBlob ? (
                        <div className="space-y-4">
                          {/* Recording Controls */}
                          <div className="flex justify-center space-x-4">
                            {!isRecording ? (
                              <Button
                                onClick={startRecording}
                                size="lg"
                                className="bg-red-600 hover:bg-red-700"
                              >
                                <Mic className="mr-2 h-5 w-5" />
                                Start Recording
                              </Button>
                            ) : (
                              <>
                                {!isPaused ? (
                                  <Button
                                    onClick={pauseRecording}
                                    variant="outline"
                                    size="lg"
                                  >
                                    <Pause className="mr-2 h-5 w-5" />
                                    Pause
                                  </Button>
                                ) : (
                                  <Button
                                    onClick={resumeRecording}
                                    variant="outline"
                                    size="lg"
                                  >
                                    <Play className="mr-2 h-5 w-5" />
                                    Resume
                                  </Button>
                                )}
                                <Button
                                  onClick={stopRecording}
                                  variant="destructive"
                                  size="lg"
                                >
                                  <Square className="mr-2 h-5 w-5" />
                                  Stop
                                </Button>
                              </>
                            )}
                          </div>
                          
                          {/* Recording Timer */}
                          {isRecording && (
                            <div className="text-center">
                              <div className="text-2xl font-mono font-bold text-red-600">
                                {formatTime(recordingTime)}
                              </div>
                              <p className="text-sm text-gray-500">
                                {isPaused ? "Recording paused" : "Recording in progress..."}
                              </p>
                            </div>
                          )}
                          
                          {/* Instructions */}
                          <div className="text-center text-sm text-gray-600">
                            <p>Click "Start Recording" to begin capturing audio</p>
                            <p>Use Pause/Resume to control recording flow</p>
                            <p>Click "Stop" when finished</p>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {/* Recording Complete */}
                          <div className="text-center space-y-2">
                            <CheckCircle className="h-12 w-12 text-green-600 mx-auto" />
                            <p className="font-medium text-gray-900">Recording Complete!</p>
                            <p className="text-sm text-gray-500">
                              Duration: {formatTime(recordingTime)}
                            </p>
                          </div>
                          
                          {/* Playback Controls */}
                          <div className="flex justify-center space-x-2">
                            {!isPlaying ? (
                              <Button onClick={playRecording} variant="outline">
                                <Play className="mr-2 h-4 w-4" />
                                Play
                              </Button>
                            ) : (
                              <Button onClick={pausePlayback} variant="outline">
                                <Pause className="mr-2 h-4 w-4" />
                                Pause
                              </Button>
                            )}
                            <Button onClick={clearRecording} variant="outline">
                              <Square className="mr-2 h-4 w-4" />
                              Re-record
                            </Button>
                          </div>
                          
                          {/* Hidden audio element for playback */}
                          <audio
                            ref={audioRef}
                            src={audioUrl || undefined}
                            onEnded={() => setIsPlaying(false)}
                            className="hidden"
                          />
                        </div>
                      )}
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>

              {/* Patient Information */}
              <PatientSelector
                selectedPatient={selectedPatient}
                onPatientSelect={setSelectedPatient}
              />
            </div>

            {/* Additional Notes - Full Width */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ClipboardList className="h-5 w-5" /> Additional Notes
                </CardTitle>
                <CardDescription>Any additional context or notes for the SOAP note</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <Label htmlFor="notes">Notes (Optional)</Label>
                  <Textarea
                    id="notes"
                    placeholder="Any additional context or notes..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={4}
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        ) : null}

        {/* Processing Status */}
        {isProcessing && (
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
                  <span className="font-medium">Processing audio file...</span>
                </div>
                <Progress value={progress} className="w-full" />
                <p className="text-sm text-gray-600">
                  {progress < 30 && "Uploading and analyzing audio..."}
                  {progress >= 30 && progress < 60 && "Transcribing speech..."}
                  {progress >= 60 && progress < 90 && "Generating SOAP note..."}
                  {progress >= 90 && "Finalizing documentation..."}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Generate Button */}
        {!soapNote && !isProcessing && (
          <div className="flex justify-center">
            <Button onClick={handleGenerate} size="lg" className="px-8" disabled={!file || !selectedPatient}>
              <FileAudio className="mr-2 h-5 w-5" />
              Generate SOAP Note
            </Button>
          </div>
        )}

        {/* Results */}
        {soapNote && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-6 w-6 text-green-600" />
                <h2 className="text-xl font-semibold text-gray-900">SOAP Note Generated</h2>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={exportToPDF}>
                  <Download className="mr-2 h-4 w-4" />
                  Export PDF
                </Button>
                <Button variant="outline" onClick={() => copyToClipboard(JSON.stringify(soapNote, null, 2))}>
                  <Copy className="mr-2 h-4 w-4" />
                  Copy All
                </Button>
              </div>
            </div>

            <Tabs defaultValue="soap" className="w-full">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="soap">SOAP Note</TabsTrigger>
                <TabsTrigger value="transcript">Transcript</TabsTrigger>
                <TabsTrigger value="summary">Summary</TabsTrigger>
                <TabsTrigger value="icd">ICD Codes</TabsTrigger>
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
                        {soapNote.subjective}
                      </pre>
                      <Button variant="ghost" size="sm" className="mt-2" onClick={() => copyToClipboard(soapNote.subjective)}>
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
                        {soapNote.objective}
                      </pre>
                      <Button variant="ghost" size="sm" className="mt-2" onClick={() => copyToClipboard(soapNote.objective)}>
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
                      <p className="text-sm text-gray-700 leading-relaxed">{soapNote.assessment}</p>
                      <Button variant="ghost" size="sm" className="mt-2" onClick={() => copyToClipboard(soapNote.assessment)}>
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
                      <pre className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{soapNote.plan}</pre>
                      <Button variant="ghost" size="sm" className="mt-2" onClick={() => copyToClipboard(soapNote.plan)}>
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
                      {soapNote.diarized_transcript
                        ? soapNote.diarized_transcript
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
                      <pre className="whitespace-pre-wrap text-gray-700">{soapNote.summary}</pre>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="icd">
                <Card>
                  <CardHeader>
                    <CardTitle>ICD-10-CM Disease Codes </CardTitle>
                    <CardDescription>Diagnoses and Symptoms — diseases & injuries. Excludes CPT/HCPCS and drug codes.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {/* ICD search box + results (client-side search against billingcodes API) */}
                    <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:gap-2">
                      <div className="relative w-full sm:flex-1">
                        <input
                          value={icdQuery}
                          onChange={(e) => setIcdQuery(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') { searchIcdCodes(icdQuery, 1, icdPageSize) } }}
                          placeholder="Search ICD code or description (e.g. E11, diabetes, chest pain)"
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
                                  {r.intent && (
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

                    {/* Existing list of ICD codes for the generated note */}
                    {soapNote.icdCodes && soapNote.icdCodes.length > 0 ? (
                      (() => {
                        const diagnoses = soapNote.icdCodes.filter((c:any) => String(c.code_type || '').toLowerCase().includes('diagnos'))
                        const symptoms = soapNote.icdCodes.filter((c:any) => String(c.code_type || '').toLowerCase().includes('symptom'))
                        const others = soapNote.icdCodes.filter((c:any) => !diagnoses.includes(c) && !symptoms.includes(c))
                        const renderList = (list: any[], label: string) => (
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
                                    {(ic as any).intent && (
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
                            <div className="flex items-center justify-end gap-2 px-6">
                              <Button variant="outline" onClick={handleCancelIcdSelection}>Cancel</Button>
                              <Button onClick={handleSaveIcdSelection}>Save</Button>
                            </div>
                          </div>
                        )
                      })()
                    ) : (
                      <div className="text-sm text-gray-700">
                        No ICD-10 diagnosis codes available for this note.
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </div>
    </div>
  )
}
