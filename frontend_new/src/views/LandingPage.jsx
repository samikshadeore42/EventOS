import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Activity, Network, Building2, LayoutDashboard, Database, Globe2, Cpu, LineChart, ShieldCheck, Target, FileText, Users, Star } from 'lucide-react'
import EventOSLogo from '../components/EventOSLogo'

function Navbar() {
  return (
    <nav className="border-b border-slate-200 bg-white/90 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <EventOSLogo className="text-indigo-700" size={48} />
        </div>
        
        <div className="hidden md:flex items-center gap-6 text-sm font-semibold tracking-wide">
          <a href="#about" className="text-slate-600 hover:text-indigo-600 transition-colors">About</a>
          <a href="#features" className="text-slate-600 hover:text-indigo-600 transition-colors">Features</a>
          
          <div className="h-4 w-px bg-slate-300 mx-2"></div>
          
          <Link to="/participant" className="text-slate-600 hover:text-cyan-600 transition-colors">Participant</Link>
          <Link to="/mentor" className="text-slate-600 hover:text-blue-600 transition-colors">Mentor</Link>
          <Link to="/judge" className="text-slate-600 hover:text-indigo-600 transition-colors">Judge</Link>
          <Link to="/admin" className="px-4 py-2 bg-indigo-600 text-white border border-indigo-700 rounded hover:bg-indigo-700 transition-all ml-2">
            Admin Console
          </Link>
        </div>
      </div>
    </nav>
  )
}

