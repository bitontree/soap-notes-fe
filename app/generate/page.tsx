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

interface SOAPNote {
  subjective: string
  objective: string
  assessment: string
  plan: string
  transcript: string
  speakers: Array<{ id: string; name: string; segments: Array<{ text: string; timestamp: string }> }>
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
    },
    [toast],
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "audio/*": [".mp3", ".wav", ".m4a", ".ogg"],
    },
    maxFiles: 1,
  })

  const handleGenerate = async () => {
    if (!file || !patientId) {
      toast({
        title: "Missing Information",
        description: "Please upload an audio file and enter patient ID",
        variant: "destructive",
      })
      return
    }

    setIsProcessing(true)
    setProgress(0)

    // Simulate processing with progress updates
    const progressInterval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 90) {
          clearInterval(progressInterval)
          return 90
        }
        return prev + 10
      })
    }, 500)

    try {
      // Mock API call
      await new Promise((resolve) => setTimeout(resolve, 5000))

      // Mock SOAP note response
      const mockSOAP: SOAPNote = {
        subjective:
          "Patient reports persistent headaches for the past 3 days, described as throbbing pain primarily in the frontal region. Pain intensity rated 7/10. Associated with mild nausea but no vomiting. No visual disturbances or photophobia. Patient denies recent trauma or fever.",
        objective:
          "Vital signs: BP 128/82, HR 76, Temp 98.6°F, RR 16. Patient appears comfortable but slightly fatigued. HEENT: Pupils equal, round, reactive to light. No papilledema on fundoscopic exam. Neck supple, no meningeal signs. Neurological exam within normal limits.",
        assessment:
          "Primary headache, likely tension-type headache. Differential includes migraine without aura, though patient lacks typical migraine features. No signs of secondary headache or neurological complications.",
        plan: "1. Recommend ibuprofen 400mg q6h PRN for pain relief\n2. Encourage adequate hydration and regular sleep schedule\n3. Stress management techniques and relaxation exercises\n4. Follow-up in 1 week if symptoms persist\n5. Return immediately if severe symptoms develop (fever, neck stiffness, vision changes)",
        transcript:
          "Doctor: Good morning, how are you feeling today?\nPatient: Not great, I've been having these terrible headaches for the past three days.\nDoctor: Can you describe the pain for me?\nPatient: It's like a throbbing pain, mostly in the front of my head. I'd say it's about a 7 out of 10 in terms of pain.",
        speakers: [
          {
            id: "speaker_1",
            name: "Doctor",
            segments: [
              { text: "Good morning, how are you feeling today?", timestamp: "00:00:05" },
              { text: "Can you describe the pain for me?", timestamp: "00:00:15" },
            ],
          },
          {
            id: "speaker_2",
            name: "Patient",
            segments: [
              {
                text: "Not great, I've been having these terrible headaches for the past three days.",
                timestamp: "00:00:08",
              },
              {
                text: "It's like a throbbing pain, mostly in the front of my head. I'd say it's about a 7 out of 10 in terms of pain.",
                timestamp: "00:00:18",
              },
            ],
          },
        ],
      }

      setProgress(100)
      setSOAPNote(mockSOAP)
      toast({
        title: "SOAP Note Generated",
        description: "Your medical documentation is ready",
      })
    } catch (error) {
      toast({
        title: "Generation Failed",
        description: "Unable to process audio file",
        variant: "destructive",
      })
    } finally {
      setIsProcessing(false)
      clearInterval(progressInterval)
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
      <Header
        title="Generate SOAP Note"
        description="Upload audio recordings to generate structured medical documentation"
      />

      <div className="p-6 max-w-6xl mx-auto space-y-6">
        {!soapNote ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Upload Section */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Upload className="h-5 w-5" />
                  Audio Upload
                </CardTitle>
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
                      <p className="text-lg font-medium text-gray-900">
                        {isDragActive ? "Drop your audio file here" : "Upload audio file"}
                      </p>
                      <p className="text-sm text-gray-500">Supports MP3, WAV, M4A files up to 100MB</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Patient Information */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Patient Information
                </CardTitle>
                <CardDescription>Enter patient details for the SOAP note</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="patientId">Patient ID *</Label>
                  <Input
                    id="patientId"
                    placeholder="Enter patient ID"
                    value={patientId}
                    onChange={(e) => setPatientId(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="notes">Additional Notes (Optional)</Label>
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
                      <p className="text-sm text-gray-700 leading-relaxed">{soapNote.subjective}</p>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="mt-2"
                        onClick={() => copyToClipboard(soapNote.subjective)}
                      >
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
                      <p className="text-sm text-gray-700 leading-relaxed">{soapNote.objective}</p>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="mt-2"
                        onClick={() => copyToClipboard(soapNote.objective)}
                      >
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
                      <Button
                        variant="ghost"
                        size="sm"
                        className="mt-2"
                        onClick={() => copyToClipboard(soapNote.assessment)}
                      >
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
                      <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{soapNote.plan}</div>
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
                    <CardTitle>Full Transcript</CardTitle>
                    <CardDescription>Complete conversation with speaker identification</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {soapNote.speakers.map((speaker) => (
                        <div key={speaker.id} className="space-y-2">
                          <h4 className="font-medium text-gray-900">{speaker.name}</h4>
                          {speaker.segments.map((segment, index) => (
                            <div key={index} className="flex gap-3 text-sm">
                              <span className="text-gray-500 font-mono">{segment.timestamp}</span>
                              <p className="text-gray-700">{segment.text}</p>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
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
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="text-center p-4 bg-blue-50 rounded-lg">
                        <div className="text-2xl font-bold text-blue-600">5:23</div>
                        <div className="text-sm text-gray-600">Duration</div>
                      </div>
                      <div className="text-center p-4 bg-green-50 rounded-lg">
                        <div className="text-2xl font-bold text-green-600">2</div>
                        <div className="text-sm text-gray-600">Speakers</div>
                      </div>
                      <div className="text-center p-4 bg-purple-50 rounded-lg">
                        <div className="text-2xl font-bold text-purple-600">98%</div>
                        <div className="text-sm text-gray-600">Accuracy</div>
                      </div>
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
