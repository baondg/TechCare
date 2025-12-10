import { Outlet } from "react-router-dom";
import NetworkBackground from "@/components/NetworkBackground";

export default function AuthBackgroundLayout() {
  return (
    <div className="relative w-full min-h-screen ">
      <NetworkBackground />

      <div className="relative z-10">
        <Outlet />
      </div>
    </div>
  );
}
