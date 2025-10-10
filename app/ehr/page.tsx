"use client"

import { useState } from "react"
import { Header } from "@/components/layout/header"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Database, Upload, FileText, Loader2, CheckCircle, AlertCircle } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { useAuth } from "@/contexts/auth-context"
import { sanitizeName } from "@/lib/utils"

export default function EHRPage() {
  const [isGenerating, setIsGenerating] = useState(false)
  const [patientData, setPatientData] = useState({
    patientId: "",
    name: "",
    age: "",
    gender: "",
    chiefComplaint: "",
    historyOfPresentIllness: "",
    pastMedicalHistory: "",
    medications: "",
    allergies: "",
    vitalSigns: "",
    physicalExam: "",
    labResults: "",
    imaging: "",
  })
  const { toast } = useToast()

  const handleInputChange = (field: string, value: string) => {
    // Sanitize name fields
    let sanitizedValue = value
    if (field === "name") {
      sanitizedValue = sanitizeName(value)
    }
    
    setPatientData((prev) => ({
      ...prev,
      [field]: sanitizedValue,
    }))
  }

  const handleGenerateFromEHR = async () => {
    if (!patientData.patientId || !patientData.chiefComplaint) {
      toast({
        title: "Missing Information",
        description: "Please fill in at least Patient ID and Chief Complaint",
        variant: "destructive",
      })
      return
    }

    setIsGenerating(true)

    try {
      // Mock API call
      await new Promise((resolve) => setTimeout(resolve, 3000))

      toast({
        title: "SOAP Note Generated",
        description: "Successfully generated SOAP note from EHR data",
      })
    } catch (error) {
      toast({
        title: "Generation Failed",
        description: "Unable to generate SOAP note from EHR data",
        variant: "destructive",
      })
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <div>
      <Header title="EHR Integration" description="Generate SOAP notes from existing Electronic Health Record data" />

      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Integration Status */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                EHR Status
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-600" />
                <span className="text-sm">Connected to Epic</span>
              </div>
              <div className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-yellow-600" />
                <span className="text-sm">Cerner - Limited Access</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-600" />
                <span className="text-sm">Allscripts Connected</span>
              </div>
              <Button variant="outline" className="w-full mt-4 bg-transparent">
                Manage Connections
              </Button>
            </CardContent>
          </Card>

          {/* Quick Stats */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Notes Generated</span>
                <span className="font-medium">47</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">This Week</span>
                <span className="font-medium">12</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Success Rate</span>
                <span className="font-medium text-green-600">98.2%</span>
              </div>
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button variant="outline" className="w-full justify-start bg-transparent">
                <Upload className="mr-2 h-4 w-4" />
                Import Patient Data
              </Button>
              <Button variant="outline" className="w-full justify-start bg-transparent">
                <FileText className="mr-2 h-4 w-4" />
                Bulk Generate Notes
              </Button>
              <Button variant="outline" className="w-full justify-start bg-transparent">
                <Database className="mr-2 h-4 w-4" />
                Sync with EHR
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* EHR Data Form */}
        <Card>
          <CardHeader>
            <CardTitle>Generate SOAP from EHR Data</CardTitle>
            <CardDescription>
              Enter patient information from your EHR system to generate a structured SOAP note
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="patient" className="w-full">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="patient">Patient Info</TabsTrigger>
                <TabsTrigger value="history">History</TabsTrigger>
                <TabsTrigger value="examination">Examination</TabsTrigger>
                <TabsTrigger value="results">Results</TabsTrigger>
              </TabsList>

              <TabsContent value="patient" className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="patientId">Patient ID *</Label>
                    <Input
                      id="patientId"
                      placeholder="Enter patient ID"
                      value={patientData.patientId}
                      onChange={(e) => handleInputChange("patientId", e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="name">Patient Name</Label>
                    <Input
                      id="name"
                      placeholder="Enter patient name"
                      value={patientData.name}
                      onChange={(e) => handleInputChange("name", e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="age">Age</Label>
                    <Input
                      id="age"
                      type="number"
                      placeholder="Enter age"
                      value={patientData.age}
                      onChange={(e) => handleInputChange("age", e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="gender">Gender</Label>
                    <Select value={patientData.gender} onValueChange={(value) => handleInputChange("gender", value)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select gender" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="male">Male</SelectItem>
                        <SelectItem value="female">Female</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="chiefComplaint">Chief Complaint *</Label>
                  <Textarea
                    id="chiefComplaint"
                    placeholder="Enter the main reason for the visit"
                    value={patientData.chiefComplaint}
                    onChange={(e) => handleInputChange("chiefComplaint", e.target.value)}
                    rows={3}
                  />
                </div>
              </TabsContent>

              <TabsContent value="history" className="space-y-4">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="historyOfPresentIllness">History of Present Illness</Label>
                    <Textarea
                      id="historyOfPresentIllness"
                      placeholder="Describe the current illness or symptoms"
                      value={patientData.historyOfPresentIllness}
                      onChange={(e) => handleInputChange("historyOfPresentIllness", e.target.value)}
                      rows={4}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pastMedicalHistory">Past Medical History</Label>
                    <Textarea
                      id="pastMedicalHistory"
                      placeholder="Previous medical conditions, surgeries, hospitalizations"
                      value={patientData.pastMedicalHistory}
                      onChange={(e) => handleInputChange("pastMedicalHistory", e.target.value)}
                      rows={3}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="medications">Current Medications</Label>
                    <Textarea
                      id="medications"
                      placeholder="List current medications with dosages"
                      value={patientData.medications}
                      onChange={(e) => handleInputChange("medications", e.target.value)}
                      rows={3}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="allergies">Allergies</Label>
                    <Textarea
                      id="allergies"
                      placeholder="Known allergies and reactions"
                      value={patientData.allergies}
                      onChange={(e) => handleInputChange("allergies", e.target.value)}
                      rows={2}
                    />
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="examination" className="space-y-4">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="vitalSigns">Vital Signs</Label>
                    <Textarea
                      id="vitalSigns"
                      placeholder="BP, HR, Temp, RR, O2 Sat, Weight, Height"
                      value={patientData.vitalSigns}
                      onChange={(e) => handleInputChange("vitalSigns", e.target.value)}
                      rows={2}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="physicalExam">Physical Examination</Label>
                    <Textarea
                      id="physicalExam"
                      placeholder="Detailed physical examination findings"
                      value={patientData.physicalExam}
                      onChange={(e) => handleInputChange("physicalExam", e.target.value)}
                      rows={6}
                    />
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="results" className="space-y-4">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="labResults">Laboratory Results</Label>
                    <Textarea
                      id="labResults"
                      placeholder="Lab values, blood work, urinalysis, etc."
                      value={patientData.labResults}
                      onChange={(e) => handleInputChange("labResults", e.target.value)}
                      rows={4}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="imaging">Imaging Studies</Label>
                    <Textarea
                      id="imaging"
                      placeholder="X-rays, CT, MRI, ultrasound findings"
                      value={patientData.imaging}
                      onChange={(e) => handleInputChange("imaging", e.target.value)}
                      rows={4}
                    />
                  </div>
                </div>
              </TabsContent>
            </Tabs>

            <div className="flex justify-center pt-6">
              <Button
                onClick={handleGenerateFromEHR}
                size="lg"
                disabled={isGenerating || !patientData.patientId || !patientData.chiefComplaint}
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Generating SOAP Note...
                  </>
                ) : (
                  <>
                    <FileText className="mr-2 h-5 w-5" />
                    Generate SOAP Note from EHR
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
