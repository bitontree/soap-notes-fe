"use client";

import { useState, useEffect } from "react";
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
    email: "",
    phone: "",
    address: "",
  });

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
    
    setIsCreating(true);

    try {
      const patientData = {
        firstname: firstNameValidation.value,
        lastname: lastNameValidation.value,
        age: parseInt(newPatient.age),
        gender: newPatient.gender,
        dob: newPatient.dob,
        email: newPatient.email || undefined,
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
      setNewPatient({
        age: "",
        gender: "",
        dob: "",
        email: "",
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
                  <Label htmlFor="patient">Select Patient *</Label>
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
                  <div className="p-4 bg-blue-50 rounded-lg">
                    <h4 className="font-medium text-blue-900 mb-2">
                      Selected Patient
                    </h4>
                    <div className="space-y-1 text-sm text-blue-800">
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
            <form onSubmit={handleCreatePatient} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstname">First Name *</Label>
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
                  <Label htmlFor="lastname">Last Name *</Label>
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
                  <Label htmlFor="age">Age *</Label>
                  <Input
                    id="age"
                    type="number"
                    min="0"
                    max="150"
                    value={newPatient.age}
                    onChange={(e) =>
                      setNewPatient({ ...newPatient, age: e.target.value })
                    }
                    placeholder="30"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="gender">Gender *</Label>
                  <Select
                    value={newPatient.gender}
                    onValueChange={(value) =>
                      setNewPatient({ ...newPatient, gender: value })
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
                  <Label htmlFor="dob">Date of Birth *</Label>
                  <Input
                    id="dob"
                    type="date"
                    value={newPatient.dob}
                    onChange={(e) =>
                      setNewPatient({ ...newPatient, dob: e.target.value })
                    }
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={newPatient.email}
                    onChange={(e) =>
                      setNewPatient({ ...newPatient, email: e.target.value })
                    }
                    placeholder="john@example.com"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={newPatient.phone}
                    onChange={(e) =>
                      setNewPatient({ ...newPatient, phone: e.target.value })
                    }
                    placeholder="+1 (555) 123-4567"
                  />
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
                  onClick={() => setActiveTab("select")}
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
