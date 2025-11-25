"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PatientLayout } from "@/components/patient-layout"
import { User, CreditCard, Edit, Save, X, RotateCcw, Users, CalendarIcon, CircleAlert } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select" // Cần component Select
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns"

export default function ProfilePage() {
    const [dob, setDob] = useState<Date | undefined>();
    const age = dob ? calculateAge(dob) : "";
    const [reDob, setReDob] = useState<Date | undefined>();
    const reAge = reDob ? calculateAge(reDob) : "";
  return (
    <PatientLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold">Profile Settings</h2>
        </div>

        {/* ---------------------------------------------------- */}
        {/* 1. PERSONAL INFORMATION & RELATIVE'S INFORMATION */}
        {/* ---------------------------------------------------- */}

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Personal Information
              </CardTitle>
              <div className="flex gap-2">
                <Button variant="outline" size="sm"><Edit className="h-4 w-4 mr-1" /> Edit</Button>
                <Button variant="outline" size="sm"><RotateCcw className="h-4 w-4 mr-1" /> Clear</Button>
                <Button size="sm"><Save className="h-4 w-4 mr-1" /> Save</Button>
                <Button variant="destructive" size="sm"><X className="h-4 w-4 mr-1" /> Cancel</Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <form className="space-y-4">
              {/* Hàng 1: Name & Date of Birth */}
              <div className="grid gap-4 md:grid-cols-1">
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input id="name" placeholder="Data:Name" />
                </div>
              </div>
              
              {/* Hàng 2: Age & Sex */}
              <div className="grid gap-4 md:grid-cols-4">
                <div className="space-y-2">
                  <Label htmlFor="dob">Date of Birth</Label>
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
                <div className="space-y-2">
                  <Label htmlFor="age">Age</Label>
                  <Input id="age" value={age} disabled placeholder="Data:Age" />
                </div>
                <div className="space-y-2 col-span-2">
                  <Label htmlFor="sex">Sex</Label>
                  <Select defaultValue="Male">
                    <SelectTrigger id="sex">
                      <div className="text-sm font-normal bg-background text-muted-foreground">
                        <SelectValue placeholder="Select Sex" />
                      </div>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Male">Male</SelectItem>
                      <SelectItem value="Female">Female</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Hàng 3: Phone Number & Email */}
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone Number</Label>
                  <Input id="phone" type="tel" placeholder="Data:Phone" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" placeholder="Data:Email" />
                </div>
              </div>

              {/* Hàng 4: National ID/passport (Một cột, chiếm full) */}
              <div className="space-y-2">
                <Label htmlFor="national-id">National ID/passport</Label>
                <Input id="national-id" placeholder="Data:NationalID" />
              </div>
              
              {/* Dải ngăn cách */}
              <hr className="my-6" />

              {/* RELATIVE'S INFORMATION */}
              
              <CardTitle className="flex items-center gap-2 pt-4">
                <Users className="h-5 w-5" />
                Relative's Information
              </CardTitle>

              {/* Hàng 1 Relative: Name */}
              <div className="grid gap-4 md:grid-cols-1">
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input id="relative-name" placeholder="Data:Relative-Name" />
                </div>
              </div>

              {/* Hàng 2 Relative: Relationship */}
              <div className="grid gap-4 md:grid-cols-1">
                <div className="space-y-2">
                  <Label htmlFor="name">Relationship</Label>
                  <Select defaultValue="Mother">
                    <SelectTrigger id="relationship">
                      <div className="text-sm font-normal bg-background text-muted-foreground">
                        <SelectValue placeholder="Select Sex" />
                      </div>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Mother">Mother</SelectItem>
                      <SelectItem value="Father">Father</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Hàng 3 Relative: Date of Birth & Age */}
              <div className="grid gap-4 md:grid-cols-4">
                <div className="space-y-2">
                  <Label htmlFor="dob">Date of Birth</Label>
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
                <div className="space-y-2">
                  <Label htmlFor="age">Age</Label>
                  <Input id="relative-age" value={age} disabled placeholder="Data:Relative-Age" />
                </div>
                <div className="space-y-2 col-span-2">
                  <Label htmlFor="sex">Sex</Label>
                  <Select defaultValue="Male">
                    <SelectTrigger id="relative-sex">
                      <div className="text-sm font-normal bg-background text-muted-foreground">
                        <SelectValue placeholder="Select Sex" />
                      </div>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Male">Male</SelectItem>
                      <SelectItem value="Female">Female</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Hàng 4: Phone Number & Email */}
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone Number</Label>
                  <Input id="relative-phone" type="tel" placeholder="Data:Relative-Phone" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="relative-email" type="email" placeholder="Data:Relative-Email" />
                </div>
              </div>

              {/* Hàng 5: National ID/passport (Một cột, chiếm full) */}
              <div className="space-y-2">
                <Label htmlFor="national-id">National ID/passport</Label>
                <Input id="national-id" placeholder="Data:Relative-NationalID" />
              </div>
              
              {/* Nút Hành động cho Relative's Info */}
{/*               <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" size="sm"><Edit className="h-4 w-4 mr-1" /> Edit</Button>
                <Button variant="outline" size="sm"><RotateCcw className="h-4 w-4 mr-1" /> Clear</Button>
                <Button size="sm"><Save className="h-4 w-4 mr-1" /> Save</Button>
                <Button variant="destructive" size="sm"><X className="h-4 w-4 mr-1" /> Cancel</Button>
              </div> */}
            </form>
          </CardContent>
        </Card>

        {/* ---------------------------------------------------- */}
        {/* 2. INSURANCE INFORMATION */}
        {/* ---------------------------------------------------- */}
        
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Insurance Information
              </CardTitle>
              {/* Thêm nút hành động cho Insurance Information */}
{/*               <div className="flex gap-2">
                <Button variant="outline" size="sm"><Edit className="h-4 w-4 mr-1" /> Edit</Button>
                <Button variant="outline" size="sm"><RotateCcw className="h-4 w-4 mr-1" /> Clear</Button>
                <Button size="sm"><Save className="h-4 w-4 mr-1" /> Save</Button>
                <Button variant="destructive" size="sm"><X className="h-4 w-4 mr-1" /> Cancel</Button>
              </div> */}
            </div>
            <CardDescription>Your health insurance details</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Bố cục 2 cột cho Insurance Information */}
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="insurance-id">Insurance ID</Label>
                  <Input id="insurance-id" defaultValue="VN123456789" disabled />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="insurance-provider">Insurance Provider</Label>
                  <Input id="insurance-provider" defaultValue="Vietnam Social Security" disabled />
                </div>
              </div>
              
              <div className="space-y-2 max-w-[calc(50%-8px)]"> {/* Giới hạn chiều rộng cho 1 cột */}
                <Label htmlFor="insurance-expiry">Expiry Date</Label>
                <Input id="insurance-expiry" type="text" defaultValue="31/12/2026" disabled />
              </div>
              <div className="text-sm text-muted-foreground flex ">
                <CircleAlert className="h-4 w-4 mr-2 mt-1 shrink-0"></CircleAlert>
                <p >
                  To update insurance information, please contact the hospital administration.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </PatientLayout>
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