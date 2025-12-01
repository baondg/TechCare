"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AdminLayout } from "@/components/admin-layout"
import { Save, Building2 } from "lucide-react"

export default function HospitalInfo() {
  const [hospitalInfo, setHospitalInfo] = useState({
    name: "Central Hospital",
    address: "123 Medical Street, Ho Chi Minh City",
    phone: "+84 28 1234 5678",
    email: "info@centralhospital.com",
    website: "www.centralhospital.com",
    director: "Dr. Nguyen Van A",
  })

  const handleChange = (field: string, value: string) => {
    setHospitalInfo((prev) => ({ ...prev, [field]: value }))
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold text-foreground">Hospital Information</h2>
          <p className="text-muted-foreground mt-2">Manage hospital details and contact information</p>
        </div>

        {/* Basic Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Hospital Details
            </CardTitle>
            <CardDescription>Update hospital information</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Hospital Name</Label>
                <Input id="name" value={hospitalInfo.name} onChange={(e) => handleChange("name", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="director">Director</Label>
                <Input
                  id="director"
                  value={hospitalInfo.director}
                  onChange={(e) => handleChange("director", e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="address">Address</Label>
              <Input
                id="address"
                value={hospitalInfo.address}
                onChange={(e) => handleChange("address", e.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input id="phone" value={hospitalInfo.phone} onChange={(e) => handleChange("phone", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={hospitalInfo.email}
                  onChange={(e) => handleChange("email", e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="website">Website</Label>
              <Input
                id="website"
                value={hospitalInfo.website}
                onChange={(e) => handleChange("website", e.target.value)}
              />
            </div>

            <Button className="gap-2">
              <Save size={20} />
              Save Hospital Info
            </Button>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  )
}
