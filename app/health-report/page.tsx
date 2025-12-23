"use client"

import { useState, useCallback } from "react"
import { Header } from "@/components/layout/header"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useDropzone } from "react-dropzone"
import {
  Upload,
  FileText,
  Loader2,
  CheckCircle,
  Download,
  Copy,
  User,
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { parseHealthReportApi } from "@/lib/api"
import PatientSelector from "@/components/patient-selector"
import { useAuth } from "@/contexts/auth-context"

type UploadResult = any

export default function HealthReportPage() {
  const [file, setFile] = useState<File | null>(null)
  const [selectedPatient, setSelectedPatient] = useState<any | null>(null)
  const [notes, setNotes] = useState("")
  const [isUploading, setIsUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null)
  const { toast } = useToast()
  const { user } = useAuth()

  const MAX_PDF_SIZE = 20 * 1024 * 1024 // 20MB

  const onDrop = useCallback(
    (acceptedFiles: File[], fileRejections: any[]) => {
      // Handle rejections (wrong type or too large)
      if (fileRejections && fileRejections.length > 0) {
        const rej = fileRejections[0]
        const reasons = (rej.errors || []).map((e: any) => e.message).join("; ") || "Unsupported file"
        toast({
          title: "Invalid PDF",
          description: `${rej.file?.name || 'File'} rejected: ${reasons}`,
          variant: "destructive",
        })
        return
      }

      const pdf = acceptedFiles[0]
      if (pdf) {
        // Extra runtime guard
        if (pdf.size > MAX_PDF_SIZE) {
          toast({ title: "File too large", description: `${pdf.name} exceeds the 20MB limit`, variant: "destructive" })
          return
        }

        setFile(pdf)
        setUploadResult(null)
        setProgress(0)
        toast({
          title: "PDF File Selected",
          description: `${pdf.name} is ready for upload`,
        })
      }
    },
    [toast]
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/pdf": [".pdf"] },
    maxFiles: 1,
    maxSize: MAX_PDF_SIZE,
  })

  const resetForm = () => {
    setFile(null)
    setSelectedPatient(null)
    setNotes("")
    setUploadResult(null)
    setProgress(0)
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    toast({
      title: "Copied to clipboard",
      description: "Copied content to clipboard",
    })
  }

  const exportDummyPDF = () => {
    toast({
      title: "Export feature",
      description: "Export to PDF feature coming soon.",
    })
  }

  const handleUpload = async () => {
    if (!file || !selectedPatient) {
      toast({
        title: "Missing Information",
        description: "Please select a PDF file and select a patient",
        variant: "destructive",
      })
      return
    }

    // Prevent uploading files larger than 20MB as an extra safeguard
    if (file.size > MAX_PDF_SIZE) {
      toast({ title: "File too large", description: `${file.name} exceeds the 20MB limit`, variant: "destructive" })
      return
    }

    setIsUploading(true)
    setProgress(5)
    setUploadResult(null)

    try {
      const patientInfo = {
        patient_id: selectedPatient.id || selectedPatient._id || "",
        patient_name: `${selectedPatient.firstname ?? ""} ${selectedPatient.lastname ?? ""}`.trim(),
        patient_age: selectedPatient.age || "",
        patient_gender: selectedPatient.gender || "",
        notes,
      }

      const result = await parseHealthReportApi(
        patientInfo.patient_id,
        user?.id || "", // userId parameter
        file,
        (percent) => setProgress(percent)
      )

      setProgress(100)

      // ✅ Updated toast message
      toast({
        title: "Health Report Uploaded and parsed",
        description: `Health report for ${patientInfo.patient_name || "Patient"} has been successfully uploaded and parsed.`,
      })

      // Keep the user on the same page (no in-page result view)
      // Optionally reset the form after a short delay
      setTimeout(() => {
        resetForm()
      }, 500)
    } catch (error: any) {
      // Detect timeout errors (axios uses code 'ECONNABORTED' for timeouts)
      const isTimeout = error?.code === "ECONNABORTED" || /timeout/i.test(error?.message || "")
      if (isTimeout) {
        // Backend may still be processing the file; avoid showing a failure-style message
        toast({
          title: "Processing taking longer than expected",
          description:
            "The report is still being processed on the server. We've started processing and you can check back shortly.",
        })
      } else {
        toast({
          title: "Upload Failed",
          description: error?.message || "Failed to upload health report. Please try again.",
          variant: "destructive",
        })
      }
    } finally {
      setIsUploading(false)
      setTimeout(() => setProgress(0), 1500)
    }
  }

  return (
    <div>
      <Header
        title="Upload Health Report"
        description="Upload PDF health reports along with patient information"
      />

      <div className="p-6 max-w-6xl mx-auto space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* PDF Upload */}  
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Upload className="h-5 w-5" /> PDF Upload
                </CardTitle>
                <CardDescription>Upload your patient's health report (PDF)</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div
                  {...getRootProps()}
                  className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                    isDragActive ? "border-blue-400 bg-blue-50" : "border-gray-300 hover:border-gray-400"
                  } ${isUploading ? "opacity-70 pointer-events-none" : ""}`}
                >
                  <input {...getInputProps()} disabled={isUploading} />
                  {file ? (
                    <div className="space-y-2">
                      <FileText className="h-12 w-12 text-blue-600 mx-auto" />
                      <p className="font-medium text-gray-900">{file.name}</p>
                      <p className="text-sm text-gray-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                      <Badge variant="secondary">Ready to upload</Badge>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Upload className="h-12 w-12 text-gray-400 mx-auto" />
                      <p className="text-lg font-medium text-gray-900">
                        {isDragActive ? "Drop your PDF here" : "Upload PDF file"}
                      </p>
                      <p className="text-sm text-gray-500">Only PDF files up to 20MB supported</p>
                    </div>
                  )}
                </div>
                {isUploading && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Loader2 className="animate-spin h-5 w-5 text-blue-600" />
                      <span className="font-medium">Uploading health report...</span>
                    </div>
                    <Progress value={progress} className="w-full" />
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Patient Selector + Notes */}
            <div className="space-y-6">
              <PatientSelector
                selectedPatient={selectedPatient}
                onPatientSelect={setSelectedPatient}
              />

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <User className="h-5 w-5" /> Additional Notes
                  </CardTitle>
                  <CardDescription>Any additional context or notes for the health report</CardDescription>
                </CardHeader>
                <CardContent>
                  <Textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={4}
                    disabled={isUploading}
                    placeholder="Add any notes about this report"
                  />
                </CardContent>
              </Card>
            </div>
          </div>

        <div className="flex justify-center pt-6">
          <Button
            onClick={handleUpload}
            size="lg"
            disabled={!file || !selectedPatient || isUploading}
            className="px-8"
          >
            {isUploading ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Uploading...
              </>
            ) : (
              <>
                <Upload className="mr-2 h-5 w-5" /> Upload Health Report
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
