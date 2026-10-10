"use client"

import { useMemo, useState } from "react"
import type React from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Activity, CircleUserRound, CalendarIcon, Phone, KeyRound, IdCard, Check, X, Eye, EyeOff, AlertCircle } from "lucide-react"
import { Link } from "react-router-dom";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format, isValid, parse } from "date-fns"
import { Select, SelectTrigger, SelectValue, SelectItem, SelectContent } from "@/components/ui/select";
import type { RegisterData } from "@/contexts/auth-context";
import { Alert, AlertDescription } from "@/components/ui/alert";

export type PatientRegistrationFormProps = {
  submitFn: (data: RegisterData) => Promise<{ success: boolean; error?: string }>
  submitButtonLabel: string
  submitLoadingLabel: string
  successMessage: string
  leftFooter: React.ReactNode
  /** TechCare logo + link home (public register) */
  showPublicBranding?: boolean
  /** After success, clear all fields (e.g. nurse registering another patient) */
  clearOnSuccess?: boolean
  onSuccess?: () => void
  /** When set, validation/API errors use this (e.g. corner toast) instead of the inline red alert */
  onErrorNotification?: (message: string) => void
}

export function PatientRegistrationForm({
  submitFn,
  submitButtonLabel,
  submitLoadingLabel,
  successMessage,
  leftFooter,
  showPublicBranding = false,
  clearOnSuccess = false,
  onSuccess,
  onErrorNotification,
}: PatientRegistrationFormProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState(false);

    const reportError = (message: string) => {
      if (onErrorNotification) {
        onErrorNotification(message);
      } else {
        setError(message);
      }
    };
    
    // Basic fields (username = national ID / passport, synced below)
    const [email, setEmail] = useState("");
    const [emailError, setEmailError] = useState("");
    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    
    const [dob, setDob] = useState<Date | undefined>();
    const [dobInputValue, setDobInputValue] = useState("");
    const [dobError, setDobError] = useState("");
    const age = dob ? calculateAge(dob) : "";
    const [dobRelative, setDobRelative] = useState<Date | undefined>();
    const [dobRelativeInputValue, setDobRelativeInputValue] = useState("");
    const [dobRelativeError, setDobRelativeError] = useState("");
    const ageRelative = dobRelative ? calculateAge(dobRelative) : "";
    const [nationalId, setNationalId] = useState("");
    const accountUsername = useMemo(() => nationalId.trim(), [nationalId]);
    const [phone, setPhone] = useState("");
    const [sex, setSex] = useState<"male" | "female" | "other">("male");

    // Relative info state
    const [relativeNationalId, setRelativeNationalId] = useState("");
    const [relativeName, setRelativeName] = useState("");
    const [relativeRelationship, setRelativeRelationship] = useState("");
    const [relativeRelationshipOther, setRelativeRelationshipOther] = useState("");
    const [relativePhone, setRelativePhone] = useState("");
    const [relativeSex, setRelativeSex] = useState<"male" | "female" | "other">("male");
    const [relativeEmail, setRelativeEmail] = useState("");
    const [relativeEmailError, setRelativeEmailError] = useState("");

    // Insurance info state
    const [insuranceId, setInsuranceId] = useState("");
    const [insuranceProvider, setInsuranceProvider] = useState("");
    const [insuranceExpiry, setInsuranceExpiry] = useState<Date | undefined>();
    const [insuranceExpiryInputValue, setInsuranceExpiryInputValue] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    // check length of password
    const has8Chars = password.length >= 8;
    // check password must have Upper char
    const hasUppercase = /[A-Z]/.test(password);
    // check password must have at least one digit
    const hasDigit = /\d/.test(password);
    // check password must have at least 1 special character (non-alphanumeric, non-whitespace)
    const hasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]+/.test(password);
    const passwordsMatch = password === confirmPassword && password.length > 0;
    const [showPassword, setShowPassword] = useState(false);

    const syncNationalId = (value: string) => {
      // Only keep digits for National ID input.
      const digitsOnly = value.replace(/\D/g, "").slice(0, 12);
      setNationalId(digitsOnly);
    };
    const syncFirstName = (value: string) => {
      setFirstName(value);
    };
    const syncLastName = (value: string) => {
      setLastName(value);
    };
    const syncPhone = (value: string) => {
      const digitsOnly = value.replace(/\D/g, "").slice(0, 10);
      setPhone(digitsOnly);
    };
    const syncRelativeNationalId = (value: string) => {
      const digitsOnly = value.replace(/\D/g, "").slice(0, 12);
      setRelativeNationalId(digitsOnly);
    };
    const syncRelativePhone = (value: string) => {
      const digitsOnly = value.replace(/\D/g, "").slice(0, 10);
      setRelativePhone(digitsOnly);
    };
    const syncPassword = (value: string) => {
      setPassword(value);
    };
    const syncConfirmPassword = (value: string) => {
      setConfirmPassword(value);
    };
    
    const resetFormFields = () => {
      setEmail("");
      setEmailError("");
      setFirstName("");
      setLastName("");
      setDob(undefined);
      setDobInputValue("");
      setDobError("");
      setDobRelative(undefined);
      setDobRelativeInputValue("");
      setDobRelativeError("");
      setNationalId("");
      setPhone("");
      setSex("male");
      setRelativeNationalId("");
      setRelativeName("");
      setRelativeRelationship("");
      setRelativeRelationshipOther("");
      setRelativePhone("");
      setRelativeSex("male");
      setRelativeEmail("");
      setRelativeEmailError("");
      setInsuranceId("");
      setInsuranceProvider("");
      setInsuranceExpiry(undefined);
      setInsuranceExpiryInputValue("");
      setPassword("");
      setConfirmPassword("");
    };

    const formatDateInput = (raw: string) => {
      const digits = raw.replace(/\D/g, "").slice(0, 8);
      if (digits.length <= 2) return digits;
      if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
      return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
    };

    const parseDateInput = (value: string) => {
      if (!value) return undefined;
      const parsedDate = parse(value, "dd/MM/yyyy", new Date());
      if (!isValid(parsedDate)) return undefined;
      // Prevent partial/overflow dates from being accepted.
      if (format(parsedDate, "dd/MM/yyyy") !== value) return undefined;
      return parsedDate;
    };

    const isBeforeToday = (date: Date) => {
      const candidate = new Date(date);
      candidate.setHours(0, 0, 0, 0);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return candidate < today;
    };

    const validateDob = (date: Date | undefined, rawInput?: string) => {
      if (!date) {
        if (rawInput && rawInput.length === 10) {
          return "Invalid date. Please use dd/mm/yyyy.";
        }
        return "";
      }
      if (!isBeforeToday(date)) {
        return "Date of birth must be earlier than today.";
      }
      return "";
    };

    const validateEmail = (value: string) => {
      const trimmed = value.trim();
      if (!trimmed) return "";
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      return emailRegex.test(trimmed) ? "" : "Invalid email format";
    };

    const handleRegister = async (e: React.FormEvent) => {
      e.preventDefault();
      setError("");

      if (!password || !firstName?.trim() || !lastName?.trim()) {
        reportError("Please fill in all required fields");
        return;
      }

      if (!relativeName.trim() || !relativeRelationship || !relativePhone.trim()) {
        reportError("Please fill in all required relative information fields");
        return;
      }

      const relativeRelationshipValue =
        relativeRelationship === "other"
          ? relativeRelationshipOther.trim()
          : relativeRelationship;
      if (!relativeRelationshipValue) {
        reportError("Please enter relationship details");
        return;
      }

      const emailTrimmed = email.trim();
      const emailValidationError = validateEmail(emailTrimmed);
      if (emailValidationError) {
        setEmailError(emailValidationError);
        reportError(emailValidationError);
        return;
      }

      const relativeEmailTrimmed = relativeEmail.trim();
      const relativeEmailValidationError = validateEmail(relativeEmailTrimmed);
      if (relativeEmailValidationError) {
        setRelativeEmailError(relativeEmailValidationError);
        reportError(relativeEmailValidationError);
        return;
      }

      if (!passwordsMatch) {
        reportError("Passwords do not match");
        return;
      }

      if (!has8Chars || !hasUppercase || !hasDigit || !hasSpecial) {
        reportError("Password does not meet requirements");
        return;
      }

      // USER: idcard, sex, dob, tel NOT NULL
      if (!accountUsername || !dob || !phone.trim()) {
        reportError("Please fill in National ID / passport, date of birth, and phone number");
        return;
      }

      const dobValidationError = validateDob(dob);
      if (dobValidationError) {
        setDobError(dobValidationError);
        reportError(dobValidationError);
        return;
      }

      const dobRelativeValidationError = validateDob(dobRelative, dobRelativeInputValue);
      if (dobRelativeValidationError) {
        setDobRelativeError(dobRelativeValidationError);
        reportError(dobRelativeValidationError);
        return;
      }

      const mapSexToCode = (value: string | undefined) => {
        if (value === "female") return "F";
        if (value === "other") return "O";
        return "M";
      };

      setIsLoading(true);
      try {
        const result = await submitFn({
          username: accountUsername,
          email: emailTrimmed,
          password,
          firstName,
          lastName,
          age: parseInt(String(age), 10) || undefined,
          role: "patient",
          sex: mapSexToCode(sex),
          dob: dob ? format(dob, "yyyy-MM-dd") : undefined,
          tel: phone.trim(),
          idcard: accountUsername,
          relativeName,
          relativeRelationship: relativeRelationshipValue,
          relativeDateOfBirth: dobRelative ? format(dobRelative, "yyyy-MM-dd") : undefined,
          relativeSex: mapSexToCode(relativeSex),
          relativePhone,
          relativeEmail: relativeEmailTrimmed,
          relativeNationalId,
          insuranceId,
          insuranceProvider,
          insuranceExpiry: insuranceExpiry ? format(insuranceExpiry, "yyyy-MM-dd") : undefined,
        });

        if (result.success) {
          setSuccess(true);
          onSuccess?.();
          if (clearOnSuccess) {
            resetFormFields();
            window.setTimeout(() => setSuccess(false), 4000);
          }
        } else {
          reportError(result.error || "Registration failed. Please try again.");
        }
      } finally {
        setIsLoading(false);
      }
    };
    const [showPassword2, setShowPassword2] = useState(false);

  return (
    <div className="w-full flex flex-col py-10">
      {showPublicBranding ? (
        <Link to="/" className="group flex items-center justify-center gap-2 mb-8">
          <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-linear-to-br from-[#06b6d4] to-[#0891b2] p-0.5 shadow-lg">
            <div className="flex h-full w-full items-center justify-center rounded-lg">
              <Activity className="h-6 w-6 text-[#FFFFFF]" />
            </div>
          </div>
          <span className="text-2xl z-50 font-bold bg-linear-to-r from-[#06b6d4] to-[#0891b2] bg-clip-text text-transparent">
            TechCare
          </span>
        </Link>
      ) : null}

      <div className="w-full max-w-6xl flex flex-col gap-6 mx-auto">
        <form onSubmit={handleRegister} className="flex flex-col gap-6">
          {error && !onErrorNotification && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          
          {success && (
            <Alert className="bg-green-50 text-green-900 border-green-200">
              <Check className="h-4 w-4" />
              <AlertDescription>{successMessage}</AlertDescription>
            </Alert>
          )}

        {/* PERSONAL INFO */}
        <Card className="card-feature-group card-feature-hover-group">
          <CardHeader>
            <div className="flex items-center gap-2 icon-feature-card">
                <CircleUserRound />
                <CardTitle className="text-xl">Personal Information</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-2 gap-4">

            <div>
              <Label htmlFor="national-id">
                National ID / passport <span className="text-red-500">*</span>
              </Label>
              <Input 
                id="national-id"
                name="nationalId"
                aria-label="National ID"
                value={nationalId}
                onChange={(e) => syncNationalId(e.target.value)}
                onInput={(e) => syncNationalId((e.target as HTMLInputElement).value)}
                onBlur={(e) => syncNationalId(e.target.value)}
                className="custom-input"
                required
                maxLength={12}
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="off"
                placeholder="e.g. CCCD or passport number"
              />
            </div>

            <div>
              <Label htmlFor="username">Username (for login)</Label>
              <Input 
                id="username"
                name="username"
                aria-label="Username (for login)"
                placeholder="Matches National ID / passport"
                value={accountUsername}
                disabled
                className="custom-input bg-muted/60 cursor-not-allowed"
                aria-describedby="register-username-hint-personal"
              />
              <p id="register-username-hint-personal" className="text-xs text-muted-foreground mt-1">
                Same value as National ID / passport — used when you sign in.
              </p>
            </div>

            
            <div>
              <Label htmlFor="first-name">
                First Name <span className="text-red-500">*</span>
              </Label>
              <p className="text-xs text-muted-foreground mt-1 mb-1">
                Given name, e.g. <span className="font-medium">Van An</span>
              </p>
              <Input 
                id="first-name"
                name="firstName"
                aria-label="First Name"
                value={firstName}
                onChange={(e) => syncFirstName(e.target.value)}
                onInput={(e) => syncFirstName((e.target as HTMLInputElement).value)}
                onBlur={(e) => syncFirstName(e.target.value)}
                required
              />
            </div>

            <div>
              <Label htmlFor="last-name">
                Last Name <span className="text-red-500">*</span>
              </Label>
              <p className="text-xs text-muted-foreground mt-1 mb-1">
                Family name, e.g. <span className="font-medium">Nguyen</span>
              </p>
              <Input 
                id="last-name"
                name="lastName"
                aria-label="Last Name"
                value={lastName}
                onChange={(e) => syncLastName(e.target.value)}
                onInput={(e) => syncLastName((e.target as HTMLInputElement).value)}
                onBlur={(e) => syncLastName(e.target.value)}
                required
              />
            </div>


            <div>
              <Label htmlFor="dob-input">
                Date of Birth <span className="text-red-500">*</span>
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="dob-input"
                  value={dobInputValue}
                  onChange={(e) => {
                    const formattedInput = formatDateInput(e.target.value);
                    setDobInputValue(formattedInput);
                    if (formattedInput.length === 10) {
                      const parsedDate = parseDateInput(formattedInput);
                      setDob(parsedDate);
                      setDobError(validateDob(parsedDate, formattedInput));
                    } else {
                      setDobError("");
                    }
                  }}
                  onInput={(e) => {
                    const formattedInput = formatDateInput((e.target as HTMLInputElement).value);
                    setDobInputValue(formattedInput);
                    if (formattedInput.length === 10) {
                      const parsedDate = parseDateInput(formattedInput);
                      setDob(parsedDate);
                      setDobError(validateDob(parsedDate, formattedInput));
                    } else {
                      setDobError("");
                    }
                  }}
                  onBlur={(e) => {
                    const parsedDate = parseDateInput(e.target.value);
                    setDob(parsedDate);
                    setDobError(validateDob(parsedDate, e.target.value));
                    if (parsedDate) {
                      setDobInputValue(format(parsedDate, "dd/MM/yyyy"));
                    }
                  }}
                  placeholder="dd/mm/yyyy"
                  inputMode="numeric"
                  autoComplete="bday"
                  className="custom-input"
                  required
                />
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label="Open date picker"
                      className="shrink-0"
                    >
                      <CalendarIcon className="h-5 w-5 opacity-70" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="p-0">
                    <Calendar
                      mode="single"
                      selected={dob}
                      onSelect={(selectedDate) => {
                        setDob(selectedDate);
                        setDobError(validateDob(selectedDate));
                        setDobInputValue(selectedDate ? format(selectedDate, "dd/MM/yyyy") : "");
                      }}
                      captionLayout="dropdown"
                    />
                  </PopoverContent>
                </Popover>
              </div>
              {dobError ? <p className="mt-1 text-xs text-red-500">{dobError}</p> : null}
            </div>

            <div>
              <Label htmlFor="age">Age</Label>
              <Input id="age" name="age" aria-label="Age" value={age} disabled placeholder="Age" className="rounded-2xl ring-1 ring-gray-200"/>
            </div>

            <div>
              <Label htmlFor="phone">
                Phone Number <span className="text-red-500">*</span>
              </Label>
              <Input 
                id="phone"
                name="phone"
                aria-label="Phone Number"
                className="custom-input"
                value={phone}
                onChange={(e) => syncPhone(e.target.value)}
                onInput={(e) => syncPhone((e.target as HTMLInputElement).value)}
                onBlur={(e) => syncPhone(e.target.value)}
                required
                autoComplete="tel"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={10}
              />
            </div>


            <div>
              <Label htmlFor="sex">
                Sex <span className="text-red-500">*</span>
              </Label>
              <Select value={sex} onValueChange={(v) => setSex(v as any)}>
                <SelectTrigger id="sex" aria-label="Sex" className="custom-select transition-all duration-100 rounded-2xl">
                  <div className="text-sm font-normal bg-background text-muted-foreground">
                    <SelectValue placeholder="Male" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="md:col-span-2">
              <Label htmlFor="email">Email (optional)</Label>
              <Input 
                id="email"
                name="email"
                aria-label="Email"
                placeholder="user@example.com" 
                type="email"
                value={email}
                onChange={(e) => {
                  const value = e.target.value;
                  setEmail(value);
                  setEmailError(validateEmail(value));
                }}
                onInput={(e) => {
                  const value = (e.target as HTMLInputElement).value;
                  setEmail(value);
                  setEmailError(validateEmail(value));
                }}
                onBlur={(e) => {
                  const value = e.target.value;
                  setEmail(value);
                  setEmailError(validateEmail(value));
                }}
              />
              {emailError ? <p className="mt-1 text-xs text-red-500">{emailError}</p> : null}
            </div>
          </CardContent>
        </Card>

        {/* RELATIVE INFO */}
        <Card className="card-feature-group card-feature-hover-group">
          <CardHeader>
            <div className="flex items-center gap-2 icon-feature-card">
                <Phone />
                <CardTitle className="text-xl">Relative Information</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-2 gap-4">

            

            <div>
              <Label htmlFor="relative-national-id">National ID/passport</Label>
              <Input 
                id="relative-national-id"
                name="relativeNationalId"
                aria-label="Relative National ID/passport"
                className="custom-input"
                value={relativeNationalId}
                onChange={(e) => syncRelativeNationalId(e.target.value)}
                onInput={(e) => syncRelativeNationalId((e.target as HTMLInputElement).value)}
                onBlur={(e) => syncRelativeNationalId(e.target.value)}
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={12}
              />
            </div>

            <div>
              <Label htmlFor="relative-name">
                Name <span className="text-red-500">*</span>
              </Label>
              <Input 
                id="relative-name"
                name="relativeName"
                aria-label="Relative Name"
                className="custom-input"
                value={relativeName}
                onChange={(e) => setRelativeName(e.target.value)}
                onInput={(e) => setRelativeName((e.target as HTMLInputElement).value)}
                onBlur={(e) => setRelativeName(e.target.value)}
                required
              />
            </div>

            <div className="md:col-span-2">
              <Label htmlFor="relative-relationship">
                Relationship <span className="text-red-500">*</span>
              </Label>
              <Select
                value={relativeRelationship}
                onValueChange={(value) => {
                  setRelativeRelationship(value);
                  if (value !== "other") {
                    setRelativeRelationshipOther("");
                  }
                }}
              >
                <SelectTrigger id="relative-relationship" aria-label="Relationship" className="custom-select transition-all duration-100 rounded-2xl">
                  <div className="text-sm font-normal bg-background text-muted-foreground">
                    <SelectValue placeholder="Father" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="father">Father</SelectItem>
                  <SelectItem value="mother">Mother</SelectItem>
                  <SelectItem value="sibling">Sibling</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
              {relativeRelationship === "other" ? (
                <Input
                  id="relative-relationship-other"
                  name="relativeRelationshipOther"
                  aria-label="Other relationship"
                  className="custom-input mt-2 h-9"
                  placeholder="Enter relationship"
                  value={relativeRelationshipOther}
                  onChange={(e) => setRelativeRelationshipOther(e.target.value)}
                  onInput={(e) => setRelativeRelationshipOther((e.target as HTMLInputElement).value)}
                  onBlur={(e) => setRelativeRelationshipOther(e.target.value)}
                  required
                />
              ) : null}
            </div>

            <div>
              <Label htmlFor="relative-dob-trigger">Date of Birth</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="relative-dob-trigger"
                  name="relativeDob"
                  aria-label="Relative Date of Birth"
                  value={dobRelativeInputValue}
                  onChange={(e) => {
                    const formattedInput = formatDateInput(e.target.value);
                    setDobRelativeInputValue(formattedInput);
                    if (formattedInput.length === 10) {
                      const parsedDate = parseDateInput(formattedInput);
                      setDobRelative(parsedDate);
                      setDobRelativeError(validateDob(parsedDate, formattedInput));
                    } else {
                      setDobRelativeError("");
                    }
                  }}
                  onInput={(e) => {
                    const formattedInput = formatDateInput((e.target as HTMLInputElement).value);
                    setDobRelativeInputValue(formattedInput);
                    if (formattedInput.length === 10) {
                      const parsedDate = parseDateInput(formattedInput);
                      setDobRelative(parsedDate);
                      setDobRelativeError(validateDob(parsedDate, formattedInput));
                    } else {
                      setDobRelativeError("");
                    }
                  }}
                  onBlur={(e) => {
                    const parsedDate = parseDateInput(e.target.value);
                    setDobRelative(parsedDate);
                    setDobRelativeError(validateDob(parsedDate, e.target.value));
                    if (parsedDate) {
                      setDobRelativeInputValue(format(parsedDate, "dd/MM/yyyy"));
                    }
                  }}
                  placeholder="dd/mm/yyyy"
                  inputMode="numeric"
                  autoComplete="bday"
                  className="custom-input"
                />
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label="Open relative date picker"
                      className="shrink-0"
                    >
                      <CalendarIcon className="h-5 w-5 opacity-70" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="p-0 ">
                    <Calendar
                      mode="single"
                      selected={dobRelative}
                      onSelect={(selectedDate) => {
                        setDobRelative(selectedDate);
                        setDobRelativeError(validateDob(selectedDate));
                        setDobRelativeInputValue(selectedDate ? format(selectedDate, "dd/MM/yyyy") : "");
                      }}
                      captionLayout="dropdown"
                    />
                  </PopoverContent>
                </Popover>
              </div>
              {dobRelativeError ? <p className="mt-1 text-xs text-red-500">{dobRelativeError}</p> : null}
            </div>

            <div>
              <Label htmlFor="relative-age">Age</Label>
              <Input id="relative-age" name="relativeAge" aria-label="Relative Age" value={ageRelative} disabled placeholder="Age" className="rounded-2xl ring-1 ring-gray-200"/>
            </div>

            <div>
              <Label htmlFor="relative-phone">
                Phone Number <span className="text-red-500">*</span>
              </Label>
              <Input 
                id="relative-phone"
                name="relativePhone"
                aria-label="Relative Phone Number"
                className="custom-input"
                value={relativePhone}
                onChange={(e) => syncRelativePhone(e.target.value)}
                onInput={(e) => syncRelativePhone((e.target as HTMLInputElement).value)}
                onBlur={(e) => syncRelativePhone(e.target.value)}
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={10}
                required
              />
            </div>


            <div>
              <Label htmlFor="relative-sex">Sex</Label>
              <Select value={relativeSex} onValueChange={(v) => setRelativeSex(v as any)}>
                <SelectTrigger id="relative-sex" aria-label="Relative Sex" className="custom-select transition-all duration-100 rounded-2xl">
                  <div className="text-sm font-normal bg-background text-muted-foreground">
                    <SelectValue placeholder="Male" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="md:col-span-2">
              <Label htmlFor="relative-email">Email</Label>
              <Input 
                id="relative-email"
                name="relativeEmail"
                aria-label="Relative Email"
                placeholder="user@example.com" 
                className="custom-input"
                value={relativeEmail}
                onChange={(e) => {
                  const value = e.target.value;
                  setRelativeEmail(value);
                  setRelativeEmailError(validateEmail(value));
                }}
                onInput={(e) => {
                  const value = (e.target as HTMLInputElement).value;
                  setRelativeEmail(value);
                  setRelativeEmailError(validateEmail(value));
                }}
                onBlur={(e) => {
                  const value = e.target.value;
                  setRelativeEmail(value);
                  setRelativeEmailError(validateEmail(value));
                }}
              />
              {relativeEmailError ? <p className="mt-1 text-xs text-red-500">{relativeEmailError}</p> : null}
            </div>

          </CardContent>
        </Card>

        {/* LOGIN CREDENTIALS */}
        <Card className="card-feature-group card-feature-hover-group">
          <CardHeader>
            <div className="flex items-center gap-2 icon-feature-card">
                <KeyRound />
                <CardTitle className="text-xl">Login Credentials</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-2 gap-4">
          <div className="col-span-1 md:col-span-3 flex flex-col gap-1 mt-2">
            <div>
              <Label htmlFor="password">
                Password <span className="text-red-500">*</span>
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  name="password"
                  aria-label="Password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => syncPassword(e.target.value)}
                  onInput={(e) => syncPassword((e.target as HTMLInputElement).value)}
                  onBlur={(e) => syncPassword(e.target.value)}
                  className="pr-10"
                  required
                />
                <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute bg-transparent hover:bg-transparent hover:border-transparent mx-1 my-1 inset-y-0 right-0 flex items-center pr-3 text-gray-500 hover:text-gray-700"
                >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            <div>
              <Label htmlFor="confirm-password">
                Re-enter password <span className="text-red-500">*</span>
              </Label>
              <div className="relative">
              <Input 
                    id="confirm-password"
                    name="confirmPassword"
                    aria-label="Re-enter password"
                    type={showPassword2 ? "text" : "password"}
                    value={confirmPassword} 
                    onChange={(e) => syncConfirmPassword(e.target.value)}
                    onInput={(e) => syncConfirmPassword((e.target as HTMLInputElement).value)}
                    onBlur={(e) => syncConfirmPassword(e.target.value)}
                    className="pr-10"
                    required
                />
                <button
                    type="button" 
                    onClick={() => setShowPassword2(!showPassword2)}
                    className="absolute bg-transparent hover:bg-transparent hover:border-transparent mx-1 my-1 inset-y-0 right-0 flex items-center pr-3 text-gray-500 hover:text-gray-700"
                >
                    {showPassword2 ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>
          </div>
            <div className="col-span-1 md:col-span-3 flex flex-col gap-5 mt-7">
              <ValidationRow ok={has8Chars} text="Password must be longer than 8 characters." />
              {/* <ValidationRow ok={hasUppercase} text="Password must contain at least one uppercase letter." /> */}
              <ValidationRow ok={hasDigit} text="Password must have at least 1 digit." />
              <ValidationRow ok={hasSpecial} text="Password must contain at least one special character." />
              
              {confirmPassword.length > 0 && (
                <ValidationRow 
                  ok={passwordsMatch} 
                  text={passwordsMatch ? "Passwords match." : "Passwords do not match."} 
                />
              )}
          </div>
          </CardContent>
        </Card>

        {/* INSURANCE INFORMATION */}
        <Card className="card-feature-group card-feature-hover-group">
          <CardHeader>
            <div className="flex items-center gap-2 icon-feature-card">
                <IdCard />
                <CardTitle className="text-xl">Insurance Information</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-1 gap-4">

            <div>
              <Label htmlFor="insurance-id">Insurance ID</Label>
              <Input 
                id="insurance-id"
                name="insuranceId"
                aria-label="Insurance ID"
                placeholder="VN123456789" 
                className="custom-input"
                value={insuranceId}
                onChange={(e) => setInsuranceId(e.target.value)}
                onInput={(e) => setInsuranceId((e.target as HTMLInputElement).value)}
                onBlur={(e) => setInsuranceId(e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="insurance-provider">Insurance Provider</Label>
              <Select value={insuranceProvider} onValueChange={setInsuranceProvider}>
                <SelectTrigger id="insurance-provider" aria-label="Insurance Provider" className="custom-select transition-all duration-100 rounded-2xl">
                  <div className="text-sm font-normal bg-background text-muted-foreground">
                    <SelectValue placeholder="Vietnam Social Security" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="vss">Vietnam Social Security</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="insurance-expiry-trigger">Expiry Date</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="insurance-expiry-trigger"
                  name="insuranceExpiry"
                  aria-label="Insurance Expiry Date"
                  value={insuranceExpiryInputValue}
                  onChange={(e) => {
                    const formattedInput = formatDateInput(e.target.value);
                    setInsuranceExpiryInputValue(formattedInput);
                    if (formattedInput.length === 10) {
                      setInsuranceExpiry(parseDateInput(formattedInput));
                    }
                  }}
                  onInput={(e) => {
                    const formattedInput = formatDateInput((e.target as HTMLInputElement).value);
                    setInsuranceExpiryInputValue(formattedInput);
                  }}
                  onBlur={(e) => {
                    const parsedDate = parseDateInput(e.target.value);
                    setInsuranceExpiry(parsedDate);
                    if (parsedDate) {
                      setInsuranceExpiryInputValue(format(parsedDate, "dd/MM/yyyy"));
                    }
                  }}
                  placeholder="dd/mm/yyyy"
                  inputMode="numeric"
                  autoComplete="off"
                  className="custom-input"
                />
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label="Open insurance expiry date picker"
                      className="shrink-0"
                    >
                      <CalendarIcon className="h-5 w-5 opacity-70" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="p-0">
                    <Calendar
                      mode="single"
                      selected={insuranceExpiry}
                      onSelect={(selectedDate) => {
                        setInsuranceExpiry(selectedDate);
                        setInsuranceExpiryInputValue(selectedDate ? format(selectedDate, "dd/MM/yyyy") : "");
                      }}
                      captionLayout="dropdown"
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            <p className="text-sm text-gray-500">
              To update insurance information, please contact the hospital administration.
            </p>
          </CardContent>
        </Card>

        {/* BUTTONS */}
        <div className="flex justify-between mt-4 z-10">
          {leftFooter}
          <Button type="submit" disabled={isLoading} className="btn-gradient transition-transform duration-500 text-lg px-7 py-4">
            {isLoading ? submitLoadingLabel : submitButtonLabel}
          </Button>
        </div>
        </form>
      </div>
    </div>
  )
}

function calculateAge(date: Date) {
  if (!date) return "";

  const today = new Date();

  // Calculate age (days/months/years)
  const diffTime = today.getTime() - date.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  // < 1 month → days
  if (diffDays < 30) {
    return `${diffDays} days`;
  }

  // < 3 years → months
  const diffMonths =
    (today.getFullYear() - date.getFullYear()) * 12 +
    (today.getMonth() - date.getMonth());

  if (diffMonths < 36) {
    return `${diffMonths} months`;
  }

  // >= 3 years → years
  let ageYears = today.getFullYear() - date.getFullYear();
  const m = today.getMonth() - date.getMonth();
  const d = today.getDate() - date.getDate();

  if (m < 0 || (m === 0 && d < 0)) {
    ageYears--;
  }

  return `${ageYears} years`;
}


function ValidationRow({ ok, text }: { ok: boolean; text: string }) {
  return (
    <div className="group flex items-center gap-3 py-2.5 px-1 rounded-lg transition-all duration-400 hover:bg-cyan-50/50">
      {/* Icon with scale + glow */}
      <div className={`relative flex h-6 w-6 items-center justify-center rounded-full transition-all duration-500 ${ok ? "bg-linear-to-br from-green-500 to-emerald-500 shadow-lg shadow-green-500/30" : "bg-gray-200/80"}`}>
        <div className={`absolute inset-0 rounded-full ${ok ? "animate-ping bg-green-500/30" : ""}`} />
        {ok ? (
          <Check className="h-4 w-4 text-white relative z-10" strokeWidth={3} />
        ) : (
          <X className="h-4 w-4 text-gray-500 relative z-10" strokeWidth={2.5} />
        )}
      </div>

      {/* Text with fade + underline on error */}
      <span
        className={`text-sm font-medium transition-all duration-500 ${
          ok 
            ? "text-foreground" 
            : ""
        }`}
      >
        {text}
      </span>

      
    </div>
  );
}
