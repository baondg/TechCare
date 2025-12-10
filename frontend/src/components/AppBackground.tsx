// src/components/AppBackground.tsx
import NetworkBackground from "@/components/NetworkBackground"

export default function AppBackground() {
  return (
    <div className="fixed">
      <NetworkBackground />
      {/* Lớp xám nhẹ bạn muốn */}
      <div className="absolute inset-0 bg-slate-100/80 backdrop-blur-sm" />
    </div>
  )
}