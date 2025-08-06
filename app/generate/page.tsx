"use client"

import { useState, useCallback } from "react"
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
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import axios from "axios"

interface SpeakerSegment {
  text: string
  timestamp: string
}

interface Speaker {
  id: string
  name: string
  segments: SpeakerSegment[]
}

interface SOAPNote {
  subjective: string
  objective: string
  assessment: string
  plan: string
  transcript: string
  summary:string
  speakers: Speaker[]
  diarized?: string
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
  const [patientId, setPatientId] = useState("")
  const [notes, setNotes] = useState("")
  const [isProcessing, setIsProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [soapNote, setSOAPNote] = useState<SOAPNote | null>(null)
  const { toast } = useToast()

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const audioFile = acceptedFiles[0]
      if (audioFile) {
        setFile(audioFile)
        toast({
          title: "File uploaded",
          description: `${audioFile.name} is ready for processing`,
        })
      }
    }, [toast],
  )
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "audio/*": [".mp3", ".wav", ".m4a", ".ogg"] },
    maxFiles: 1,
  })

  const handleGenerate = async () => {
    if (!file || !patientId) {
      toast({
        title: "Missing Information",
        description: "Please upload an audio file and enter a patient ID",
        variant: "destructive",
      })
      return
    }

    const formData = new FormData()
    formData.append("file", file)
    formData.append("payload", JSON.stringify({ user_id: patientId }))

    try {
      setIsProcessing(true)
      setProgress(10)
      const baseURL = process.env.NEXT_PUBLIC_BASE_URL
      const response = await axios.post(`${baseURL}/generate-soap-note`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: (event) => {
          if (event.total) {
            const percent = Math.round((event.loaded * 100) / event.total)
            setProgress(percent * 0.6)
          }
        },
      })

      const data = response.data.result
      

      if (data && data.soap_data) {
        setSOAPNote({
          subjective: formatSubjective(data.soap_data.subjective),
          objective: formatObjective(data.soap_data.objective),
          assessment: data.soap_data.assessment || "",
          plan: formatPlan(data.soap_data.plan),
          transcript: data.transcript || "",
          summary: data.summary || "",
          speakers: data.speakers || [],
          diarized: data.diarized_transcript || "" 
        })
        
      } else {
        toast({
          title: "Invalid Response",
          description: "SOAP data missing from server response.",
          variant: "destructive",
        })
      }

      setIsProcessing(false)
      setProgress(100)
    } catch (error) {
      setIsProcessing(false)
      toast({
        title: "Error",
        description: "Failed to generate SOAP note. Please try again.",
        variant: "destructive",
      })
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    toast({
      title: "Copied to clipboard",
      description: "Text has been copied to your clipboard",
    })
  }

  const exportToPDF = () => {
    toast({
      title: "Export Started",
      description: "PDF export will begin shortly",
    })
  }

  return (
    <div>
      <Header title="Generate SOAP Note" description="Upload audio recordings to generate structured medical documentation" />

      <div className="p-6 max-w-6xl mx-auto space-y-6">
        {!soapNote ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Upload Section */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Upload className="h-5 w-5" /> Audio Upload</CardTitle>
                <CardDescription>Upload your patient consultation recording</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
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
                      <p className="text-lg font-medium text-gray-900">{isDragActive ? "Drop your audio file here" : "Upload audio file"}</p>
                      <p className="text-sm text-gray-500">Supports MP3, WAV, M4A files up to 100MB</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Patient Information */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><User className="h-5 w-5" /> Patient Information</CardTitle>
                <CardDescription>Enter patient details for the SOAP note</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="patientId">Patient ID *</Label>
                  <Input id="patientId" placeholder="Enter patient ID" value={patientId} onChange={(e) => setPatientId(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="notes">Additional Notes (Optional)</Label>
                  <Textarea id="notes" placeholder="Any additional context or notes..." value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} />
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
            <Button onClick={handleGenerate} size="lg" className="px-8" disabled={!file || !patientId}>
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
                      <pre className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{soapNote.subjective}</pre>
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
                      <pre className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{soapNote.objective}</pre>
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
        {soapNote.diarized
          ? soapNote.diarized
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

            </Tabs>
          </div>
        )}
      </div>
    </div>
  )
}
