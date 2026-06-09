// Server Component — export const dynamic works here, not in Client Components
export const dynamic = 'force-dynamic'

import HomeClient from './HomeClient'

export default function Page() {
  return <HomeClient />
}
