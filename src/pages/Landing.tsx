import { SiteHeader } from '@/components/landing/SiteHeader'
import { Hero } from '@/components/landing/Hero'
import {
  Audience,
  CallToAction,
  HowItWorks,
  ModuleStrip,
  Modules,
  Principles,
  Responsible,
  SampleFinding,
} from '@/components/landing/Sections'
import { SiteFooter } from '@/components/landing/SiteFooter'
import { useScrollReveal } from '@/hooks/useScrollReveal'

export default function Landing() {
  useScrollReveal()

  return (
    <div className="min-h-screen overflow-x-clip bg-navy text-sky">
      <SiteHeader />
      <main>
        <Hero />
        <ModuleStrip />
        <Principles />
        <Modules />
        <HowItWorks />
        <SampleFinding />
        <Audience />
        <Responsible />
        <CallToAction />
      </main>
      <SiteFooter />
    </div>
  )
}
