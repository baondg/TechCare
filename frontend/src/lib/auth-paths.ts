export const CHANGE_PASSWORD_PATH = "/change-password"

/** While an admin-issued password is pending change, every page but this one redirects to it. */
export function passwordChangeRedirect(mustChangePassword: boolean | undefined, pathname: string): string | null {
  return mustChangePassword && pathname !== CHANGE_PASSWORD_PATH ? CHANGE_PASSWORD_PATH : null
}

/** Home page of a role (dashboard), or the landing page. */
export function getSafeRedirectByRole(role?: string): string {
  switch (role) {
    case "patient":
      return "/patient/dashboard"
    case "doctor":
      return "/doctor/dashboard"
    case "nurse":
      return "/nurse/dashboard"
    case "technician":
      return "/technician/dashboard"
    case "admin":
      return "/admin/dashboard"
    default:
      return "/"
  }
}
