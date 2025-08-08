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
import { uploadHealthReportApi } from "@/lib/api"
import PatientSelector from "@/components/patient-selector"  // Make sure this component does NOT expect 'disabled' prop

type UploadResult = any

export default function HealthReportPage() {
  const [file, setFile] = useState<File | null>(null)
  const [selectedPatient, setSelectedPatient] = useState<any | null>(null)
  const [notes, setNotes] = useState("")
  const [isUploading, setIsUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null)
  const { toast } = useToast()

  // Handle PDF file drop
  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const pdf = acceptedFiles[0]
      if (pdf) {
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
  })

  // Reset form fields and state
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

  // Upload handler
  const handleUpload = async () => {
    if (!file || !selectedPatient) {
      toast({
        title: "Missing Information",
        description: "Please select a PDF file and select a patient",
        variant: "destructive",
      })
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

      const result = await uploadHealthReportApi(
        patientInfo.patient_id,
        file,
        patientInfo,
        (percent) => setProgress(percent)
      )

      setProgress(100)
      setUploadResult(result)
      toast({
        title: "Upload Successful",
        description: `Health report for ${patientInfo.patient_name || "Patient"} uploaded successfully.`,
      })
    } catch (error: any) {
      toast({
        title: "Upload Failed",
        description: error?.message || "Failed to upload health report. Please try again.",
        variant: "destructive",
      })
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
        {/* Upload form */}
        {!uploadResult ? (
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

            {/* Patient Selector + Additional Notes */}
            <div className="space-y-6">
              <PatientSelector
                selectedPatient={selectedPatient}
                onPatientSelect={setSelectedPatient}
                // Do NOT pass disabled prop to avoid TS error (remove disabled={isUploading})
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
        ) : (
          // Upload result display with Tabs
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-6 w-6 text-green-600" />
                <h2 className="text-xl font-semibold text-gray-900">Upload Successful</h2>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={exportDummyPDF}>
                  <Download className="mr-2 h-4 w-4" />
                  Export PDF
                </Button>
                <Button variant="outline" onClick={() => copyToClipboard(JSON.stringify(uploadResult, null, 2))}>
                  <Copy className="mr-2 h-4 w-4" />
                  Copy Info
                </Button>
                <Button variant="ghost" onClick={resetForm}>
                  Upload Another
                </Button>
              </div>
            </div>

            <Tabs defaultValue="file" className="w-full">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="file">File Info</TabsTrigger>
                <TabsTrigger value="patient">Patient Info</TabsTrigger>
                <TabsTrigger value="notes">Notes</TabsTrigger>
                <TabsTrigger value="report">Report</TabsTrigger>
              </TabsList>

              <TabsContent value="file" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>File Information</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p><strong>Filename:</strong> {uploadResult.filename}</p>
                    <p><strong>Saved As:</strong> {uploadResult.saved_as}</p>
                    <p><strong>Size (bytes):</strong> {uploadResult.size}</p>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="patient" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Patient Information</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p><strong>ID:</strong> {selectedPatient?.id || selectedPatient?._id || "N/A"}</p>
                    <p><strong>Name:</strong> {`${selectedPatient?.firstname ?? ""} ${selectedPatient?.lastname ?? ""}`.trim() || "N/A"}</p>
                    <p><strong>Age:</strong> {selectedPatient?.age ?? "N/A"}</p>
                    <p><strong>Gender:</strong> {selectedPatient?.gender || "N/A"}</p>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="notes" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Additional Notes</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <pre className="whitespace-pre-wrap">{notes || "No additional notes"}</pre>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="report" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Parsed Report</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <pre className="whitespace-pre-wrap text-sm">{uploadResult ? JSON.stringify(uploadResult, null, 2) : "No report data"}</pre>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        )}

        {/* Upload Button */}
        {!uploadResult && (
          <div className="flex justify-center pt-6">
            <Button
              onClick={handleUpload}
              size="lg"
              disabled={!file || !selectedPatient || isUploading}
              className="px-8"
            >
              {isUploading ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-5 w-5" /> Upload Health Report
                </>
              )}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
