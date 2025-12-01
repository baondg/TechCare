"use client"

import { useState } from "react"
import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Plus, Search, Edit2, Trash2 } from "lucide-react"
import { AdminLayout } from "@/components/admin-layout"

export default function UserManagement() {
  const [searchTerm, setSearchTerm] = useState("")

  const users = [
    { id: 1, name: "Dr. Sarah Johnson", email: "sarah@hospital.com", role: "Doctor", status: "Active" },
    { id: 2, name: "Nurse Maria", email: "maria@hospital.com", role: "Nurse", status: "Active" },
    { id: 3, name: "Tech John", email: "john@hospital.com", role: "Technician", status: "Active" },
    { id: 4, name: "Patient Alex", email: "alex@hospital.com", role: "Patient", status: "Inactive" },
    { id: 5, name: "Dr. Michael Chen", email: "michael@hospital.com", role: "Doctor", status: "Active" },
  ]

  const filteredUsers = users.filter(
    (user) =>
      user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email.toLowerCase().includes(searchTerm.toLowerCase()),
  )

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case "Doctor":
        return "bg-blue-100 text-blue-800"
      case "Nurse":
        return "bg-green-100 text-green-800"
      case "Technician":
        return "bg-purple-100 text-purple-800"
      case "Patient":
        return "bg-gray-100 text-gray-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-3xl font-bold text-foreground">User Management</h2>
            <p className="text-muted-foreground mt-2">Manage system users and permissions</p>
          </div>
          <Link to="/admin/users/new">
            <Button className="gap-2">
              <Plus size={20} />
              Add User
            </Button>
          </Link>
        </div>

        {/* Search */}
        {/* <Card>
          <CardHeader>
            <CardTitle>Search Users</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-3 text-muted-foreground" size={20} />
                <Input
                  placeholder="Search by name or email..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
          </CardContent>
        </Card> */}

        {/* Users Table */}
        {/* <Card>
          <CardHeader>
            <CardTitle>Users ({filteredUsers.length})</CardTitle>
            <CardDescription>All system users</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 font-semibold">Name</th>
                    <th className="text-left py-3 px-4 font-semibold">Email</th>
                    <th className="text-left py-3 px-4 font-semibold">Role</th>
                    <th className="text-left py-3 px-4 font-semibold">Status</th>
                    <th className="text-left py-3 px-4 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((user) => (
                    <tr key={user.id} className="border-b hover:bg-muted/50">
                      <td className="py-3 px-4">{user.name}</td>
                      <td className="py-3 px-4 text-muted-foreground">{user.email}</td>
                      <td className="py-3 px-4">
                        <Badge className={getRoleBadgeColor(user.role)}>{user.role}</Badge>
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant={user.status === "Active" ? "default" : "secondary"}>{user.status}</Badge>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex gap-2">
                          <Link to={`/admin/users/${user.id}`}>
                            <Button variant="ghost" size="sm" className="gap-1">
                              <Edit2 size={16} />
                              Edit
                            </Button>
                          </Link>
                          <Button variant="ghost" size="sm" className="gap-1 text-red-600 hover:text-red-700">
                            <Trash2 size={16} />
                            Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card> */}
      </div>
    </AdminLayout>
  )
}
