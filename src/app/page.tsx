import { DashboardClient } from '@/components/DashboardClient'

export default function DashboardPage() {
  return <DashboardClient initialNowIso={new Date().toISOString()} />
}
