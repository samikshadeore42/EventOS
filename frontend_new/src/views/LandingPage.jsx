import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Activity, ShieldCheck, Target, FileText, Users, Star, LayoutDashboard, Network, Sparkles, Box, Shield, Gavel, UserCircle, TrendingUp } from 'lucide-react'
import EventOSLogo from '../components/EventOSLogo'

function Navbar() {
  const [active, setActive] = useState('features')

  return (
    <nav className="bg-white/90 border-b border-slate-200 backdrop-blur sticky top-0 z-50 h-[72px] flex items-center">
      <div className="max-w-7xl mx-auto px-6 w-full flex items-center justify-between">
        <div className="flex items-center gap-3">
          <EventOSLogo className="text-slate-950" size={36} />
          <div>
             <h1 className="text-sm font-black text-slate-950 leading-tight tracking-widest">EVENTOS PLATFORM</h1>
             <p className="text-[11px] font-medium text-slate-500">Hackathon Operating System</p>
          </div>
        </div>

        <div className="hidden lg:flex items-center h-full">
          <div className="flex items-center gap-8 text-sm font-bold h-full">
            <a href="#about" onClick={() => setActive('about')} className={`h-full flex items-center border-b-2 transition-colors ${active === 'about' ? 'border-red-500 text-red-500' : 'border-transparent text-slate-950 hover:text-red-500'}`}>About</a>
            <a href="#features" onClick={() => setActive('features')} className={`h-full flex items-center border-b-2 transition-colors ${active === 'features' ? 'border-red-500 text-red-500' : 'border-transparent text-slate-950 hover:text-red-500'}`}>Features</a>
            
            <div className="h-5 w-px bg-slate-200 mx-2"></div>
            
            <Link to="/participant" className="text-slate-950 hover:text-red-500 transition-colors">Participant</Link>
            <Link to="/mentor" className="text-slate-950 hover:text-red-500 transition-colors">Mentor</Link>
            <Link to="/judge" className="text-slate-950 hover:text-red-500 transition-colors">Judge</Link>
            
            <Link
              to="/admin"
              className="ml-4 flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-xl shadow-sm hover:shadow-md hover:from-red-600 hover:to-red-700 transition-all font-bold"
            >
              <ShieldCheck size={16} /> Admin Console
            </Link>
          </div>
        </div>
      </div>
    </nav>
  )
}

function StatBox({ icon: Icon, colorTheme, count, label }) {
  const theme = {
    blue: { icon: 'bg-blue-50 text-blue-600' },
    green: { icon: 'bg-emerald-50 text-emerald-600' },
    orange: { icon: 'bg-orange-50 text-orange-500' },
    purple: { icon: 'bg-purple-50 text-purple-600' }
  }[colorTheme]

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-4 flex items-center gap-4">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${theme.icon}`}>
        <Icon size={20} />
      </div>
      <div>
        <div className="text-xs font-medium text-slate-500 leading-none mb-1">{label}</div>
        <div className="text-base font-black text-slate-950 leading-none">{count}</div>
      </div>
    </div>
  )
}


const heroSlides = [
  {
    eyebrow: 'AI-POWERED HACKATHON MANAGEMENT',
    title: 'Reimagine Innovation Through',
    highlight: 'Competition',
    description: 'The central operating system for enterprise-grade hackathons. Connect students, innovators, and organizations to solve real-world challenges.',
    visualType: 'metrics-orbit'
  },
  {
    eyebrow: 'REAL CHALLENGES. REAL OUTCOMES.',
    title: 'Accelerate Learning Through',
    highlight: 'Real Challenges',
    description: 'Partner with industry leaders, research centers, and universities in a robust, globally connected infrastructure.',
    visualType: 'network-node'
  },
  {
    eyebrow: 'LIVE TELEMETRY',
    title: 'Build Solutions That',
    highlight: 'Matter',
    description: 'Track live metrics, manage team collaborations, and showcase projects on transparent, high-performance dashboards.',
    visualType: 'telemetry-dashboard'
  },
  {
    eyebrow: 'IDEAS TO IMPACT',
    title: 'Transform Ideas Into',
    highlight: 'Impact',
    description: 'A unified digital ecosystem bridging hackathons, case studies, and research programs through intelligent pathways.',
    visualType: 'layered-rings'
  }
];

