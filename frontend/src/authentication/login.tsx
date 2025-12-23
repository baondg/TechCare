import type React from "react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Activity, User, Stethoscope, Eye, EyeOff } from "lucide-react";
import { Link } from "react-router-dom";
import { useNavigate } from "react-router-dom";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function LoginPage() {
  const router = useNavigate();
  const [role, setRole] = useState<"patient" | "hospital staff" | "admin">("patient");
  const [showPassword, setShowPassword] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    // Redirect based on role
    if (role === "patient") {
      router("/patient/dashboard");
    } else if (role === "hospital staff" || role === "admin") {
      router("/admin/dashboard"); //TODO
    } 
  };

  return (
    <div className="h-screen w-full flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Link to="/" className="group flex items-center justify-center gap-2 mb-8">
          <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-linear-to-br from-[#06b6d4] to-[#0891b2] p-0.5 shadow-lg">
            <div className="flex h-full w-full items-center justify-center rounded-lg">
              <Activity className="h-6 w-6 text-[#FFFFFF]" />
            </div>
          </div>
          <span className="text-2xl font-bold bg-linear-to-r from-[#06b6d4] to-[#0891b2] bg-clip-text text-transparent">
            TechCare
          </span>
        </Link>

        <Card className="relative "> 
          <CardHeader>
            <CardTitle className="text-2xl">Welcome!</CardTitle>
            <CardDescription>Sign in to your TechCare account</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={role} onValueChange={(v) => setRole(v as any)} className="mb-6">
              <TabsList className="grid w-full grid-cols-3 gap-2">
                <TabsTrigger value="patient" className="tabs-trigger gap-2 h-7 transition duration-500">
                  <User className="h-4 w-4" />
                  Patient
                </TabsTrigger>
                <TabsTrigger value="hospital staff" className="tabs-trigger gap-2 h-7 transition duration-500">
                  <Stethoscope className="h-4 w-4" />
                  Staff
                </TabsTrigger>
                <TabsTrigger value="admin" className=" tabs-trigger gap-2 h-7 transition duration-500">
                  <Stethoscope className="h-4 w-4" />
                  Admin
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <form onSubmit={handleLogin} className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  type="text"
                  placeholder="Enter username"
                  required
                  className="custom-input"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative"> 
                  <Input 
                    id="password" 
                    type={showPassword ? "text" : "password"} 
                    placeholder="Enter password" 
                    required 
                    className="custom-input"
                  />
                  <button
                    type="button" 
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 flex items-center bg-transparent border-none pr-3 text-gray-500 hover:text-gray-700 focus:outline-none"
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between text-sm">
                <a
                  href="#"
                  className="group/item relative inline-block text-sm font-medium text-linear-to-r from-[#06b6d4] to-[#0891b2] hover:text-cyan-600 transition-all duration-400">
                  Forgot password?
                  <span 
                    className="absolute inset-x-0 bottom-0 mx-auto h-0.5 w-0 bg-linear-to-r from-[#06b6d4] to-[#0891b2] rounded-full 
                              transition-all duration-500 ease-out origin-center
                              group-hover/item:w-full"/>
                </a>
              </div>
              <Button type="submit" size="default" className="w-full btn-gradient transition-transform duration-500">
                Sign In
              </Button>
            </form>

            <div className="mt-6 text-center text-sm">
              <span className="text-muted-foreground">Don't have an account? </span>
              <a
                href="/register"
                className="group/item relative inline-block text-sm font-medium text-linear-to-r from-[#06b6d4] to-[#0891b2] hover:text-cyan-600 transition-all duration-400">
                Register as patient
                <span 
                  className="absolute inset-x-0 bottom-0 mx-auto h-0.5 w-0 bg-linear-to-r from-[#06b6d4] to-[#0891b2] rounded-full 
                            transition-all duration-500 ease-out origin-center
                            group-hover/item:w-full"/>
              </a>
            </div>
          </CardContent>
        </Card>

        <div className="mt-6 text-center">
          <Link to="/" 
            className="group relative inline-flex items-center gap-3 text-muted-foreground/80 text-sm font-medium
                      transition-all duration-400 hover:text-linear-to-r from-[#06b6d4] to-[#0891b2] hover:translate-x-1">
            <span className="relative">
              ← Back to Home
              <span className="absolute inset-0 bg-cyan-500/10 blur-lg scale-0 
                              transition-transform duration-400 group-hover:scale-100" />
            </span>
          </Link>
        </div>
      </div>
    </div>
  );
}