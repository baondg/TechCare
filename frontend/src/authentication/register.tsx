"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Activity, CircleUserRound, CalendarIcon, Phone, KeyRound, IdCard, Check, X, Eye, EyeOff, AlertCircle } from "lucide-react"
import { Link, useNavigate  } from "react-router-dom";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns"
import { Select, SelectTrigger, SelectValue, SelectItem, SelectContent } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { Alert, AlertDescription } from "@/components/ui/alert";


export default function RegisterPage() {
    const router = useNavigate();
    const { register, isLoading } = useAuth();
    const [error, setError] = useState("");
    const [success, setSuccess] = useState(false);
    
    // Basic fields
    const [username, setUsername] = useState("");
    const [email, setEmail] = useState("");
    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    
    const [dob, setDob] = useState<Date | undefined>();
    const age = dob ? calculateAge(dob) : "";
    const [dobRelative, setDobRelative] = useState<Date | undefined>();
    const ageRelative = dobRelative ? calculateAge(dobRelative) : "";
    const [nationalId, setNationalId] = useState("");
    const [phone, setPhone] = useState("");
    const [sex, setSex] = useState<"male" | "female" | "other">("male");

    // Relative info state
    const [relativeNationalId, setRelativeNationalId] = useState("");
    const [relativeName, setRelativeName] = useState("");
    const [relativeRelationship, setRelativeRelationship] = useState("");
    const [relativePhone, setRelativePhone] = useState("");
    const [relativeSex, setRelativeSex] = useState<"male" | "female" | "other">("male");
    const [relativeEmail, setRelativeEmail] = useState("");

    // Insurance info state
    const [insuranceId, setInsuranceId] = useState("");
    const [insuranceProvider, setInsuranceProvider] = useState("");
    const [insuranceExpiry, setInsuranceExpiry] = useState<Date | undefined>();
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
    
    const handleRegister = async (e: React.FormEvent) => {
      e.preventDefault();
      setError("");
      
      if (!username || !email || !password || !firstName || !lastName) {
        setError("Please fill in all required fields");
        return;
      }
      
      if (!passwordsMatch) {
        setError("Passwords do not match");
        return;
      }
      
      if (!has8Chars || !hasUppercase || !hasDigit || !hasSpecial) {
        setError("Password does not meet requirements");
        return;
      }

      // Required profile fields for backend USER table
      if (!nationalId || !dob || !phone) {
        setError("Please fill in National ID, date of birth, and phone number");
        return;
      }

      const mapSexToCode = (value: string | undefined) => {
        if (value === "female") return "F";
        if (value === "other") return "O";
        return "M";
      };
      
      const result = await register({
        username,
        email,
        password,
        firstName,
        lastName,
        age: parseInt(age) || undefined,
        role: 'patient',
        sex: mapSexToCode(sex),
        dob: dob ? format(dob, "yyyy-MM-dd") : undefined,
        tel: phone,
        idcard: nationalId,
        // Relative
        relativeName,
        relativeRelationship,
        relativeDateOfBirth: dobRelative ? format(dobRelative, "yyyy-MM-dd") : undefined,
        relativeSex: mapSexToCode(relativeSex),
        relativePhone,
        relativeEmail,
        relativeNationalId,
        // Insurance
        insuranceId,
        insuranceProvider,
        insuranceExpiry: insuranceExpiry ? format(insuranceExpiry, "yyyy-MM-dd") : undefined,
      });
      
      if (result.success) {
        setSuccess(true);
        setTimeout(() => {
          router("/patient/dashboard");
        }, 1500);
      } else {
        setError(result.error || "Registration failed. Please try again.");
      }
    };
    const [showPassword2, setShowPassword2] = useState(false);

  return (
    <div className="w-full flex flex-col py-10">
      {/* Header */}
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



      <div className="w-full max-w-6xl flex flex-col gap-6 mx-auto">
        <form onSubmit={handleRegister} className="flex flex-col gap-6">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          
          {success && (
            <Alert className="bg-green-50 text-green-900 border-green-200">
              <Check className="h-4 w-4" />
              <AlertDescription>Registration successful! Redirecting...</AlertDescription>
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
              <Label>National ID/passport</Label>
              <Input 
                value={nationalId}
                onChange={(e) => setNationalId(e.target.value)}
                className="custom-input"
              />
            </div>

            
            <div>
              <Label>
                First Name <span className="text-red-500">*</span>
              </Label>
              <Input 
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
              />
            </div>

            <div>
              <Label>
                Last Name <span className="text-red-500">*</span>
              </Label>
              <Input 
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
              />
            </div>


            <div>
              <Label>Date of Birth</Label>
              <Popover>
                <PopoverTrigger asChild>
                <div
                    className="custom-popover custom-popover-secondary
                    w-full flex items-center justify-between 
                    px-3 py-2 
                    text-sm text-muted-foreground
                    "
                >
                    <span className={dob ? "text-foreground" : "text-muted-foreground"}>
                    {dob ? format(dob, "dd/MM/yyyy") : "dd/mm/yyyy"}
                    </span>

                    <CalendarIcon className="h-5 w-5 opacity-60" />
                </div>
                </PopoverTrigger>
                <PopoverContent className="p-0">
                  <Calendar 
                    mode="single" 
                    selected={dob} 
                    onSelect={setDob} 
                    captionLayout="dropdown"
                    />
                </PopoverContent>
              </Popover>
            </div>

            <div>
              <Label>Age</Label>
              <Input value={age} disabled placeholder="Age" className="rounded-2xl ring-1 ring-gray-200"/>
            </div>

            <div>
              <Label>Phone Number</Label>
              <Input 
                className="custom-input"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>


            <div>
              <Label>Sex</Label>
              <Select value={sex} onValueChange={(v) => setSex(v as any)}>
                <SelectTrigger className="custom-select transition-all duration-100 rounded-2xl">
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
              <Label>
                Email <span className="text-red-500">*</span>
              </Label>
              <Input 
                placeholder="user@example.com" 
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
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
              <Label>National ID/passport</Label>
              <Input 
                className="custom-input"
                value={relativeNationalId}
                onChange={(e) => setRelativeNationalId(e.target.value)}
              />
            </div>

            <div>
              <Label>Name</Label>
              <Input 
                className="custom-input"
                value={relativeName}
                onChange={(e) => setRelativeName(e.target.value)}
              />
            </div>

            <div className="md:col-span-2">
              <Label>Relationship</Label>
              <Select value={relativeRelationship} onValueChange={setRelativeRelationship}>
                <SelectTrigger className="custom-select transition-all duration-100 rounded-2xl">
                  <div className="text-sm font-normal bg-background text-muted-foreground">
                    <SelectValue placeholder="Father" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="father">Father</SelectItem>
                  <SelectItem value="mother">Mother</SelectItem>
                  <SelectItem value="sibling">Sibling</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Date of Birth</Label>
              <Popover>
                <PopoverTrigger asChild>
                <div
                    className="custom-popover custom-popover-secondary
                    w-full flex items-center justify-between 
                    px-3 py-2 
                    text-sm text-muted-foreground 
                    "
                >
                    <span className={dobRelative ? "text-foreground" : "text-muted-foreground"}>
                    {dobRelative ? format(dobRelative, "dd/MM/yyyy") : "dd/mm/yyyy"}
                    </span>

                    <CalendarIcon className="h-5 w-5 opacity-60" />
                </div>
                </PopoverTrigger>
                <PopoverContent className="p-0 ">
                  <Calendar 
                    mode="single" 
                    selected={dobRelative} 
                    onSelect={setDobRelative} 
                    captionLayout="dropdown"
                    />
                </PopoverContent>
              </Popover>
            </div>

            <div>
              <Label >Age</Label>
              <Input value={ageRelative} disabled placeholder="Age" className="rounded-2xl ring-1 ring-gray-200"/>
            </div>

            <div>
              <Label>Phone Number</Label>
              <Input 
                className="custom-input"
                value={relativePhone}
                onChange={(e) => setRelativePhone(e.target.value)}
              />
            </div>


            <div>
              <Label>Sex</Label>
              <Select value={relativeSex} onValueChange={(v) => setRelativeSex(v as any)}>
                <SelectTrigger className="custom-select transition-all duration-100 rounded-2xl">
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
              <Label>Email</Label>
              <Input 
                placeholder="user@example.com" 
                className="custom-input"
                value={relativeEmail}
                onChange={(e) => setRelativeEmail(e.target.value)}
              />
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
              <Label>
                Username <span className="text-red-500">*</span>
              </Label>
              <Input 
                placeholder="Enter username" 
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>

            <div>
              <Label>
                Password <span className="text-red-500">*</span>
              </Label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
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
              <Label>
                Re-enter password <span className="text-red-500">*</span>
              </Label>
              <div className="relative">
              <Input 
                    type={showPassword2 ? "text" : "password"}
                    value={confirmPassword} 
                    onChange={(e) => setConfirmPassword(e.target.value)}
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
              <Label>Insurance ID</Label>
              <Input 
                placeholder="VN123456789" 
                className="custom-input"
                value={insuranceId}
                onChange={(e) => setInsuranceId(e.target.value)}
              />
            </div>

            <div>
              <Label>Insurance Provider</Label>
              <Select value={insuranceProvider} onValueChange={setInsuranceProvider}>
                <SelectTrigger className="custom-select transition-all duration-100 rounded-2xl">
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
              <Label>Expiry Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                <div
                    className="custom-popover custom-popover-secondary
                    w-full flex items-center justify-between 
                    rounded-xl border border-input 
                    bg-background px-3 py-2 
                    text-sm text-muted-foreground
                    cursor-pointer
                    "
                >
                    <span className={insuranceExpiry ? "text-foreground" : "text-muted-foreground"}>
                    {insuranceExpiry ? format(insuranceExpiry, "dd/MM/yyyy") : "dd/mm/yyyy"}
                    </span>

                    <CalendarIcon className="h-5 w-5 opacity-60" />
                </div>
                </PopoverTrigger>
                <PopoverContent className="p-0">
                  <Calendar 
                    mode="single" 
                    selected={insuranceExpiry} 
                    onSelect={setInsuranceExpiry} 
                    captionLayout="dropdown"
                  />
                </PopoverContent>
              </Popover>
            </div>

            <p className="text-sm text-gray-500">
              To update insurance information, please contact the hospital administration.
            </p>
          </CardContent>
        </Card>

        {/* BUTTONS */}
        <div className="flex justify-between mt-4 z-10">
          <Button size="default" className="btn-outline transition-transform duration-500 text-sm px-7 py-4" asChild type="button">
            <Link to="/login">Back to Login</Link>
          </Button>
          <Button type="submit" disabled={isLoading} className="btn-gradient transition-transform duration-500 text-lg px-7 py-4">
            {isLoading ? "Registering..." : "Register!"}
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