function CommandCenterVisual() {
  return (
    <div className="w-full h-full relative flex items-center justify-center p-4 md:p-8">
      <div className="absolute inset-0 bg-[linear-gradient(rgba(79,70,229,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(79,70,229,0.05)_1px,transparent_1px)] bg-[size:40px_40px]" />
      
      <div className="relative w-full max-w-lg aspect-video bg-white/80 backdrop-blur-xl border border-slate-200 rounded-xl p-4 shadow-xl shadow-slate-200/50 flex flex-col gap-4">
        <div className="flex justify-between items-center border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Activity className="text-indigo-600" size={16} />
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Live Telemetry</span>
          </div>
          <div className="flex gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-slate-300"></div>
            <div className="w-1.5 h-1.5 rounded-full bg-slate-300"></div>
            <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse"></div>
          </div>
        </div>
        
        <div className="flex-1 grid grid-cols-3 gap-3">
          <div className="col-span-2 grid grid-rows-2 gap-3">
             <div className="bg-slate-50/80 rounded border border-slate-200 p-3 flex flex-col justify-center shadow-sm">
               <span className="text-[9px] text-slate-500 uppercase tracking-widest font-bold">Active Competitions</span>
               <div className="text-2xl font-mono text-indigo-900 mt-1 font-bold">24</div>
               <div className="w-full h-1.5 bg-slate-200 mt-2 rounded-full overflow-hidden">
                 <div className="h-full bg-indigo-500 w-[60%]"></div>
               </div>
             </div>
             <div className="bg-slate-50/80 rounded border border-slate-200 p-3 flex flex-col justify-center relative overflow-hidden shadow-sm">
                <LineChart className="absolute right-[-10px] bottom-[-10px] w-20 h-20 text-indigo-500/10" />
               <span className="text-[9px] text-slate-500 uppercase tracking-widest font-bold">Innovation Index</span>
               <div className="text-2xl font-mono text-blue-600 mt-1 font-bold">+14.2%</div>
             </div>
          </div>
          <div className="col-span-1 bg-slate-50/80 rounded border border-slate-200 p-3 flex flex-col gap-3 justify-center shadow-sm">
            <span className="text-[9px] text-slate-500 uppercase tracking-widest font-bold">System Status</span>
            {[78, 92, 85].map((pct, i) => (
              <div key={i} className="flex items-center gap-2">
                <ShieldCheck size={12} className="text-emerald-500 shrink-0" />
                <div className="h-1.5 flex-1 bg-slate-200 rounded-full">
                   <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${pct}%`}}></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      
      <div className="absolute top-1/4 right-4 md:right-8 w-32 bg-white/90 backdrop-blur-md border border-slate-200 rounded p-2 shadow-lg animate-float">
         <div className="text-[8px] text-slate-500 uppercase tracking-widest font-bold mb-1">Data Stream</div>
         <div className="h-1 w-full bg-gradient-to-r from-indigo-500 to-cyan-500 rounded-full"></div>
      </div>
    </div>
  )
}

function SmartCityVisual() {
  return (
    <div className="w-full h-full relative flex items-center justify-center p-8">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-indigo-50 via-transparent to-transparent" />
      
      <div className="relative w-full max-w-md aspect-square">
        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100">
           <path d="M50,50 L20,30 L20,70 Z" fill="rgba(79,70,229,0.03)" stroke="rgba(79,70,229,0.2)" strokeWidth="0.5" />
           <path d="M50,50 L80,30 L80,70 Z" fill="rgba(6,182,212,0.03)" stroke="rgba(6,182,212,0.2)" strokeWidth="0.5" />
           <path d="M20,30 L80,30" stroke="rgba(59,130,246,0.3)" strokeWidth="0.5" strokeDasharray="1,1" className="animate-pulse" />
        </svg>
        
        <div className="absolute top-1/2 left-1/2 -mt-6 -ml-6 w-12 h-12 bg-indigo-600 border border-indigo-400 rounded-lg shadow-[0_0_20px_rgba(79,70,229,0.3)] flex items-center justify-center z-10">
          <Database size={20} className="text-white" />
        </div>
        
        <div className="absolute top-[30%] left-[20%] -mt-4 -ml-4 w-8 h-8 bg-white border border-slate-200 shadow-md rounded-lg flex items-center justify-center z-10 animate-float" style={{ animationDuration: '3s' }}>
          <Building2 size={14} className="text-blue-600" />
        </div>
        <div className="absolute top-[30%] left-[80%] -mt-4 -ml-4 w-8 h-8 bg-white border border-slate-200 shadow-md rounded-lg flex items-center justify-center z-10 animate-float" style={{ animationDuration: '4s', animationDirection: 'reverse' }}>
          <Network size={14} className="text-indigo-600" />
        </div>
        <div className="absolute top-[70%] left-[20%] -mt-4 -ml-4 w-8 h-8 bg-white border border-slate-200 shadow-md rounded-lg flex items-center justify-center z-10 animate-float" style={{ animationDuration: '3.5s' }}>
          <Cpu size={14} className="text-teal-600" />
        </div>
        <div className="absolute top-[70%] left-[80%] -mt-4 -ml-4 w-8 h-8 bg-white border border-slate-200 shadow-md rounded-lg flex items-center justify-center z-10 animate-float" style={{ animationDuration: '4.5s', animationDirection: 'reverse' }}>
          <Globe2 size={14} className="text-cyan-600" />
        </div>
        
        <div className="absolute top-[40%] left-[35%] w-2 h-2 bg-cyan-400 rounded-full shadow-[0_0_8px_#22d3ee] animate-ping" />
        <div className="absolute top-[60%] left-[65%] w-2 h-2 bg-indigo-400 rounded-full shadow-[0_0_8px_#818cf8] animate-ping" style={{ animationDelay: '1s' }} />
      </div>
    </div>
  )
}

function HolographicEcosystemVisual() {
  return (
    <div className="w-full h-full relative flex items-center justify-center p-8" style={{ perspective: '1000px' }}>
      <div className="relative w-full max-w-sm aspect-square" style={{ transform: 'rotateX(60deg) rotateZ(45deg)', transformStyle: 'preserve-3d' }}>
        <div className="absolute inset-0 border border-blue-200 rounded-full bg-blue-50/50 shadow-inner" />
        
        <div className="absolute inset-4" style={{ transform: 'translateZ(48px)', transformStyle: 'preserve-3d' }}>
           <div className="w-full h-full border border-cyan-300 rounded-full bg-cyan-50/50 animate-[spin_20s_linear_infinite] shadow-sm" />
        </div>
        
        <div className="absolute inset-8" style={{ transform: 'translateZ(96px)', transformStyle: 'preserve-3d' }}>
           <div className="w-full h-full border border-indigo-300 rounded-full bg-indigo-50/50 animate-[spin_15s_linear_infinite_reverse] shadow-sm" />
        </div>
        
        <div className="absolute top-1/2 left-1/2 w-[2px] h-48 bg-gradient-to-b from-transparent via-indigo-400 to-transparent -mt-24 -ml-[1px] animate-[pulse_2s_infinite]" style={{ transform: 'rotateX(-90deg) rotateY(-45deg)' }} />
        
        <div className="absolute top-1/2 left-1/2 -mt-4 -ml-4 w-8 h-8 rounded-full bg-indigo-500 shadow-[0_0_20px_rgba(99,102,241,0.5)] blur-[2px]" style={{ transform: 'translateZ(64px)' }} />
      </div>
    </div>
  )
}

function InnovationHubVisual() {
  return (
    <div className="w-full h-full relative flex items-center justify-center p-8">
      <div className="w-full max-w-sm grid grid-cols-2 gap-4">
        <div className="bg-white backdrop-blur-sm border border-slate-200 p-5 rounded shadow-lg transform translate-y-4">
          <Users className="text-blue-600 mb-3" size={24} />
          <div className="h-1.5 w-1/2 bg-slate-200 rounded mb-2"></div>
          <div className="h-1.5 w-3/4 bg-slate-200 rounded"></div>
        </div>
        <div className="bg-white backdrop-blur-sm border border-slate-200 p-5 rounded shadow-lg transform -translate-y-4">
          <Target className="text-cyan-600 mb-3" size={24} />
          <div className="h-1.5 w-2/3 bg-slate-200 rounded mb-2"></div>
          <div className="h-1.5 w-1/2 bg-slate-200 rounded"></div>
        </div>
        <div className="bg-white backdrop-blur-sm border border-slate-200 p-5 rounded shadow-lg transform translate-x-2">
          <Globe2 className="text-indigo-600 mb-3" size={24} />
          <div className="h-1.5 w-full bg-slate-200 rounded mb-2"></div>
          <div className="h-1.5 w-1/3 bg-slate-200 rounded"></div>
        </div>
        <div className="bg-white backdrop-blur-sm border border-slate-200 p-5 rounded shadow-lg transform -translate-x-2 relative overflow-hidden">
          <div className="absolute -right-4 -top-4 w-16 h-16 bg-indigo-100 rounded-full blur-xl" />
          <Activity className="text-teal-600 mb-3 relative z-10" size={24} />
          <div className="h-1.5 w-1/2 bg-slate-200 rounded mb-2 relative z-10"></div>
          <div className="h-1.5 w-2/3 bg-slate-200 rounded relative z-10"></div>
        </div>
      </div>
      
      <div className="absolute top-1/2 left-1/2 -mt-32 -ml-32 w-64 h-64 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />
    </div>
  )
}

function EnterpriseHero() {
  const slides = [
    {
      title: "Reimagine Innovation Through Competition",
      desc: "The central operating system for enterprise-grade hackathons. Connect students, innovators, and organizations to solve real-world challenges.",
      Visual: InnovationHubVisual
    },
    {
      title: "Transform Ideas Into Impact",
      desc: "A unified digital ecosystem bridging hackathons, case studies, and research programs through intelligent pathways.",
      Visual: HolographicEcosystemVisual
    },
    {
      title: "Accelerate Learning Through Real Challenges",
      desc: "Partner with industry leaders, research centers, and universities in a robust, globally connected infrastructure.",
      Visual: SmartCityVisual
    },
    {
      title: "Build Solutions That Matter",
      desc: "Track live metrics, manage team collaborations, and showcase projects on transparent, high-performance telemetry dashboards.",
      Visual: CommandCenterVisual
    }
  ]

  const [currentSlide, setCurrentSlide] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide(s => (s + 1) % slides.length)
    }, 6000)
    return () => clearInterval(timer)
  }, [slides.length])

  return (
    <section className="relative w-full min-h-screen pt-24 pb-16 px-6 bg-slate-50 overflow-hidden flex items-center border-b border-slate-200">
      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }
        .animate-float {
          animation: float 4s ease-in-out infinite;
        }
      `}</style>
      
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-indigo-100/50 rounded-full blur-[120px] mix-blend-multiply" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] bg-cyan-100/50 rounded-full blur-[150px] mix-blend-multiply" />
      </div>

      <div className="max-w-7xl mx-auto w-full relative z-10 flex flex-col lg:flex-row items-center gap-16">
        

        <div className="w-full lg:w-[45%] flex flex-col pt-10 lg:pt-0">
          <div className="grid grid-cols-1 grid-rows-1">
            {slides.map((slide, index) => (
              <div 
                key={index}
                className={`col-start-1 row-start-1 w-full transition-all duration-700 ease-in-out ${index === currentSlide ? 'opacity-100 translate-y-0 pointer-events-auto z-10' : 'opacity-0 translate-y-4 pointer-events-none z-0'}`}
              >
                <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-slate-900 tracking-tight mb-6 leading-[1.1]">
                  {slide.title}
                </h1>
                <p className="text-lg text-slate-600 leading-relaxed font-medium">
                  {slide.desc}
                </p>
              </div>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row gap-4 mt-14">
            <Link to="/participant" className="flex items-center justify-center gap-2 px-8 py-3.5 bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors rounded shadow-md shadow-indigo-600/20">
              Explore Competitions <ArrowRight size={16} />
            </Link>
            <a href="#about" className="flex items-center justify-center gap-2 px-8 py-3.5 bg-white border border-slate-300 text-slate-700 text-sm font-semibold hover:bg-slate-50 transition-colors rounded shadow-sm">
              View Case Studies
            </a>
          </div>

          <div className="mt-16 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4 gap-6 pt-8 border-t border-slate-200">
            <div>
              <div className="text-2xl font-mono text-indigo-900 font-bold mb-1">10k+</div>
              <div className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Participants</div>
            </div>
            <div>
              <div className="text-2xl font-mono text-indigo-900 font-bold mb-1">500+</div>
              <div className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Competitions</div>
            </div>
            <div>
              <div className="text-2xl font-mono text-indigo-900 font-bold mb-1">100+</div>
              <div className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Organizations</div>
            </div>
            <div>
              <div className="text-2xl font-mono text-indigo-900 font-bold mb-1">50+</div>
              <div className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Case Studies</div>
            </div>
          </div>
        </div>

        <div className="w-full lg:w-[55%] h-[500px] lg:h-[650px] relative rounded-xl bg-white border border-slate-200 overflow-hidden shadow-2xl shadow-slate-200">
          {slides.map((slide, index) => {
            const Visual = slide.Visual;
            return (
              <div 
                key={index}
                className={`absolute inset-0 transition-opacity duration-1000 ease-in-out ${index === currentSlide ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'}`}
              >
                 <Visual />
              </div>
            )
          })}
          
          <div className="absolute bottom-6 right-6 flex gap-3 z-20">
            {slides.map((_, idx) => (
              <button 
                key={idx}
                onClick={() => setCurrentSlide(idx)}
                className={`w-2 h-2 rounded-full transition-all duration-300 ${idx === currentSlide ? 'bg-indigo-600 scale-125' : 'bg-slate-300 hover:bg-slate-400'}`}
              />
            ))}
          </div>
        </div>

      </div>
    </section>
  )
}

function About() {
  return (
    <section id="about" className="py-24 px-6 bg-white relative z-10 border-t border-slate-200">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold text-slate-900 mb-4">About EventOS</h2>
          <p className="text-lg text-slate-600 font-medium">The complete operating system for modern hackathons.</p>
        </div>
        
        <div className="grid md:grid-cols-2 gap-8 text-slate-600 font-medium leading-relaxed">
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-8 shadow-sm hover:shadow-md transition-shadow">
            <h3 className="text-xl font-bold text-indigo-700 mb-3">What is EventOS?</h3>
            <p className="mb-6">
              EventOS is a comprehensive event orchestration engine originally built for the WiSE@TI Hackathon. It is designed to handle the complex logistics of large-scale competitions in a single unified environment.
            </p>
            <p>
              By replacing fragmented tools—like disconnected forms, spreadsheets, and messaging apps—with an integrated platform, EventOS eliminates administrative overhead and allows organizers to focus on the event experience.
            </p>
          </div>
          
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-8 shadow-sm hover:shadow-md transition-shadow">
            <h3 className="text-xl font-bold text-indigo-700 mb-3">Core Philosophy</h3>
            <p className="mb-6">
              <strong className="text-slate-800">For Participants:</strong> Remove friction. A unified hub to manage team formation, track milestones, and submit deliverables securely.
            </p>
            <p className="mb-6">
              <strong className="text-slate-800">For Mentors & Judges:</strong> Provide clarity. Structured evaluation pipelines, clear team assignments, and centralized communication.
            </p>
            <p>
              <strong className="text-slate-800">For Committees:</strong> Maintain control. Real-time telemetry, automated anomaly detection, and comprehensive control over the entire event lifecycle.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

function Features() {
  const features = [
    {
      icon: <Users className="text-cyan-600" size={24} />,
      title: "Algorithmic Team Formation",
      description: "AI-powered heuristics that automatically form balanced teams based on multidimensional skill vectors."
    },
    {
      icon: <ShieldCheck className="text-indigo-600" size={24} />,
      title: "Anomaly Detection",
      description: "Real-time monitoring of evaluation streams to automatically flag suspicious statistical variances."
    },
    {
      icon: <Activity className="text-blue-600" size={24} />,
      title: "Evaluation Telemetry",
      description: "Streamlined rubrics and real-time scoring interfaces for transparent project assessment."
    },
    {
      icon: <Target className="text-cyan-600" size={24} />,
      title: "Mentor Logistics",
      description: "Enterprise tools for mentors to track team velocity, schedule syncs, and submit structured feedback."
    },
    {
      icon: <Users className="text-indigo-600" size={24} />,
      title: "Participant Hub",
      description: "A centralized dashboard for participants to manage repositories, submit deliverables, and track milestones."
    },
    {
      icon: <LayoutDashboard className="text-blue-600" size={24} />,
      title: "Command Center",
      description: "A comprehensive administrative console to govern the entire event lifecycle and monitor infrastructure."
    },
    {
      icon: <Star className="text-cyan-600" size={24} />,
      title: "Real-Time Leaderboards",
      description: "Dynamic ranking systems that update instantly as evaluation streams are processed."
    },
    {
      icon: <FileText className="text-indigo-600" size={24} />,
      title: "Resource Management",
      description: "Centralized repository for distributing guidelines, templates, and datasets to participants securely."
    },
    {
      icon: <Network className="text-blue-600" size={24} />,
      title: "Cross-Platform Integration",
      description: "Seamlessly connect with existing enterprise tools through our robust webhook and API architecture."
    }
  ]

  return (
    <section id="features" className="py-24 px-6 bg-slate-50 relative z-10 border-t border-slate-200">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold text-slate-900 mb-4">Features</h2>
          <p className="text-slate-600 max-w-2xl mx-auto text-lg font-medium">Enterprise-grade tooling designed for massive scale.</p>
        </div>
        
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((f, i) => (
            <div key={i} className="bg-white border border-slate-200 p-6 rounded-lg shadow-sm hover:shadow-md hover:border-indigo-300 transition-all duration-300 group">
              <div className="w-12 h-12 rounded bg-indigo-50 border border-indigo-100 flex items-center justify-center mb-6 group-hover:bg-indigo-100 transition-all duration-300">
                {f.icon}
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">{f.title}</h3>
              <p className="text-sm text-slate-600 leading-relaxed font-medium">{f.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function Portals() {
  const portals = [
    { title: 'Participant Portal', path: '/participant', desc: 'Join teams and submit deliverables', colorClass: 'text-cyan-700' },
    { title: 'Mentor Portal', path: '/mentor', desc: 'Guide teams to success', colorClass: 'text-blue-700' },
    { title: 'Judge Portal', path: '/judge', desc: 'Evaluate project submissions', colorClass: 'text-indigo-700' },
    { title: 'Admin Console', path: '/admin', desc: 'Manage event operations', colorClass: 'text-slate-800' },
  ]
  
  return (
    <section id="portals" className="py-24 px-6 bg-white relative z-10 border-t border-slate-200">
      <div className="max-w-7xl mx-auto text-center">
        <h2 className="text-3xl font-bold text-slate-900 mb-4">Access Infrastructure</h2>
        <p className="text-slate-600 max-w-2xl mx-auto text-lg font-medium mb-12">Authenticate to your provisioned workspace based on your clearance level.</p>
        
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
          {portals.map((p, i) => (
            <Link key={i} to={p.path} className="block p-6 rounded-lg border border-slate-200 shadow-sm hover:shadow-md hover:border-indigo-300 transition-all text-left bg-slate-50 group relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full bg-slate-200 group-hover:bg-indigo-500 transition-colors" />
              <h3 className={`text-lg font-bold mb-1 ml-2 transition-colors ${p.colorClass}`}>{p.title}</h3>
              <p className="text-sm text-slate-600 font-medium ml-2">{p.desc}</p>
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}



function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-white py-12 px-6 relative z-10">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-2">
          <EventOSLogo className="text-indigo-700" size={32} />
        </div>
        
        <p className="text-sm text-slate-500 font-medium">
          © {new Date().getFullYear()} EventOS Infrastructure. All rights reserved.
        </p>
        
        <div className="flex items-center gap-6 text-sm text-slate-500 font-medium">
          <a href="#" className="hover:text-indigo-600 transition-colors">Privacy Policy</a>
          <a href="#" className="hover:text-indigo-600 transition-colors">Terms of Service</a>
          <a href="#" className="hover:text-indigo-600 transition-colors">System Status</a>
        </div>
      </div>
    </footer>
  )
}

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white text-slate-600 selection:bg-indigo-100 selection:text-indigo-900 font-sans">
      <Navbar />
      <main>
        <EnterpriseHero />
        <About />
        <Features />
        <Portals />
      </main>
      <Footer />
    </div>
  )
}