function HeroVisual({ type }) {
  switch (type) {
    case 'metrics-orbit':
      return (
        <>
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-50">
             <div className="w-64 h-64 border border-slate-200 rounded-full absolute" />
             <div className="w-96 h-96 border border-slate-100 rounded-full absolute" />
          </div>
          <div className="absolute top-1/4 right-1/4 w-2 h-2 rounded-full bg-emerald-400 opacity-50" />
          <div className="absolute bottom-1/4 left-1/4 w-3 h-3 rounded-full bg-blue-400 opacity-50" />
          <div className="relative z-10 grid grid-cols-2 gap-4 w-full max-w-sm">
             <StatBox icon={Users} colorTheme="blue" label="Participants" count="10K+" />
             <StatBox icon={Target} colorTheme="green" label="Competitions" count="500+" />
             <StatBox icon={Box} colorTheme="orange" label="Organizations" count="100+" />
             <StatBox icon={Activity} colorTheme="purple" label="Case Studies" count="50+" />
          </div>
        </>
      )
    case 'network-node':
      return (
        <div className="relative w-full h-full flex items-center justify-center">
          {/* Connecting lines */}
          <div className="absolute w-full h-px bg-slate-200 top-1/2 -translate-y-1/2" />
          <div className="absolute h-full w-px bg-slate-200 left-1/2 -translate-x-1/2" />
          <div className="absolute w-48 h-48 border-2 border-dashed border-slate-200 rounded-full" />
          
          {/* Nodes */}
          <div className="absolute z-10 w-20 h-20 rounded-2xl bg-gradient-to-br from-red-500 to-purple-600 shadow-lg shadow-red-500/20 flex items-center justify-center animate-pulse">
             <Network className="text-white" size={32} />
          </div>
          <div className="absolute z-10 top-[20%] left-[20%] w-12 h-12 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center justify-center text-blue-500"><Users size={20} /></div>
          <div className="absolute z-10 bottom-[20%] right-[20%] w-12 h-12 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center justify-center text-emerald-500"><ShieldCheck size={20} /></div>
          <div className="absolute z-10 top-[20%] right-[20%] w-12 h-12 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center justify-center text-orange-500"><Box size={20} /></div>
          <div className="absolute z-10 bottom-[20%] left-[20%] w-12 h-12 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center justify-center text-purple-500"><Activity size={20} /></div>
        </div>
      )
    case 'telemetry-dashboard':
      return (
        <div className="relative w-full max-w-sm">
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHBhdGggZD0iTTEgMWgyMHYyMEgxek0wIDBoMjF2MjFIMHoiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2YxZjViOSIgc3Ryb2tlLXdpZHRoPSIxIi8+PC9zdmc+')] opacity-50" />
          <div className="relative z-10 bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden">
            <div className="bg-slate-50 border-b border-slate-200 px-4 py-3 flex items-center gap-2">
              <Activity size={16} className="text-blue-600" />
              <span className="text-xs font-black text-slate-950 uppercase tracking-widest">Live Telemetry</span>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                <div className="text-[10px] font-bold text-slate-500 uppercase">Active Competitions</div>
                <div className="text-2xl font-black text-slate-950">24</div>
                <div className="w-full bg-slate-200 rounded-full h-1 mt-2">
                  <div className="bg-emerald-500 h-1 rounded-full w-[70%]" />
                </div>
              </div>
              <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-bold text-slate-500 uppercase">Innovation Index</div>
                  <div className="text-lg font-black text-slate-950">+14.2%</div>
                </div>
                <TrendingUp size={24} className="text-purple-500" />
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  <div className="h-1.5 bg-slate-100 rounded-full flex-1"><div className="h-full bg-emerald-500 rounded-full w-[90%]" /></div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  <div className="h-1.5 bg-slate-100 rounded-full flex-1"><div className="h-full bg-emerald-500 rounded-full w-[85%]" /></div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  <div className="h-1.5 bg-slate-100 rounded-full flex-1"><div className="h-full bg-emerald-500 rounded-full w-[95%]" /></div>
                </div>
              </div>
            </div>
          </div>
          <div className="absolute -right-6 -bottom-6 bg-white border border-slate-200 rounded-xl p-3 shadow-lg z-20 flex items-center gap-2 animate-bounce">
            <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            <span className="text-[10px] font-bold text-slate-950 uppercase tracking-widest">DATA STREAM</span>
          </div>
        </div>
      )
    case 'layered-rings':
      return (
        <div className="relative w-full h-full flex items-center justify-center">
          <div className="absolute w-80 h-32 border-2 border-slate-200 rounded-[100%] rotate-12" />
          <div className="absolute w-80 h-32 border-2 border-slate-200/60 rounded-[100%] -rotate-12" />
          <div className="absolute w-80 h-32 border-2 border-slate-100 rounded-[100%] rotate-45" />
          <div className="relative z-10 w-16 h-16 rounded-full bg-gradient-to-tr from-blue-500 via-purple-500 to-red-500 shadow-[0_0_40px_rgba(168,85,247,0.4)] animate-pulse" />
          <div className="absolute w-3 h-3 rounded-full bg-blue-500 top-[20%] left-[30%]" />
          <div className="absolute w-4 h-4 rounded-full bg-emerald-400 bottom-[20%] right-[30%]" />
          <div className="absolute w-2 h-2 rounded-full bg-orange-400 top-[40%] right-[20%]" />
        </div>
      )
    default:
      return null
  }
}

