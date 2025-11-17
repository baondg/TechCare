"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Activity, CircleUserRound, CalendarIcon, Phone, KeyRound, IdCard, Check, X, Eye, EyeOff } from "lucide-react"
import { Link } from "react-router-dom";
import { useNavigate } from "react-router-dom";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns"
import { Select, SelectTrigger, SelectValue, SelectItem, SelectContent } from "@/components/ui/select";


export default function RegisterPage() {
    const [dob, setDob] = useState<Date | undefined>();
    const age = dob ? calculateAge(dob) : "";
    const [dobRelative, setDobRelative] = useState<Date | undefined>();
    const [nationalId, setNationalId] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    // check length of password
    const has8Chars = password.length >= 8;
    // check password must have at least one digit
    const hasDigit = /\d/.test(password);
    // check password must have at least 1 special character (non-alphanumeric, non-whitespace)
    const hasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]+/.test(password);
    const passwordsMatch = password === confirmPassword && password.length > 0;
    const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="w-full flex flex-col py-10">
      {/* Header */}
        <div className="flex items-center gap-2 mb-8 mx-auto">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
            <Activity className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="text-xl font-bold">TechCare</span>
        </div>



      <div className="w-full max-w-6xl flex flex-col gap-6">

        {/* PERSONAL INFO */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
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
              />
            </div>

            
            <div>
              <Label>Name</Label>
              <Input />
            </div>


            <div>
              <Label>Date of Birth</Label>
              <Popover>
                <PopoverTrigger asChild>
                <div
                    className="
                    w-full flex items-center justify-between 
                    rounded-md border border-input 
                    bg-background px-3 py-2 
                    text-sm text-muted-foreground
                    hover:bg-accent hover:text-accent-foreground
                    cursor-pointer
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
              <Input value={age} disabled placeholder="Age" />
            </div>

            <div>
              <Label>Phone Number</Label>
              <Input />
            </div>


            <div>
              <Label>Sex</Label>
              <Select>
                <SelectTrigger>
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
              <Input placeholder="user@example.com" />
            </div>
          </CardContent>
        </Card>

        {/* RELATIVE INFO */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
                <Phone />
                <CardTitle className="text-xl">Relative Information</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-2 gap-4">

            

            <div>
              <Label>National ID/passport</Label>
              <Input />
            </div>

            
            <div>
              <Label>Name</Label>
              <Input />
            </div>

            <div className="md:col-span-2">
              <Label>Relationship</Label>
              <Input placeholder="Father" />
            </div>

            <div>
              <Label>Date of Birth</Label>
              <Popover>
                <PopoverTrigger asChild>
                <div
                    className="
                    w-full flex items-center justify-between 
                    rounded-md border border-input 
                    bg-background px-3 py-2 
                    text-sm text-muted-foreground
                    hover:bg-accent hover:text-accent-foreground
                    cursor-pointer
                    "
                >
                    <span className={dobRelative ? "text-foreground" : "text-muted-foreground"}>
                    {dobRelative ? format(dobRelative, "dd/MM/yyyy") : "dd/mm/yyyy"}
                    </span>

                    <CalendarIcon className="h-5 w-5 opacity-60" />
                </div>
                </PopoverTrigger>
                <PopoverContent className="p-0">
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
              <Label>Age</Label>
              <Input value={age} disabled placeholder="Age" />
            </div>

            <div>
              <Label>Phone Number</Label>
              <Input />
            </div>


            <div>
              <Label>Sex</Label>
              <Select>
                <SelectTrigger>
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
              <Input placeholder="user@example.com" />
            </div>

          </CardContent>
        </Card>

        {/* LOGIN CREDENTIALS */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
                <KeyRound />
                <CardTitle className="text-xl">Login Credentials</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-2 gap-4">
          <div className="col-span-1 md:col-span-3 flex flex-col gap-1 mt-2">
            <div>
              <Label>Username</Label>
              <Input placeholder="Enter National ID" 
                value={nationalId}
                disabled
              />
            </div>

            <div>
              <Label>Password</Label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pr-10" 
                />
                <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute bg-accent-foreground mx-1 my-1 inset-y-0 right-0 flex items-center pr-3 text-gray-500 hover:text-gray-700"
                >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            <div>
              <Label>Re-enter password</Label>
              <div className="relative">
              <Input 
                    type={showPassword ? "text" : "password"}
                    value={confirmPassword} 
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="pr-10"
                />
                <button
                    type="button" 
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute bg-accent-foreground mx-1 my-1 inset-y-0 right-0 flex items-center pr-3 text-gray-500 hover:text-gray-700"
                >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>
          </div>
            <div className="col-span-1 md:col-span-3 flex flex-col gap-5 mt-7">
              <ValidationRow ok={has8Chars} text="Password must be longer than 8 characters." />
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
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
                <IdCard />
                <CardTitle className="text-xl">Insurance Information</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-1 gap-4">

            <div>
              <Label>Insurance ID</Label>
              <Input placeholder="VN123456789" />
            </div>

            <div>
              <Label>Insurance Provider</Label>
              <Select>
                <SelectTrigger>
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
                    className="
                    w-full flex items-center justify-between 
                    rounded-md border border-input 
                    bg-background px-3 py-2 
                    text-sm text-muted-foreground
                    hover:bg-accent hover:text-accent-foreground
                    cursor-pointer
                    "
                >
                    <span className={dobRelative ? "text-foreground" : "text-muted-foreground"}>
                    {dobRelative ? format(dobRelative, "dd/MM/yyyy") : "dd/mm/yyyy"}
                    </span>

                    <CalendarIcon className="h-5 w-5 opacity-60" />
                </div>
                </PopoverTrigger>
                <PopoverContent className="p-0">
                  <Calendar 
                    mode="single" 
                    selected={dobRelative} 
                    onSelect={setDobRelative} 
                    captionLayout="dropdown"
                    />
                </PopoverContent>
              </Popover>
            </div>

            <p className="text-sm text-gray-500">
              ⚠️ To update insurance information, please contact the hospital administration.
            </p>
          </CardContent>
        </Card>

        {/* BUTTONS */}
        <div className="flex justify-between mt-4">
          <Button variant="ghost">← Back</Button>
          <Button>Register!</Button>
        </div>
      </div>
    </div>
  )
}

function calculateAge(date:Date) {
  if (!date) return "";
  const today = new Date();
  let age = today.getFullYear() - date.getFullYear();

  const monthDiff = today.getMonth() - date.getMonth();
  const dayDiff = today.getDate() - date.getDate();

  // Nếu chưa đến sinh nhật trong năm nay → giảm 1 tuổi
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    age--;
  }

  return age;
}

function ValidationRow({ ok, text }: { ok: boolean; text: string }) {
  // Chọn màu và icon dựa trên kết quả kiểm tra
  const color = ok ? "text-green-600" : "text-red-600";
  const Icon = ok ? Check : X;

  return (
    <div className="flex items-center gap-2">
      <Icon className={`h-4 w-4 ${color}`} />
      <span className={`text-sm ${color}`}>{text}</span>
    </div>
  );
}