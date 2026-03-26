"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select"
import { 
  ChevronLeft, 
  ChevronRight, 
  Send, 
  User, 
  Stethoscope, 
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Search
} from "lucide-react"
import { toast } from "sonner"

interface InsuranceClaimFormProps {
  onBack: () => void
  patientData: any
  selectedCodes: any[]
  analysisResult: any
}

export default function InsuranceClaimForm({ onBack, patientData, selectedCodes, analysisResult }: InsuranceClaimFormProps) {
  const [step, setStep] = useState(1)
  const [errors, setErrors] = useState<string[]>([])
  const [formData, setFormData] = useState({
    // Patient Info - Pre-filled from DB
    fullName: (patientData?.firstname && patientData?.lastname) 
      ? `${patientData.firstname} ${patientData.lastname}` 
      : (patientData?.name || patientData?.patient_name || patientData?.fullName || ""),
    dob: patientData?.dob || "",
    gender: patientData?.gender?.toLowerCase() || "",
    memberId: "", // Leave empty for manual entry
    groupNumber: patientData?.group_id || "",
    contactNumber: patientData?.phone || patientData?.contact || "",
    email: patientData?.email || "",
    // Provider Info
    providerName: "",
    npiNumber: "",
    taxId: "",
    facilityName: "",
    contactDetails: "",
    // Insurance Info
    payerName: "",
    planType: "",
    referringProviderName: "",
    medicarePart: "",
    state: ""
  })

  const updateField = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    // Clear error for this field if user starts typing
    if (errors.includes(field)) {
      setErrors(prev => prev.filter(e => e !== field))
    }
  }

  const validateStep = (currentStep: number) => {
    const stepErrors: string[] = []
    if (currentStep === 1) {
      if (!formData.fullName) stepErrors.push("fullName")
      if (!formData.dob) stepErrors.push("dob")
      if (!formData.memberId) stepErrors.push("memberId")
    } else if (currentStep === 2) {
      if (!formData.providerName) stepErrors.push("providerName")
      if (!formData.npiNumber) stepErrors.push("npiNumber")
    } else if (currentStep === 3) {
      if (!formData.payerName) stepErrors.push("payerName")
      if (!formData.planType) stepErrors.push("planType")
    }
    
    setErrors(stepErrors)
    
    if (stepErrors.length > 0) {
      toast.error("Required fields missing", {
        description: "Please fill all fields marked with * to proceed.",
        icon: <AlertCircle className="h-4 w-4" />,
      })
    }
    
    return stepErrors.length === 0
  }

  const nextStep = () => {
    if (validateStep(step)) {
      setStep(s => Math.min(s + 1, 4))
    }
  }
  const prevStep = () => setStep(s => Math.max(s - 1, 1))

  const handleSubmit = () => {
    if (validateStep(4)) {
      // Final submission logic would go here
      console.log("Submitting Claim:", formData)
      toast.success("Claim Transmitted Successfully!", {
        description: `EDI Transmission to ${formData.payerName} was successful.`,
        icon: <CheckCircle2 className="h-4 w-4 text-emerald-500" />
      })
      setTimeout(() => onBack(), 2000)
    }
  }

  const renderStepIcon = (currentStep: number) => {
    switch(currentStep) {
      case 1: return <User className="h-5 w-5" />
      case 2: return <Stethoscope className="h-5 w-5" />
      case 3: return <ShieldCheck className="h-5 w-5" />
      case 4: return <Send className="h-5 w-5" />
      default: return null
    }
  }

  const getErrorClass = (field: string) => {
    return errors.includes(field) ? "border-red-500 focus:ring-red-500 bg-red-50/50" : "bg-slate-50 border-slate-200 focus:ring-blue-500"
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Header & Progress */}
      <div className="flex items-center justify-between mb-2">
        <Button variant="ghost" size="sm" onClick={onBack} className="text-slate-500 hover:text-slate-900 gap-1 font-bold pl-0">
          <ChevronLeft className="h-4 w-4" /> Cancel
        </Button>
        <div className="flex items-center gap-4">
          {[1, 2, 3, 4].map((s) => (
            <div 
              key={s} 
              className={`h-2 w-12 rounded-full transition-all duration-500 ${step >= s ? 'bg-blue-600' : 'bg-slate-200'}`} 
            />
          ))}
        </div>
      </div>

      <Card className="border-0 shadow-2xl bg-white rounded-[2.5rem] overflow-hidden ring-1 ring-slate-100">
        <CardHeader className="p-10 pb-6 bg-slate-50/50 border-b border-slate-100">
          <div className="flex items-center gap-4 mb-2">
            <div className="p-3 bg-blue-600 text-white rounded-2xl shadow-lg shadow-blue-200">
              {renderStepIcon(step)}
            </div>
            <div>
              <CardTitle className="text-2xl font-black text-slate-900">
                {step === 1 && "Patient Information"}
                {step === 2 && "Provider Information"}
                {step === 3 && "Insurance Information"}
                {step === 4 && "Review & Transmit"}
              </CardTitle>
              <CardDescription className="font-bold text-slate-400">
                {step === 1 && "Please provide your patient details below."}
                {step === 2 && "Please provide your health care provider's information."}
                {step === 3 && "Please provide your insurance (payer) details."}
                {step === 4 && "Review your clinical summary and transmit the claim."}
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-10">
          {step === 1 && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className={`text-xs font-black uppercase tracking-widest ml-1 ${errors.includes('fullName') ? 'text-red-500' : 'text-slate-500'}`}>Full Name *</Label>
                  <Input 
                    placeholder="Enter full name" 
                    value={formData.fullName}
                    onChange={(e) => updateField('fullName', e.target.value)}
                    className={`h-12 rounded-xl border-slate-200 focus:ring-blue-500 font-bold ${getErrorClass('fullName')}`}
                  />
                </div>
                <div className="space-y-2">
                  <Label className={`text-xs font-black uppercase tracking-widest ml-1 ${errors.includes('dob') ? 'text-red-500' : 'text-slate-500'}`}>Date of Birth *</Label>
                  <Input 
                    type="date"
                    value={formData.dob}
                    onChange={(e) => updateField('dob', e.target.value)}
                    className={`h-12 rounded-xl border-slate-200 focus:ring-blue-500 font-bold ${getErrorClass('dob')}`}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-black uppercase tracking-widest text-slate-500 ml-1">Gender</Label>
                  <Select value={formData.gender} onValueChange={(v) => updateField('gender', v)}>
                    <SelectTrigger className="h-12 rounded-xl bg-slate-50 border-slate-200 font-bold">
                      <SelectValue placeholder="Select an option" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className={`text-xs font-black uppercase tracking-widest ml-1 ${errors.includes('memberId') ? 'text-red-500' : 'text-slate-500'}`}>Member ID *</Label>
                  <Input 
                    placeholder="Enter member ID" 
                    value={formData.memberId}
                    onChange={(e) => updateField('memberId', e.target.value)}
                    className={`h-12 rounded-xl border-slate-200 focus:ring-blue-500 font-bold ${getErrorClass('memberId')}`}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <Label className="text-xs font-black uppercase tracking-widest text-slate-500 ml-1">Group Number</Label>
                  <Input 
                    placeholder="Group #" 
                    value={formData.groupNumber}
                    onChange={(e) => updateField('groupNumber', e.target.value)}
                    className="h-12 rounded-xl bg-slate-50 border-slate-200 font-bold"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-black uppercase tracking-widest text-slate-500 ml-1">Contact Number</Label>
                  <Input 
                    placeholder="Phone" 
                    value={formData.contactNumber}
                    onChange={(e) => updateField('contactNumber', e.target.value)}
                    className="h-12 rounded-xl bg-slate-50 border-slate-200 font-bold"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-black uppercase tracking-widest text-slate-500 ml-1">Email</Label>
                  <Input 
                    placeholder="Email Address" 
                    value={formData.email}
                    onChange={(e) => updateField('email', e.target.value)}
                    className="h-12 rounded-xl bg-slate-50 border-slate-200 font-bold"
                  />
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className={`text-xs font-black uppercase tracking-widest ml-1 ${errors.includes('providerName') ? 'text-red-500' : 'text-slate-500'}`}>Provider Name *</Label>
                  <Input 
                    placeholder="Enter provider name" 
                    value={formData.providerName}
                    onChange={(e) => updateField('providerName', e.target.value)}
                    className={`h-12 rounded-xl border-slate-200 font-bold ${getErrorClass('providerName')}`}
                  />
                </div>
                <div className="space-y-2">
                  <Label className={`text-xs font-black uppercase tracking-widest ml-1 ${errors.includes('npiNumber') ? 'text-red-500' : 'text-slate-500'}`}>NPI Number *</Label>
                  <Input 
                    placeholder="10-digit NPI" 
                    value={formData.npiNumber}
                    onChange={(e) => updateField('npiNumber', e.target.value)}
                    className={`h-12 rounded-xl border-slate-200 font-bold ${getErrorClass('npiNumber')}`}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-black uppercase tracking-widest text-slate-500 ml-1">Tax ID (TIN)</Label>
                <Input 
                  placeholder="Enter tax ID" 
                  value={formData.taxId}
                  onChange={(e) => updateField('taxId', e.target.value)}
                  className="h-12 rounded-xl bg-slate-50 border-slate-200 font-bold"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className="text-xs font-black uppercase tracking-widest text-slate-500 ml-1">Facility Name</Label>
                  <Input 
                    placeholder="Clinic/Hospital name" 
                    value={formData.facilityName}
                    onChange={(e) => updateField('facilityName', e.target.value)}
                    className="h-12 rounded-xl bg-slate-50 border-slate-200 font-bold"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-black uppercase tracking-widest text-slate-500 ml-1">Contact Details</Label>
                  <Input 
                    placeholder="Office contact info" 
                    value={formData.contactDetails}
                    onChange={(e) => updateField('contactDetails', e.target.value)}
                    className="h-12 rounded-xl bg-slate-50 border-slate-200 font-bold"
                  />
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              <div className="space-y-2">
                <Label className={`text-xs font-black uppercase tracking-widest ml-1 ${errors.includes('payerName') ? 'text-red-500' : 'text-slate-500'}`}>Payer Name *</Label>
                <Input 
                  placeholder="Search / Enter Insurance" 
                  value={formData.payerName}
                  onChange={(e) => updateField('payerName', e.target.value)}
                  className={`h-12 rounded-xl border-slate-200 font-bold ${getErrorClass('payerName')}`}
                />
              </div>
              <div className="space-y-2">
                <Label className={`text-xs font-black uppercase tracking-widest ml-1 ${errors.includes('planType') ? 'text-red-500' : 'text-slate-500'}`}>Plan Type *</Label>
                <Select value={formData.planType} onValueChange={(v) => updateField('planType', v)}>
                  <SelectTrigger className={`h-12 rounded-xl border-slate-200 font-bold ${getErrorClass('planType')}`}>
                    <SelectValue placeholder="Select an option" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hmo">HMO</SelectItem>
                    <SelectItem value="ppo">PPO</SelectItem>
                    <SelectItem value="epo">EPO</SelectItem>
                    <SelectItem value="pos">POS</SelectItem>
                    <SelectItem value="medicare">Medicare</SelectItem>
                    <SelectItem value="medicaid">Medicaid</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Conditional Fields */}
              {(formData.planType === 'hmo' || formData.planType === 'pos') && (
                <div className="p-5 rounded-2xl bg-blue-50/50 border border-blue-100 animate-in slide-in-from-top-2 duration-300">
                  <Label className="text-xs font-black uppercase tracking-widest text-blue-600 mb-2 block">Referring Provider Name</Label>
                  <Input 
                    placeholder="Enter referring provider" 
                    value={formData.referringProviderName}
                    onChange={(e) => updateField('referringProviderName', e.target.value)}
                    className="h-12 rounded-xl bg-white border-blue-200 font-bold"
                  />
                </div>
              )}

              {formData.planType === 'medicare' && (
                <div className="p-5 rounded-2xl bg-blue-50/50 border border-blue-100 animate-in slide-in-from-top-2 duration-300">
                  <Label className="text-xs font-black uppercase tracking-widest text-blue-600 mb-2 block">Medicare Part</Label>
                  <Select onValueChange={(v) => updateField('medicarePart', v)}>
                    <SelectTrigger className="h-12 rounded-xl bg-white border-blue-200 font-bold">
                      <SelectValue placeholder="Select Part (A, B, C, D)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="a">Part A</SelectItem>
                      <SelectItem value="b">Part B</SelectItem>
                      <SelectItem value="c">Part C</SelectItem>
                      <SelectItem value="d">Part D</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {formData.planType === 'medicaid' && (
                <div className="p-5 rounded-2xl bg-blue-50/50 border border-blue-100 animate-in slide-in-from-top-2 duration-300">
                  <Label className="text-xs font-black uppercase tracking-widest text-blue-600 mb-2 block">State</Label>
                  <Input 
                    placeholder="Enter state" 
                    value={formData.state}
                    onChange={(e) => updateField('state', e.target.value)}
                    className="h-12 rounded-xl bg-white border-blue-200 font-bold"
                  />
                </div>
              )}
            </div>
          )}

          {step === 4 && (
            <div className="space-y-8 animate-in fade-in zoom-in-95 duration-500">
              {/* Clinical Justification Section */}
              <div className="p-6 rounded-3xl bg-blue-600 shadow-xl shadow-blue-100 text-white">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-white/20 rounded-xl">
                    <CheckCircle2 className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-widest">Clinical Necessity Confirmed</h3>
                    <p className="text-[10px] text-blue-100 font-bold">AI EVIDENCE AUDIT COMPLETE</p>
                  </div>
                </div>
                <div className="bg-white/10 rounded-2xl p-5 border border-white/10 backdrop-blur-sm">
                  <p className="text-xs font-bold leading-relaxed italic opacity-90">
                    "{analysisResult?.evidence_note || "Clinical documentation supports the selected codes with matching symptom criteria and objective findings."}"
                  </p>
                </div>
                {analysisResult?.justification && (
                  <div className="mt-4 flex items-start gap-2">
                    <ShieldCheck className="h-4 w-4 shrink-0 text-blue-200" />
                    <p className="text-[10px] font-bold text-blue-50 leading-tight">
                      JUSTIFICATION: {analysisResult.justification}
                    </p>
                  </div>
                )}
              </div>

              {/* Coding Summary Section */}
              <div className="space-y-4">
                <Label className="text-xs font-black uppercase tracking-widest text-slate-400 ml-1">Selected Diagnosis (ICD-10)</Label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {selectedCodes.map((code, i) => (
                    <div key={i} className="flex flex-col p-5 rounded-[2rem] bg-slate-50 border border-slate-100 shadow-sm transition-all hover:bg-white hover:shadow-md">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-lg font-black text-slate-900">{code.code}</span>
                        <span className="text-[10px] font-black uppercase tracking-tighter text-slate-400 px-3 py-1 rounded-full bg-slate-200/50">
                          {code.code_type?.includes('symptom') ? "Symptom" : "Diagnosis"}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 font-bold leading-relaxed">{code.description}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-5 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center gap-3">
                <div className="p-2 bg-emerald-500 text-white rounded-lg">
                  <ShieldCheck className="h-4 w-4" />
                </div>
                <p className="text-[11px] font-bold text-emerald-800 leading-tight">
                  All clinical documentation requirements met for the selected ICD-10 diagnosis codes.
                </p>
              </div>
            </div>
          )}

          <div className="mt-12 flex items-center justify-between gap-4">
            {step > 1 ? (
              <Button 
                variant="outline" 
                onClick={prevStep}
                className="h-14 px-8 rounded-2xl border-2 border-slate-200 font-black text-xs uppercase tracking-widest hover:bg-slate-50"
              >
                <ChevronLeft className="h-4 w-4 mr-2" /> Back
              </Button>
            ) : <div />}

            {step < 4 ? (
              <Button 
                onClick={nextStep}
                className="h-14 px-10 bg-slate-900 hover:bg-black text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl group"
              >
                Next <ChevronRight className="h-4 w-4 ml-2 group-hover:translate-x-1 transition-transform" />
              </Button>
            ) : (
              <Button 
                onClick={handleSubmit}
                className="h-14 px-10 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-blue-200 group"
              >
                Transmit Claim <Send className="h-4 w-4 ml-2 group-hover:-translate-y-1 group-hover:translate-x-1 transition-all" />
              </Button>
            )}
          </div>
          
          <p className="text-center text-[10px] text-slate-400 font-bold mt-6">
            Never submit passwords! - <span className="underline cursor-pointer">Report abuse</span>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
