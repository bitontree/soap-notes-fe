"use client";

import { useState, useEffect, useMemo } from "react";
import { subDays, startOfToday, parseISO, isBefore, isValid } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { User, Plus, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { authApi } from "@/lib/api";
import { useNameValidation } from "@/hooks/use-name-validation";
import { useEmailValidation } from "@/hooks/use-email-validation";
import { DatePicker } from "@/components/ui/date-picker";

interface Patient {
  id: string;
  firstname: string;
  lastname: string;
  age: number;
  gender: string;
  dob: string;
  email?: string;
  phone?: string;
  address?: string;
  created_at: string;
}

interface PatientSelectorProps {
  selectedPatient: Patient | null;
  onPatientSelect: (patient: Patient | null) => void;
}

export default function PatientSelector({
  selectedPatient,
  onPatientSelect,
}: PatientSelectorProps) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [activeTab, setActiveTab] = useState("select");
  const { toast } = useToast();

  // Name validation hooks
  const firstNameValidation = useNameValidation("", { fieldName: "First Name" })
  const lastNameValidation = useNameValidation("", { fieldName: "Last Name" })

  // Form state for new patient (excluding names which are handled by validation hooks)
  const [newPatient, setNewPatient] = useState({
    age: "",
    gender: "",
    dob: "",
    phone: "",
    address: "",
  });

  // Inline error state for fields that don't currently have their own hooks
  const [fieldErrors, setFieldErrors] = useState<{ age?: string; gender?: string; phone?: string }>({})
  // Email validation hook (sanitizes on change)
  const emailValidation = useEmailValidation("")

  const latestDob = useMemo(() => subDays(startOfToday(), 1), [])
  const earliestDob = useMemo(() => new Date(1900, 0, 1), [])

  useEffect(() => {
    loadPatients();
  }, []);

  const loadPatients = async () => {
    setIsLoading(true);
    try {
      const patientsData = await authApi.getPatients();
      setPatients(patientsData);
    } catch (error: any) {
      console.error("Failed to load patients:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to load patients",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreatePatient = async (e: React.FormEvent) => {
    e.preventDefault();
    // Clear previous inline errors
    setFieldErrors({})
    // Smart validation: Only check for business rules that sanitization can't fix
    const isFirstNameValid = firstNameValidation.validate()
    const isLastNameValid = lastNameValidation.validate()

    if (!isFirstNameValid || !isLastNameValid) {
      const firstError = firstNameValidation.error
      const lastError = lastNameValidation.error
      
      // Only show toast for business rule violations (empty, too long)
      if (firstError?.includes('required') || firstError?.includes('must be') ||
          lastError?.includes('required') || lastError?.includes('must be')) {
        toast({
          title: "Name Required",
          description: "Please enter both first and last names",
          variant: "destructive",
        })
        return
      }
    }

    if (!newPatient.dob) {
      toast({
        title: "DOB Required",
        description: "Please select a valid date of birth",
        variant: "destructive",
      })
      return
    }

    const dobDate = parseISO(newPatient.dob)
    if (!isValid(dobDate) || !isBefore(dobDate, startOfToday())) {
      toast({
        title: "Invalid DOB",
        description: "Date of birth must be before today",
        variant: "destructive",
      })
      return
    }

    if (isBefore(dobDate, earliestDob)) {
      toast({
        title: "Invalid DOB",
        description: "Date of birth must be after Jan 1, 1900",
        variant: "destructive",
      })
      return
    }
    
    setIsCreating(true);

    // Additional required-field checks for fields marked with asterisk in the UI
    // Age
    const ageNum = Number(newPatient.age)
    if (!newPatient.age || Number.isNaN(ageNum) || ageNum < 0 || ageNum > 150) {
      setIsCreating(false)
      setFieldErrors(prev => ({ ...prev, age: "Please enter a valid age between 0 and 150" }))
      toast({ title: "Age Required", description: "Please enter a valid age", variant: "destructive" })
      return
    }

    // Gender
    if (!newPatient.gender) {
      setIsCreating(false)
      setFieldErrors(prev => ({ ...prev, gender: "Please select a gender" }))
      toast({ title: "Gender Required", description: "Please select a gender", variant: "destructive" })
      return
    }

    // Email: must validate via hook
    const isEmailValid = emailValidation.validate()
    if (!isEmailValid) {
      setIsCreating(false)
      toast({ title: "Email Required", description: "Please enter a valid email address", variant: "destructive" })
      return
    }

    // Phone: required in UI; do a simple non-empty check
    if (!newPatient.phone || newPatient.phone.trim().length === 0) {
      setIsCreating(false)
      setFieldErrors(prev => ({ ...prev, phone: "Please enter a phone number" }))
      toast({ title: "Phone Required", description: "Please enter a phone number", variant: "destructive" })
      return
    }

    try {
      const patientData = {
        firstname: firstNameValidation.value,
        lastname: lastNameValidation.value,
        age: parseInt(newPatient.age),
        gender: newPatient.gender,
        dob: newPatient.dob,
        email: emailValidation.value || undefined,
        phone: newPatient.phone || undefined,
        address: newPatient.address || undefined,
      };

      const createdPatient = await authApi.createPatient(patientData);

      setPatients([...patients, createdPatient]);
      onPatientSelect(createdPatient);
      setActiveTab("select");

      // Reset form
      firstNameValidation.reset()
      lastNameValidation.reset()
      emailValidation.reset()
      setNewPatient({
        age: "",
        gender: "",
        dob: "",
        phone: "",
        address: "",
      });

      toast({
        title: "Patient Created",
        description: `${createdPatient.firstname} ${createdPatient.lastname} has been added successfully`,
      });
    } catch (error: any) {
      console.error("Failed to create patient:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to create patient",
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
    }
  };

  const formatPatientDisplay = (patient: Patient) => {
    return `${patient.firstname} ${patient.lastname} (${patient.age} years, ${patient.gender})`;
  };

  const calculateAge = (dob: string) => {
    const birthDate = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();

    if (
      monthDiff < 0 ||
      (monthDiff === 0 && today.getDate() < birthDate.getDate())
    ) {
      age--;
    }

    return age;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <User className="h-5 w-5" /> Patient Information
        </CardTitle>
        <CardDescription>
          Select an existing patient or create a new one
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="select">Select Patient</TabsTrigger>
            <TabsTrigger value="create">Create New Patient</TabsTrigger>
          </TabsList>

          <TabsContent value="select" className="space-y-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin mr-2" />
                <span>Loading patients...</span>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="patient">Select Patient <span className="text-red-500">*</span></Label>
                  <Select
                    value={selectedPatient?.id || ""}
                    onValueChange={(value) => {
                      const patient = patients.find((p) => p.id === value);
                      onPatientSelect(patient || null);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a patient..." />
                    </SelectTrigger>
                    <SelectContent>
                      {patients.map((patient) => (
                        <SelectItem key={patient.id} value={patient.id}>
                          <div className="flex justify-between w-full">
                            <span>
                              {patient.firstname} {patient.lastname} -{" "}
                              {patient.age} yrs -{" "}
                              {new Date(patient.dob).toLocaleDateString()}
                            </span>
                            <Badge variant="secondary" className="ml-2">
                              {patient.gender}
                            </Badge>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {selectedPatient && (
                  <div className="p-4 bg-emerald-50 rounded-lg">
                    <h4 className="font-medium text-emerald-900 mb-2">
                      Selected Patient
                    </h4>
                    <div className="space-y-1 text-sm text-emerald-800">
                      <p>
                        <strong>Name:</strong> {selectedPatient.firstname}{" "}
                        {selectedPatient.lastname}
                      </p>
                      <p>
                        <strong>Age:</strong> {selectedPatient.age} years
                      </p>
                      <p>
                        <strong>Gender:</strong> {selectedPatient.gender}
                      </p>
                      <p>
                        <strong>DOB:</strong>{" "}
                        {new Date(selectedPatient.dob).toLocaleDateString()}
                      </p>
                      {selectedPatient.email && (
                        <p>
                          <strong>Email:</strong> {selectedPatient.email}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {patients.length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    <User className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                    <p>No patients found</p>
                    <p className="text-sm">
                      Create your first patient to get started
                    </p>
                  </div>
                )}
              </>
            )}
          </TabsContent>

          <TabsContent value="create" className="space-y-4">
            <form onSubmit={handleCreatePatient} noValidate className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstname">First Name <span className="text-red-500">*</span></Label>
                  <Input
                    id="firstname"
                    value={firstNameValidation.value}
                    onChange={firstNameValidation.handleChange}
                    onBlur={firstNameValidation.handleBlur}
                    placeholder="John"
                    className={firstNameValidation.displayError ? "border-red-500" : ""}
                    required
                  />
                  {firstNameValidation.displayError && (
                    <p className="text-sm text-red-500">{firstNameValidation.displayError}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastname">Last Name <span className="text-red-500">*</span></Label>
                  <Input
                    id="lastname"
                    value={lastNameValidation.value}
                    onChange={lastNameValidation.handleChange}
                    onBlur={lastNameValidation.handleBlur}
                    placeholder="Doe"
                    className={lastNameValidation.displayError ? "border-red-500" : ""}
                    required
                  />
                  {lastNameValidation.displayError && (
                    <p className="text-sm text-red-500">{lastNameValidation.displayError}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="age">Age <span className="text-red-500">*</span></Label>
                  <Input
                    id="age"
                    type="number"
                    min="0"
                    max="150"
                    value={newPatient.age}
                    onChange={(e) =>
                      {
                        setNewPatient({ ...newPatient, age: e.target.value })
                        // Clear age error when user types
                        setFieldErrors(prev => ({ ...prev, age: undefined }))
                      }
                    }
                    placeholder="30"
                    className={fieldErrors.age ? 'border-red-500' : ''}
                  />
                  {fieldErrors.age && (
                    <p className="text-sm text-red-500">{fieldErrors.age}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="gender">Gender <span className="text-red-500">*</span></Label>
                  <Select
                    value={newPatient.gender}
                    onValueChange={(value) =>
                      {
                        setNewPatient({ ...newPatient, gender: value })
                        setFieldErrors(prev => ({ ...prev, gender: undefined }))
                      }
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select gender" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Male">Male</SelectItem>
                      <SelectItem value="Female">Female</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="dob">Date of Birth <span className="text-red-500">*</span></Label>
                  <DatePicker
                    id="dob"
                    value={newPatient.dob || null}
                    onChange={(value) =>
                      setNewPatient({ ...newPatient, dob: value ?? "" })
                    }
                    maxDate={latestDob}
                    minDate={earliestDob}
                    placeholder="Select date"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email<span className="text-red-500">*</span></Label>
                  <Input
                    id="email"
                    type="email"
                    value={emailValidation.value}
                    onChange={emailValidation.handleChange}
                    onBlur={emailValidation.validate}
                    placeholder="john@example.com"
                    className={emailValidation.error ? "border-red-500" : ""}
                  />
                  {emailValidation.error && (
                    <p className="text-sm text-red-500">{emailValidation.error}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone">Phone<span className="text-red-500">*</span></Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={newPatient.phone}
                    onChange={(e) =>
                      {
                        setNewPatient({ ...newPatient, phone: e.target.value })
                        setFieldErrors(prev => ({ ...prev, phone: undefined }))
                      }
                    }
                    placeholder="+1 (555) 123-4567"
                    className={fieldErrors.phone ? 'border-red-500' : ''}
                  />
                  {fieldErrors.phone && (
                    <p className="text-sm text-red-500">{fieldErrors.phone}</p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="address">Address</Label>
                <Input
                  id="address"
                  value={newPatient.address}
                  onChange={(e) =>
                    setNewPatient({ ...newPatient, address: e.target.value })
                  }
                  placeholder="123 Main St, City, State 12345"
                />
              </div>

              <div className="flex gap-2">
                <Button type="submit" disabled={isCreating}>
                  {isCreating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Plus className="mr-2 h-4 w-4" />
                      Create Patient
                    </>
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    emailValidation.reset()
                    setActiveTab("select")
                  }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
