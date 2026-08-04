import { requireSuperAdmin } from '@/utils/auth'

/** /admin/setup è riservata al SUPER_ADMIN: import massivi e hard reset. */
export default async function SetupLayout({ children }: { children: React.ReactNode }) {
  await requireSuperAdmin()
  return <>{children}</>
}