function Hero() {
  const [activeHeroSlide, setActiveHeroSlide] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveHeroSlide((prev) => (prev + 1) % heroSlides.length)
    }, 4000)
    return () => window.clearInterval(timer)
  }, []);

  const handleCaseStudiesClick = (event) => {
    event.preventDefault()

    const aboutSection = document.getElementById('about')
    if (!aboutSection) return

    const navbarOffset = 88
    const targetTop = aboutSection.getBoundingClientRect().top + window.scrollY - navbarOffset

    window.scrollTo({
      top: Math.max(targetTop, 0),
      behavior: 'smooth',
    })
  }

  return (
    <section className="relative w-full pt-20 pb-16 px-6 overflow-hidden flex flex-col items-center border-b border-slate-200 min-h-[700px]">
      {/* Subtle Background Patterns */}
      <div className="absolute top-20 left-10 opacity-40 hidden lg:grid grid-cols-4 gap-3 pointer-events-none">
        {Array.from({ length: 24 }).map((_, i) => <div key={i} className="w-1 h-1 rounded-full bg-slate-300" />)}
      </div>

      <div className="max-w-7xl mx-auto w-full relative z-10 flex flex-col lg:flex-row items-center gap-16 mb-16">
        
        {/* Left Content */}
        <div className="w-full lg:w-[45%] flex flex-col justify-center min-h-[600px] sm:min-h-[560px] lg:min-h-[530px]">
          <div className="relative w-full h-[470px] sm:h-[430px] lg:h-[430px]">
            {heroSlides.map((slide, index) => (
              <div
                key={index}
                className={`absolute inset-0 flex flex-col justify-center transition-opacity duration-700 ease-out ${activeHeroSlide === index ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'}`}
              >
                <div className="inline-flex items-center self-start gap-2 px-3 py-1.5 rounded-full border border-blue-200 bg-blue-50 text-blue-700 text-[10px] font-bold uppercase tracking-widest mb-6">
                  <Sparkles size={12} /> {slide.eyebrow}
                </div>

                <h1 className="text-5xl lg:text-6xl font-black text-slate-950 tracking-tight leading-[1.1] mb-6">
                  {slide.title}<br />
                  <span className="text-red-500">{slide.highlight}</span>
                </h1>

                <p className="text-lg text-slate-600 font-medium leading-relaxed max-w-lg">
                  {slide.description}
                </p>
              </div>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row gap-4 mt-8 shrink-0">
            <Link
              to="/participant"
              className="flex items-center justify-center gap-2 px-8 py-3.5 bg-gradient-to-r from-red-500 to-red-600 text-white text-sm font-bold rounded-xl shadow-lg shadow-red-500/20 hover:from-red-600 hover:to-red-700 transition-all"
            >
              Explore Competitions <ArrowRight size={16} />
            </Link>

            <a
              href="#about"
              onClick={handleCaseStudiesClick}
              className="flex items-center justify-center gap-2 px-8 py-3.5 bg-white border border-slate-200 text-slate-700 text-sm font-bold rounded-xl shadow-sm hover:bg-slate-50 transition-all"
            >
              View Case Studies
            </a>
          </div>
        </div>

        {/* Right Visual */}
        <div className="w-full lg:w-[55%] relative h-[450px]">
          <div className="bg-white/80 backdrop-blur rounded-[28px] border border-slate-200/80 shadow-[0_24px_70px_rgba(15,23,42,0.08)] p-10 relative overflow-hidden aspect-[4/3] w-full h-full flex items-center justify-center">
            
            {heroSlides.map((slide, index) => (
              <div
                key={index}
                className={`absolute inset-0 flex items-center justify-center transition-opacity duration-700 ease-out ${activeHeroSlide === index ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'}`}
              >
                <HeroVisual type={slide.visualType} />
              </div>
            ))}

            <div className="absolute bottom-6 right-8 flex gap-2 z-20">
              {heroSlides.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setActiveHeroSlide(i)}
                  className={`w-2 h-2 rounded-full transition-all ${activeHeroSlide === i ? 'bg-red-500 w-4' : 'bg-slate-300'}`}
                  aria-label={`Go to slide ${i + 1}`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Stats Strip */}
      <div className="max-w-6xl mx-auto w-full bg-white/90 backdrop-blur rounded-[24px] border border-slate-200/80 shadow-[0_18px_45px_rgba(15,23,42,0.06)] px-8 py-8 relative z-20">
        <div className="flex flex-col md:flex-row items-center justify-between gap-8 md:gap-0 divide-y md:divide-y-0 md:divide-x divide-slate-100">
           
           <div className="flex items-center gap-4 px-6 w-full justify-center md:justify-start">
             <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 border border-blue-100">
               <Users size={20} />
             </div>
             <div>
               <div className="text-2xl font-black text-slate-950 leading-none mb-1">10k+</div>
               <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">PARTICIPANTS</div>
             </div>
           </div>

           <div className="flex items-center gap-4 px-6 w-full justify-center md:justify-start pt-6 md:pt-0">
             <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-100">
               <Target size={20} />
             </div>
             <div>
               <div className="text-2xl font-black text-slate-950 leading-none mb-1">500+</div>
               <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">COMPETITIONS</div>
             </div>
           </div>

           <div className="flex items-center gap-4 px-6 w-full justify-center md:justify-start pt-6 md:pt-0">
             <div className="w-12 h-12 rounded-full bg-orange-50 text-orange-500 flex items-center justify-center shrink-0 border border-orange-100">
               <Box size={20} />
             </div>
             <div>
               <div className="text-2xl font-black text-slate-950 leading-none mb-1">100+</div>
               <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">ORGANIZATIONS</div>
             </div>
           </div>

           <div className="flex items-center gap-4 px-6 w-full justify-center md:justify-start pt-6 md:pt-0">
             <div className="w-12 h-12 rounded-full bg-purple-50 text-purple-600 flex items-center justify-center shrink-0 border border-purple-100">
               <Activity size={20} />
             </div>
             <div>
               <div className="text-2xl font-black text-slate-950 leading-none mb-1">50+</div>
               <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">CASE STUDIES</div>
             </div>
           </div>

        </div>
      </div>
    </section>
  )
}
function SectionHeader({ badge, title, subtitle }) {
  return (
    <div className="text-center mb-12 flex flex-col items-center">
      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-[10px] font-bold uppercase tracking-widest mb-4">
        <Star size={12} /> {badge}
      </div>
      <h2 className="text-4xl font-black text-slate-950 mb-3">{title}</h2>
      <div className="w-12 h-1 bg-red-500 rounded-full mb-4"></div>
      <p className="text-sm font-medium text-slate-500">{subtitle}</p>
    </div>
  )
}

function About() {
  return (
    <section id="about" className="py-24 px-6 relative z-10 border-b border-slate-200">
      
      <div className="absolute top-20 left-10 opacity-30 hidden lg:grid grid-cols-4 gap-3 pointer-events-none">
        {Array.from({ length: 24 }).map((_, i) => <div key={i} className="w-1.5 h-1.5 rounded-full bg-slate-300" />)}
      </div>

      <div className="max-w-6xl mx-auto">
        <SectionHeader badge="ABOUT EVENTOS" title="About EventOS" subtitle="The complete operating system for modern hackathons." />

        <div className="grid md:grid-cols-2 gap-8">
          
          <div className="bg-white/90 border border-slate-200/80 rounded-[22px] shadow-[0_18px_45px_rgba(15,23,42,0.06)] p-10">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                <Box size={24} />
              </div>
              <h3 className="text-xl font-bold text-blue-700">What is EventOS?</h3>
            </div>
            <div className="w-8 h-1 bg-blue-600 rounded-full mb-6"></div>
            
            <p className="text-sm text-slate-600 font-medium leading-relaxed mb-6">
              EventOS is a comprehensive event orchestration engine originally built for the WISE@TI Hackathon. It is designed to handle the complex logistics of large-scale competitions in a single unified environment.
            </p>
            <p className="text-sm text-slate-600 font-medium leading-relaxed">
              By replacing fragmented tools—like disconnected forms, spreadsheets, and messaging apps—with an integrated platform, EventOS eliminates administrative overhead and allows organizers to focus on the event experience.
            </p>
          </div>

          <div className="bg-white/90 border border-slate-200/80 rounded-[22px] shadow-[0_18px_45px_rgba(15,23,42,0.06)] p-10">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                <Target size={24} />
              </div>
              <h3 className="text-xl font-bold text-emerald-700">Core Philosophy</h3>
            </div>
            <div className="w-8 h-1 bg-emerald-600 rounded-full mb-8"></div>
            
            <div className="space-y-6">
               <div className="flex gap-4">
                 <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 mt-0.5">
                   <Users size={14} />
                 </div>
                 <p className="text-sm text-slate-600 font-medium leading-relaxed">
                   <strong className="text-slate-950">For Participants:</strong> Remove friction. A unified hub to manage team formation, track milestones, and submit deliverables securely.
                 </p>
               </div>
               <div className="w-full h-px bg-slate-100"></div>

               <div className="flex gap-4">
                 <div className="w-8 h-8 rounded-full bg-purple-50 text-purple-600 flex items-center justify-center shrink-0 mt-0.5">
                   <Star size={14} />
                 </div>
                 <p className="text-sm text-slate-600 font-medium leading-relaxed">
                   <strong className="text-slate-950">For Mentors & Judges:</strong> Provide clarity. Structured evaluation pipelines, clear team assignments, and centralized communication.
                 </p>
               </div>
               <div className="w-full h-px bg-slate-100"></div>

               <div className="flex gap-4">
                 <div className="w-8 h-8 rounded-full bg-orange-50 text-orange-500 flex items-center justify-center shrink-0 mt-0.5">
                   <Shield size={14} />
                 </div>
                 <p className="text-sm text-slate-600 font-medium leading-relaxed">
                   <strong className="text-slate-950">For Committees:</strong> Maintain control. Real-time telemetry, automated anomaly detection, and comprehensive control over the entire event lifecycle.
                 </p>
               </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  )
}

function Features() {
  const features = [
    {
      icon: <Users className="text-blue-600" size={24} />,
      bg: 'bg-blue-50',
      title: "Algorithmic Team Formation",
      description: "AI-powered heuristics that automatically form balanced teams based on multidimensional skill vectors."
    },
    {
      icon: <ShieldCheck className="text-emerald-600" size={24} />,
      bg: 'bg-emerald-50',
      title: "Anomaly Detection",
      description: "Real-time monitoring of evaluation streams to automatically flag suspicious statistical variances."
    },
    {
      icon: <Activity className="text-purple-600" size={24} />,
      bg: 'bg-purple-50',
      title: "Evaluation Telemetry",
      description: "Streamlined rubrics and real-time scoring interfaces for transparent project assessment."
    },
    {
      icon: <Target className="text-orange-600" size={24} />,
      bg: 'bg-orange-50',
      title: "Mentor Logistics",
      description: "Enterprise tools for mentors to track team velocity, schedule syncs, and submit structured feedback."
    },
    {
      icon: <UserCircle className="text-blue-600" size={24} />,
      bg: 'bg-blue-50',
      title: "Participant Hub",
      description: "A centralized dashboard for participants to manage repositories, submit deliverables, and track milestones."
    },
    {
      icon: <LayoutDashboard className="text-emerald-600" size={24} />,
      bg: 'bg-emerald-50',
      title: "Command Center",
      description: "A comprehensive administrative console to govern the entire event lifecycle and monitor infrastructure."
    },
    {
      icon: <Star className="text-purple-600" size={24} />,
      bg: 'bg-purple-50',
      title: "Real-Time Leaderboards",
      description: "Dynamic ranking systems that update instantly as evaluation streams are processed."
    },
    {
      icon: <FileText className="text-orange-600" size={24} />,
      bg: 'bg-orange-50',
      title: "Resource Management",
      description: "Centralized repository for distributing guidelines, templates, and datasets to participants securely."
    },
    {
      icon: <Network className="text-blue-600" size={24} />,
      bg: 'bg-blue-50',
      title: "Cross-Platform Integration",
      description: "Seamlessly connect with existing enterprise tools through our robust webhook and API architecture."
    }
  ]

  return (
    <section id="features" className="py-24 px-6 relative z-10 border-b border-slate-200">
      
      <div className="absolute bottom-40 right-10 opacity-30 hidden lg:grid grid-cols-4 gap-3 pointer-events-none">
        {Array.from({ length: 24 }).map((_, i) => <div key={i} className="w-1.5 h-1.5 rounded-full bg-slate-300" />)}
      </div>

      <div className="max-w-6xl mx-auto">
        <SectionHeader badge="FEATURES" title="Features" subtitle="Enterprise-grade tooling designed for massive scale." />

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((f, i) => (
            <div key={i} className="bg-white/90 border border-slate-200/80 rounded-[22px] p-8 shadow-[0_18px_45px_rgba(15,23,42,0.06)] hover:-translate-y-1 transition-transform">
              <div className={`w-14 h-14 rounded-xl flex items-center justify-center mb-6 ${f.bg}`}>
                {f.icon}
              </div>
              <h3 className="text-base font-black text-slate-950 mb-3">{f.title}</h3>
              <p className="text-sm text-slate-500 leading-relaxed font-medium">{f.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function Portals() {
  const portals = [
    { title: 'Participant Portal', path: '/participant', desc: 'Join teams and submit deliverables', icon: Users, color: 'text-blue-600', bg: 'bg-blue-50' },
    { title: 'Mentor Portal', path: '/mentor', desc: 'Guide teams to success', icon: Users, color: 'text-purple-600', bg: 'bg-purple-50' },
    { title: 'Judge Portal', path: '/judge', desc: 'Evaluate project submissions', icon: Gavel, color: 'text-orange-500', bg: 'bg-orange-50' },
    { title: 'Admin Console', path: '/admin', desc: 'Manage event operations', icon: ShieldCheck, color: 'text-red-500', bg: 'bg-red-50' },
  ]

  return (
    <section id="portals" className="py-24 px-6 relative z-10">
      <div className="max-w-6xl mx-auto text-center">
        <h2 className="text-3xl font-black text-slate-950 mb-3">Access Infrastructure</h2>
        <div className="w-12 h-1 bg-red-500 rounded-full mb-4 mx-auto"></div>
        <p className="text-sm font-medium text-slate-500 mb-12">Authenticate to your provisioned workspace based on your clearance level.</p>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {portals.map((p, i) => (
            <Link key={i} to={p.path} className="bg-white border border-slate-200/80 rounded-[18px] p-6 shadow-sm hover:shadow-md transition-all text-left group flex flex-col items-center text-center">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-4 ${p.bg} ${p.color} transition-transform group-hover:scale-110`}>
                 <p.icon size={20} />
              </div>
              <h3 className={`text-sm font-black mb-2 ${p.color}`}>{p.title}</h3>
              <p className="text-xs text-slate-500 font-medium">{p.desc}</p>
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}



function Footer() {
  return (
    <footer className="border-t border-slate-200 py-12 px-6 relative z-10">
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-2">
          <EventOSLogo className="text-slate-950" size={32} />
        </div>

        <p className="text-xs text-slate-500 font-bold">
          © 2026 EventOS Infrastructure. All rights reserved.
        </p>

        <div className="flex items-center gap-6 text-xs text-slate-500 font-bold">
          <a href="#" className="hover:text-slate-950 transition-colors">Privacy Policy</a>
          <a href="#" className="hover:text-slate-950 transition-colors">Terms of Service</a>
          <a href="#" className="hover:text-slate-950 transition-colors">System Status</a>
        </div>
      </div>
    </footer>
  )
}

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#f8fbff] text-slate-950 font-sans">
      <Navbar />
      <main>
        <Hero />
        <About />
        <Features />
        <Portals />
      </main>
      <Footer />
    </div>
  )
}
