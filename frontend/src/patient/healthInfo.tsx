"use client"

import { useState, useMemo, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { PatientLayout } from "@/components/patient-layout"
import { Activity, Heart, AlertCircle, FileText, Save } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { CollapsibleSection } from "@/components/collapsible-section"
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select"

export default function HealthInfoPage() {
  const [isEditing, setIsEditing] = useState(false)
  const [heightValue, setHeightValue] = useState("174") 
  const [weightValue, setWeightValue] = useState("84")


  const bmiValue = useMemo(() => {
    const calculated = calculateBMI(weightValue, heightValue);
    return calculated !== null ? calculated.toFixed(1) : "N/A"; 
  }, [weightValue, heightValue]);

  return (
    <PatientLayout>
      <div className="space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold">Health Information</h2>
            <p className="text-muted-foreground">Update your health data before your visit</p>
          </div>
          <Button onClick={() => setIsEditing(!isEditing)}>
            {isEditing ? (
              <>
                <Save className="h-4 w-4 mr-2" />
                Save Changes
              </>
            ) : (
              "Edit Information"
            )}
          </Button>
        </div>

        {/* Alert */}
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Keeping your health information up-to-date helps doctors provide better care and reduces wait time at the hospital.
          </AlertDescription>
        </Alert>

        {/* ------------------- VITAL SIGNS ------------------- */}
        <CollapsibleSection
          title="Vital Signs"
          icon={<Activity className="h-5 w-5" />}
          description="Your current vital measurements"
          defaultOpen={true}
        >
          <div className="grid gap-4 md:grid-cols-2">

            {/* Blood Pressure */}
            <div className="space-y-2">
              <Label>Blood Pressure (mmHg)</Label>
              <div className="flex gap-2 text-sm font-normal bg-background text-muted-foreground">
                <Input placeholder="118" defaultValue="118" disabled={!isEditing} />
                <Input placeholder="76" defaultValue="76" disabled={!isEditing} />
              </div>
            </div>

            {/* Blood Oxygen */}
            <div className="space-y-2 text-sm font-normal bg-background text-muted-foreground">
              <Label htmlFor="oxygen">Blood Oxygen (SpO2 %)</Label>
              <Input id="oxygen" defaultValue="97" disabled={!isEditing} />
            </div>

            {/* Temperature */}
            <div className="space-y-2 text-sm font-normal bg-background text-muted-foreground">
              <Label htmlFor="temperature">Body Temperature (°C)</Label>
              <Input id="temperature" defaultValue="36.8" disabled={!isEditing} />
            </div>

            {/* Height */}
            <div className="space-y-2 text-sm font-normal bg-background text-muted-foreground">
              <Label htmlFor="height">Height (cm)</Label>
              <Input 
                id="height" 
                value={heightValue}
                onChange={(e) => setHeightValue(e.target.value)}
                disabled={!isEditing}
                type="number" />
            </div>

            {/* Respiratory Rate */}
            <div className="space-y-2 text-sm font-normal bg-background text-muted-foreground">
              <Label htmlFor="respiratory">Respiratory Rate (breaths/min)</Label>
              <Input id="respiratory" defaultValue="18" disabled={!isEditing} />
            </div>

            {/* Weight */}
            <div className="space-y-2 text-sm font-normal bg-background text-muted-foreground">
              <Label htmlFor="weight">Weight (kg)</Label>
              <Input id="weight" 
                value={weightValue}
                disabled={!isEditing}
                onChange={(e) => setWeightValue(e.target.value)}
                type="number" />
            </div>

            {/* Heart Rate */}
            <div className="space-y-2 text-sm font-normal bg-background text-muted-foreground">
              <Label htmlFor="heart-rate">Heart Rate (bpm)</Label>
              <Input id="heart-rate" defaultValue="84" disabled={!isEditing} />
            </div>

            {/* BMI */}
            <div className="space-y-2 text-sm font-normal bg-background text-muted-foreground">
              <Label htmlFor="bmi">BMI</Label>
              <Input id="bmi" value={bmiValue} disabled />
            </div>

            {/* Blood Type */}
            <div className="space-y-2 ">
              <Label>Blood Type</Label>
              <Select defaultValue="O+" disabled={!isEditing}>
                <SelectTrigger>
                <div className="text-sm font-normal bg-background text-muted-foreground">
                    <SelectValue placeholder="Select blood type" />
                </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="A+">A+</SelectItem>
                  <SelectItem value="A-">A-</SelectItem>
                  <SelectItem value="B+">B+</SelectItem>
                  <SelectItem value="B-">B-</SelectItem>
                  <SelectItem value="O+">O+</SelectItem>
                  <SelectItem value="O-">O-</SelectItem>
                  <SelectItem value="AB+">AB+</SelectItem>
                  <SelectItem value="AB-">AB-</SelectItem>
                </SelectContent>
              </Select>
            </div>

          </div>
        </CollapsibleSection>

        {/* ------------------- ALLERGIC INFORMATION ------------------- */}
        <CollapsibleSection
          title="Allergic Information"
          icon={<AlertCircle className="h-5 w-5" />}
          description="List any known allergies"
          defaultOpen={true}
        >
          <div className="space-y-4 text-sm font-normal bg-background text-muted-foreground">
            <div className="space-y-2">
              <Label>Drug Allergies</Label>
              <Input defaultValue="Penicillin" disabled={!isEditing} />
            </div>

            <div className="space-y-2 ">
              <Label>Food Allergies</Label>
              <Input defaultValue="Shrimp" disabled={!isEditing} />
            </div>

            <div className="space-y-2">
              <Label>Other Allergies</Label>
              <Input defaultValue="Butterfly flower" disabled={!isEditing} />
            </div>
          </div>
        </CollapsibleSection>

        {/* ------------------- CURRENT SYMPTOMS ------------------- */}
        <CollapsibleSection
          title="Current Symptoms"
          icon={<Heart className="h-5 w-5" />}
          description="Describe any symptoms you're experiencing"
          defaultOpen={true}
        >
          <div className="space-y-2 text-sm font-normal bg-background text-muted-foreground">
            <Label>Symptoms</Label>
            <Textarea
              defaultValue="Mild headache, occasional dizziness"
              disabled={!isEditing}
              rows={3}
            />
          </div>
        </CollapsibleSection>

        {/* ------------------- MEDICAL HISTORY ------------------- */}
        <CollapsibleSection
          title="Medical History"
          icon={<FileText className="h-5 w-5" />}
          description="Your past medical conditions and treatments"
          defaultOpen={true}
        >
          <div className="space-y-4 text-sm font-normal bg-background text-muted-foreground">

            <div className="space-y-2">
              <Label>Chronic Conditions</Label>
              <Input defaultValue="Hypertension (controlled)" disabled={!isEditing} />
            </div>

            <div className="space-y-2">
              <Label>Past Surgeries</Label>
              <Input defaultValue="Appendectomy (2018)" disabled={!isEditing} />
            </div>

            <div className="space-y-2">
              <Label>Family Medical History</Label>
              <Input defaultValue="Father: Heart disease, Mother: Diabetes" disabled={!isEditing} />
            </div>

            <div className="space-y-2">
              <Label>Previous Illnesses</Label>
              <Input defaultValue="Mumps" disabled={!isEditing} />
            </div>

            <div className="space-y-2">
              <Label>Vaccination</Label>
              <Input defaultValue="Tetanus and diphtheria" disabled={!isEditing} />
            </div>

            <div className="space-y-2">
              <Label>Substance Abuse</Label>
              <Input defaultValue="Alcohol" disabled={!isEditing} />
            </div>

          </div>
        </CollapsibleSection>
      </div>
    </PatientLayout>
  )
}

const calculateBMI = (weightStr: string, heightStr: string): number | null => {
  // Chuyển chuỗi thành số. Nếu chuỗi rỗng hoặc không hợp lệ, trả về 0.
  const weightKg = parseFloat(weightStr);
  const heightCm = parseFloat(heightStr);
  
  if (isNaN(weightKg) || isNaN(heightCm) || weightKg <= 0 || heightCm <= 0) return null;
  
  const heightMeters = heightCm / 100;
  return weightKg / (heightMeters * heightMeters);
}