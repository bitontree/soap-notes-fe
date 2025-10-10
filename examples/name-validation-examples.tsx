/**
 * Example component demonstrating how to use the name validation utilities
 * This file shows different approaches to implementing name validation in your components
 */

import React, { useState } from 'react';
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { validateName, createNameInputHandler } from "@/lib/utils";
import { useNameValidation } from "@/hooks/use-name-validation";

// Approach 1: Using the useNameValidation hook (Recommended)
export function NameFormWithHook() {
  const { toast } = useToast();
  const firstNameValidation = useNameValidation("", { fieldName: "First Name" });
  const lastNameValidation = useNameValidation("", { fieldName: "Last Name" });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate both names
    const isFirstNameValid = firstNameValidation.validate();
    const isLastNameValid = lastNameValidation.validate();

    if (!isFirstNameValid || !isLastNameValid) {
      toast({
        title: "Validation Error",
        description: "Please fix the name fields",
        variant: "destructive",
      });
      return;
    }

    // Proceed with form submission
    console.log("Form submitted:", {
      firstName: firstNameValidation.value,
      lastName: lastNameValidation.value,
    });
    
    toast({
      title: "Success",
      description: "Names are valid!",
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="firstName">First Name</Label>
        <Input
          id="firstName"
          value={firstNameValidation.value}
          onChange={firstNameValidation.handleChange}
          onBlur={firstNameValidation.handleBlur}
          className={firstNameValidation.displayError ? "border-red-500" : ""}
          placeholder="Enter your first name"
        />
        {firstNameValidation.displayError && (
          <p className="text-sm text-red-500 mt-1">{firstNameValidation.displayError}</p>
        )}
      </div>

      <div>
        <Label htmlFor="lastName">Last Name</Label>
        <Input
          id="lastName"
          value={lastNameValidation.value}
          onChange={lastNameValidation.handleChange}
          onBlur={lastNameValidation.handleBlur}
          className={lastNameValidation.displayError ? "border-red-500" : ""}
          placeholder="Enter your last name"
        />
        {lastNameValidation.displayError && (
          <p className="text-sm text-red-500 mt-1">{lastNameValidation.displayError}</p>
        )}
      </div>

      <Button 
        type="submit" 
        disabled={!firstNameValidation.isValid || !lastNameValidation.isValid}
      >
        Submit
      </Button>
    </form>
  );
}

// Approach 2: Using the validation functions directly
export function NameFormWithDirectValidation() {
  const { toast } = useToast();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [firstNameError, setFirstNameError] = useState<string | null>(null);
  const [lastNameError, setLastNameError] = useState<string | null>(null);

  const handleFirstNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setFirstName(value);
    
    // Validate on change
    const validation = validateName(value, "First Name");
    setFirstNameError(validation.isValid ? null : validation.error);
  };

  const handleLastNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setLastName(value);
    
    // Validate on change
    const validation = validateName(value, "Last Name");
    setLastNameError(validation.isValid ? null : validation.error);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Final validation
    const firstNameValidation = validateName(firstName, "First Name");
    const lastNameValidation = validateName(lastName, "Last Name");

    if (!firstNameValidation.isValid || !lastNameValidation.isValid) {
      setFirstNameError(firstNameValidation.error);
      setLastNameError(lastNameValidation.error);
      
      toast({
        title: "Validation Error",
        description: "Please fix the name fields",
        variant: "destructive",
      });
      return;
    }

    // Proceed with form submission
    console.log("Form submitted:", { firstName, lastName });
    
    toast({
      title: "Success",
      description: "Names are valid!",
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="firstName">First Name</Label>
        <Input
          id="firstName"
          value={firstName}
          onChange={handleFirstNameChange}
          className={firstNameError ? "border-red-500" : ""}
          placeholder="Enter your first name"
        />
        {firstNameError && (
          <p className="text-sm text-red-500 mt-1">{firstNameError}</p>
        )}
      </div>

      <div>
        <Label htmlFor="lastName">Last Name</Label>
        <Input
          id="lastName"
          value={lastName}
          onChange={handleLastNameChange}
          className={lastNameError ? "border-red-500" : ""}
          placeholder="Enter your last name"
        />
        {lastNameError && (
          <p className="text-sm text-red-500 mt-1">{lastNameError}</p>
        )}
      </div>

      <Button type="submit">Submit</Button>
    </form>
  );
}

// Approach 3: Using the createNameInputHandler helper
export function NameFormWithInputHandler() {
  const { toast } = useToast();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [firstNameError, setFirstNameError] = useState<string | null>(null);
  const [lastNameError, setLastNameError] = useState<string | null>(null);

  // Create input handlers that automatically sanitize and validate
  const handleFirstNameChange = createNameInputHandler(
    setFirstName,
    "First Name",
    setFirstNameError
  );

  const handleLastNameChange = createNameInputHandler(
    setLastName,
    "Last Name",
    setLastNameError
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Final validation
    const firstNameValidation = validateName(firstName, "First Name");
    const lastNameValidation = validateName(lastName, "Last Name");

    if (!firstNameValidation.isValid || !lastNameValidation.isValid) {
      toast({
        title: "Validation Error",
        description: "Please fix the name fields",
        variant: "destructive",
      });
      return;
    }

    // Proceed with form submission
    console.log("Form submitted:", { firstName, lastName });
    
    toast({
      title: "Success",
      description: "Names are valid!",
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="firstName">First Name</Label>
        <Input
          id="firstName"
          value={firstName}
          onChange={handleFirstNameChange}
          className={firstNameError ? "border-red-500" : ""}
          placeholder="Enter your first name"
        />
        {firstNameError && (
          <p className="text-sm text-red-500 mt-1">{firstNameError}</p>
        )}
      </div>

      <div>
        <Label htmlFor="lastName">Last Name</Label>
        <Input
          id="lastName"
          value={lastName}
          onChange={handleLastNameChange}
          className={lastNameError ? "border-red-500" : ""}
          placeholder="Enter your last name"
        />
        {lastNameError && (
          <p className="text-sm text-red-500 mt-1">{lastNameError}</p>
        )}
      </div>

      <Button type="submit">Submit</Button>
    </form>
  );
}