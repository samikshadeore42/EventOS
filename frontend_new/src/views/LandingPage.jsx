import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Activity, Network, Building2, LayoutDashboard, Database, Globe2, Cpu, LineChart, ShieldCheck, Target, FileText, Users, Star, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react'
import EventOSLogo from '../components/EventOSLogo'

// --- Custom Hooks ---
function useScrollReveal() {
  const [isVisible, setIsVisible] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true)
        }
      },
      { threshold: 0.15 }
    )
    if (ref.current) observer.observe(ref.current)
    return () => {
      if (ref.current) observer.unobserve(ref.current)
    }
  }, [])

  return [ref, isVisible]
}

// --- Visual Components (Preserved from Original) ---
function CommandCenterVisual() {
  return (
    <div className="w-full h-full relative flex items-center justify-center p-4 md:p-8">
      <div className="absolute inset-0 bg-[linear-gradient(rgba(109,40,217,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(109,40,217,0.05)_1px,transparent_1px)] bg-[size:40px_40px]" />
      
      <div className="relative w-full max-w-lg aspect-video bg-white/80 backdrop-blur-xl border border-slate-200 rounded-xl p-4 shadow-xl shadow-slate-200/50 flex flex-col gap-4">
        <div className="flex justify-between items-center border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Activity className="text-[#6D28D9]" size={16} />
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Live Telemetry</span>
          </div>
          <div className="flex gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-slate-300"></div>
            <div className="w-1.5 h-1.5 rounded-full bg-slate-300"></div>
            <div className="w-1.5 h-1.5 rounded-full bg-[#8B5CF6] animate-pulse"></div>
          </div>
        </div>
        
        <div className="flex-1 grid grid-cols-3 gap-3">
          <div className="col-span-2 grid grid-rows-2 gap-3">
             <div className="bg-slate-50/80 rounded border border-slate-200 p-3 flex flex-col justify-center shadow-sm hover:border-[#A78BFA] transition-colors">
               <span className="text-[9px] text-slate-500 uppercase tracking-widest font-bold">Active Competitions</span>
               <div className="text-2xl font-mono text-slate-800 mt-1 font-bold">24</div>
               <div className="w-full h-1.5 bg-slate-200 mt-2 rounded-full overflow-hidden">
                 <div className="h-full bg-[#8B5CF6] w-[60%]"></div>
               </div>
             </div>
             <div className="bg-slate-50/80 rounded border border-slate-200 p-3 flex flex-col justify-center relative overflow-hidden shadow-sm hover:border-[#A78BFA] transition-colors">
                <LineChart className="absolute right-[-10px] bottom-[-10px] w-20 h-20 text-[#6D28D9]/10" />
               <span className="text-[9px] text-slate-500 uppercase tracking-widest font-bold">Innovation Index</span>
               <div className="text-2xl font-mono text-[#6D28D9] mt-1 font-bold">+14.2%</div>
             </div>
          </div>
          <div className="col-span-1 bg-slate-50/80 rounded border border-slate-200 p-3 flex flex-col gap-3 justify-center shadow-sm hover:border-[#A78BFA] transition-colors">
            <span className="text-[9px] text-slate-500 uppercase tracking-widest font-bold">System Status</span>
            {[78, 92, 85].map((pct, i) => (
              <div key={i} className="flex items-center gap-2">
                <ShieldCheck size={12} className="text-[#8B5CF6] shrink-0" />
                <div className="h-1.5 flex-1 bg-slate-200 rounded-full">
                   <div className="h-full bg-[#8B5CF6] rounded-full" style={{ width: `${pct}%`}}></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      
      <div className="absolute top-1/4 right-4 md:right-8 w-32 bg-white/90 backdrop-blur-md border border-slate-200 rounded p-2 shadow-lg animate-float">
         <div className="text-[8px] text-slate-500 uppercase tracking-widest font-bold mb-1">Data Stream</div>
         <div className="h-1 w-full bg-gradient-to-r from-[#6D28D9] to-[#A78BFA] rounded-full"></div>
      </div>
    </div>
  )
}

function SmartCityVisual() {
  return (
    <div className="w-full h-full relative flex items-center justify-center p-8">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-violet-50 via-transparent to-transparent" />
      
      <div className="relative w-full max-w-md aspect-square">
        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100">
           <path d="M50,50 L20,30 L20,70 Z" fill="rgba(109,40,217,0.03)" stroke="rgba(109,40,217,0.2)" strokeWidth="0.5" />
           <path d="M50,50 L80,30 L80,70 Z" fill="rgba(139,92,246,0.03)" stroke="rgba(139,92,246,0.2)" strokeWidth="0.5" />
           <path d="M20,30 L80,30" stroke="rgba(167,139,250,0.4)" strokeWidth="0.5" strokeDasharray="1,1" className="animate-pulse" />
        </svg>
        
        <div className="absolute top-1/2 left-1/2 -mt-6 -ml-6 w-12 h-12 bg-[#6D28D9] border border-[#A78BFA] rounded-lg shadow-[0_0_20px_rgba(109,40,217,0.4)] flex items-center justify-center z-10">
          <Database size={20} className="text-white" />
        </div>
        
        <div className="absolute top-[30%] left-[20%] -mt-4 -ml-4 w-8 h-8 bg-white border border-slate-200 shadow-md rounded-lg flex items-center justify-center z-10 animate-float" style={{ animationDuration: '3s' }}>
          <Building2 size={14} className="text-[#8B5CF6]" />
        </div>
        <div className="absolute top-[30%] left-[80%] -mt-4 -ml-4 w-8 h-8 bg-white border border-slate-200 shadow-md rounded-lg flex items-center justify-center z-10 animate-float" style={{ animationDuration: '4s', animationDirection: 'reverse' }}>
          <Network size={14} className="text-[#6D28D9]" />
        </div>
        <div className="absolute top-[70%] left-[20%] -mt-4 -ml-4 w-8 h-8 bg-white border border-slate-200 shadow-md rounded-lg flex items-center justify-center z-10 animate-float" style={{ animationDuration: '3.5s' }}>
          <Cpu size={14} className="text-[#A78BFA]" />
        </div>
        <div className="absolute top-[70%] left-[80%] -mt-4 -ml-4 w-8 h-8 bg-white border border-slate-200 shadow-md rounded-lg flex items-center justify-center z-10 animate-float" style={{ animationDuration: '4.5s', animationDirection: 'reverse' }}>
          <Globe2 size={14} className="text-[#8B5CF6]" />
        </div>
        
        <div className="absolute top-[40%] left-[35%] w-2 h-2 bg-[#A78BFA] rounded-full shadow-[0_0_8px_#A78BFA] animate-ping" />
        <div className="absolute top-[60%] left-[65%] w-2 h-2 bg-[#8B5CF6] rounded-full shadow-[0_0_8px_#8B5CF6] animate-ping" style={{ animationDelay: '1s' }} />
      </div>
    </div>
  )
}

function HolographicEcosystemVisual() {
  return (
    <div className="w-full h-full relative flex items-center justify-center p-8" style={{ perspective: '1000px' }}>
      <div className="relative w-full max-w-sm aspect-square" style={{ transform: 'rotateX(60deg) rotateZ(45deg)', transformStyle: 'preserve-3d' }}>
        <div className="absolute inset-0 border border-violet-200 rounded-full bg-violet-50/50 shadow-inner" />
        
        <div className="absolute inset-4" style={{ transform: 'translateZ(48px)', transformStyle: 'preserve-3d' }}>
           <div className="w-full h-full border border-[#A78BFA] rounded-full bg-violet-50/50 animate-[spin_20s_linear_infinite] shadow-sm" />
        </div>
        
        <div className="absolute inset-8" style={{ transform: 'translateZ(96px)', transformStyle: 'preserve-3d' }}>
           <div className="w-full h-full border border-[#8B5CF6] rounded-full bg-violet-50/50 animate-[spin_15s_linear_infinite_reverse] shadow-sm" />
        </div>
        
        <div className="absolute top-1/2 left-1/2 w-[2px] h-48 bg-gradient-to-b from-transparent via-[#6D28D9] to-transparent -mt-24 -ml-[1px] animate-[pulse_2s_infinite]" style={{ transform: 'rotateX(-90deg) rotateY(-45deg)' }} />
        
        <div className="absolute top-1/2 left-1/2 -mt-4 -ml-4 w-8 h-8 rounded-full bg-[#6D28D9] shadow-[0_0_30px_rgba(109,40,217,0.6)] blur-[2px]" style={{ transform: 'translateZ(64px)' }} />
      </div>
    </div>
  )
}

function InnovationHubVisual() {
  return (
    <div className="w-full h-full relative flex items-center justify-center p-8">
      <div className="w-full max-w-sm grid grid-cols-2 gap-4">
        <div className="bg-white backdrop-blur-sm border border-slate-200 p-5 rounded-2xl shadow-[0_10px_30px_rgba(109,40,217,0.1)] transform translate-y-4 hover:scale-105 transition-transform duration-300">
          <Users className="text-[#8B5CF6] mb-3" size={24} />
          <div className="h-1.5 w-1/2 bg-slate-200 rounded mb-2"></div>
          <div className="h-1.5 w-3/4 bg-slate-200 rounded"></div>
        </div>
        <div className="bg-white backdrop-blur-sm border border-slate-200 p-5 rounded-2xl shadow-[0_10px_30px_rgba(109,40,217,0.1)] transform -translate-y-4 hover:scale-105 transition-transform duration-300">
          <Target className="text-[#A78BFA] mb-3" size={24} />
          <div className="h-1.5 w-2/3 bg-slate-200 rounded mb-2"></div>
          <div className="h-1.5 w-1/2 bg-slate-200 rounded"></div>
        </div>
        <div className="bg-white backdrop-blur-sm border border-slate-200 p-5 rounded-2xl shadow-[0_10px_30px_rgba(109,40,217,0.1)] transform translate-x-2 hover:scale-105 transition-transform duration-300">
          <Globe2 className="text-[#6D28D9] mb-3" size={24} />
          <div className="h-1.5 w-full bg-slate-200 rounded mb-2"></div>
          <div className="h-1.5 w-1/3 bg-slate-200 rounded"></div>
        </div>
        <div className="bg-white backdrop-blur-sm border border-slate-200 p-5 rounded-2xl shadow-[0_10px_30px_rgba(109,40,217,0.1)] transform -translate-x-2 relative overflow-hidden hover:scale-105 transition-transform duration-300">
          <div className="absolute -right-4 -top-4 w-16 h-16 bg-violet-100 rounded-full blur-xl" />
          <Activity className="text-[#8B5CF6] mb-3 relative z-10" size={24} />
          <div className="h-1.5 w-1/2 bg-slate-200 rounded mb-2 relative z-10"></div>
          <div className="h-1.5 w-2/3 bg-slate-200 rounded relative z-10"></div>
        </div>
      </div>
      
      <div className="absolute top-1/2 left-1/2 -mt-32 -ml-32 w-64 h-64 bg-[#8B5CF6]/10 rounded-full blur-[60px] pointer-events-none" />
    </div>
  )
}

const HERO_SLIDES = [
  { 
    title: "Reimagine Innovation Through ",
    highlight: "Competition",
    desc: "The central operating system for enterprise-grade hackathons. Connect students, innovators, and organizations to solve real-world challenges.",
    windowTitle: "Participant Portal",
    Visual: InnovationHubVisual
  },
  {
    title: "Transform Ideas Into ",
    highlight: "Impact",
    desc: "A unified digital ecosystem bridging hackathons, case studies, and research programs through intelligent pathways.",
    windowTitle: "AI Team Formation",
    Visual: HolographicEcosystemVisual
  },
  {
    title: "Accelerate Learning Through ",
    highlight: "Real Challenges",
    desc: "Partner with industry leaders, research centers, and universities in a robust, globally connected infrastructure.",
    windowTitle: "Landing Page Preview",
    Visual: SmartCityVisual
  },
  {
    title: "Build Solutions That ",
    highlight: "Matter",
    desc: "Track live metrics, manage team collaborations, and showcase projects on transparent, high-performance telemetry dashboards.",
    windowTitle: "Committee Dashboard",
    Visual: CommandCenterVisual
  }
];

// --- 3D Carousel Component ---
function Hero3DCarousel({ currentIndex, setCurrentIndex, screens }) {
  return (
    <div className="relative w-full h-[400px] md:h-[500px] lg:h-[600px] flex items-center justify-center perspective-[1200px] group">
      {screens.map((screen, idx) => {
        let offset = (idx - currentIndex) % screens.length;
        if (offset < 0) offset += screens.length;
        if (offset === 3) offset = -1; // -1, 0, 1, 2
        
        let transform = '';
        let opacity = 0;
        let zIndex = 0;

        if (offset === 0) {
          transform = 'translateX(0) scale(1) translateZ(0)';
          opacity = 1;
          zIndex = 30;
        } else if (offset === 1) {
          transform = 'translateX(40%) scale(0.85) translateZ(-100px) rotateY(-15deg)';
          opacity = 0.6;
          zIndex = 20;
        } else if (offset === -1) {
          transform = 'translateX(-40%) scale(0.85) translateZ(-100px) rotateY(15deg)';
          opacity = 0.6;
          zIndex = 20;
        } else {
          transform = 'translateX(0) scale(0.7) translateZ(-200px)';
          opacity = 0;
          zIndex = 10;
        }

        return (
          <div
            key={idx}
            className="absolute top-10 md:top-20 w-full max-w-2xl h-[300px] md:h-[400px] transition-all duration-700 ease-[cubic-bezier(0.25,0.8,0.25,1)]"
            style={{ transform, opacity, zIndex }}
            onClick={() => setCurrentIndex(idx)}
          >
             <div className="w-full h-full bg-white/80 backdrop-blur-2xl border border-white/60 shadow-[0_30px_60px_rgba(109,40,217,0.15)] rounded-2xl overflow-hidden flex flex-col cursor-pointer ring-1 ring-slate-900/5">
                {/* Window Controls */}
                <div className="h-10 border-b border-slate-200/60 bg-white/50 flex items-center px-4 gap-2">
                  <div className="w-3 h-3 rounded-full bg-rose-400"></div>
                  <div className="w-3 h-3 rounded-full bg-amber-400"></div>
                  <div className="w-3 h-3 rounded-full bg-emerald-400"></div>
                  <div className="mx-auto text-xs font-semibold text-slate-500">{screen.windowTitle}</div>
                </div>
                {/* Content */}
                <div className="flex-1 relative overflow-hidden bg-slate-50/50">
                  <screen.Visual />
                  <div className={`absolute inset-0 transition-colors duration-500 pointer-events-none ${offset === 0 ? 'bg-transparent' : 'bg-slate-100/40'}`}></div>
                </div>
             </div>
          </div>
        )
      })}
      
      {/* Navigation Controls */}
      <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 flex items-center gap-6 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
         <button onClick={() => setCurrentIndex(prev => (prev - 1 + screens.length) % screens.length)} className="w-10 h-10 rounded-full bg-white border border-slate-200 shadow-md flex items-center justify-center text-slate-600 hover:text-[#6D28D9] hover:border-violet-200 transition-colors">
            <ChevronLeft size={20} />
         </button>
         <div className="flex gap-2">
            {screens.map((_, idx) => (
              <div key={idx} className={`w-2 h-2 rounded-full transition-all duration-300 ${idx === currentIndex ? 'bg-[#6D28D9] w-6' : 'bg-slate-300'}`} />
            ))}
         </div>
         <button onClick={() => setCurrentIndex(prev => (prev + 1) % screens.length)} className="w-10 h-10 rounded-full bg-white border border-slate-200 shadow-md flex items-center justify-center text-slate-600 hover:text-[#6D28D9] hover:border-violet-200 transition-colors">
            <ChevronRight size={20} />
         </button>
      </div>
    </div>
  )
}

// --- Sections ---
function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  
  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <nav className={`fixed w-full top-0 z-50 transition-all duration-500 ${scrolled ? 'bg-white/90 backdrop-blur-xl border-b border-slate-200 shadow-sm py-4' : 'bg-white/50 backdrop-blur-md border-b border-slate-200/60 py-5'}`}>
      <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 group">
          <EventOSLogo className="text-[#6D28D9] group-hover:scale-105 transition-transform" size={48} />
        </Link>
        
        <div className="hidden md:flex items-center gap-8 text-sm font-semibold tracking-wide">
          <a href="#about" className="text-slate-600 hover:text-[#6D28D9] transition-colors">About</a>
          <a href="#features" className="text-slate-600 hover:text-[#6D28D9] transition-colors">Features</a>
          
          <div className="h-4 w-px bg-slate-300 mx-2"></div>
          
          <Link to="/participant" className="text-slate-600 hover:text-[#A78BFA] transition-colors">Participant</Link>
          <Link to="/mentor" className="text-slate-600 hover:text-[#8B5CF6] transition-colors">Mentor</Link>
          <Link to="/judge" className="text-slate-600 hover:text-[#6D28D9] transition-colors">Judge</Link>
          <Link to="/admin" className="px-6 py-2.5 bg-[#6D28D9] text-white rounded-xl hover:bg-[#5b21b6] shadow-[0_4px_14px_rgba(109,40,217,0.3)] hover:shadow-[0_6px_20px_rgba(109,40,217,0.4)] hover:-translate-y-0.5 transition-all ml-2">
            Admin Console
          </Link>
        </div>
      </div>
    </nav>
  )
}

function EnterpriseHero() {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % HERO_SLIDES.length);
    }, 1333);
    return () => clearInterval(timer);
  }, []);

  return (
    <section className="relative w-full min-h-screen pt-32 pb-16 px-6 bg-[#F8FAFC] overflow-hidden flex items-center">
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-violet-400/20 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-[#8B5CF6]/20 rounded-full blur-[120px] pointer-events-none" />
      
      <div className="max-w-7xl mx-auto w-full relative z-10 flex flex-col lg:flex-row items-center gap-12">
        <div className="w-full lg:w-[40%] flex flex-col pt-10 lg:pt-0 relative z-20">
          <div className="grid grid-cols-1 grid-rows-1">
            {HERO_SLIDES.map((slide, index) => (
              <div 
                key={index}
                className={`col-start-1 row-start-1 w-full transition-all duration-700 ease-in-out ${index === currentIndex ? 'opacity-100 translate-y-0 pointer-events-auto z-10' : 'opacity-0 translate-y-4 pointer-events-none z-0'}`}
              >
                <h1 className="text-5xl lg:text-6xl font-extrabold text-slate-900 tracking-tight mb-6 leading-[1.1]">
                  {slide.title} <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#6D28D9] to-[#8B5CF6]">{slide.highlight}</span>
                </h1>
                <p className="text-lg text-slate-600 leading-relaxed font-medium mb-10">
                  {slide.desc}
                </p>
              </div>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row gap-4 animate-[fade-in-up_1s_ease-out_0.6s_both]">
            <Link to="/participant" className="flex items-center justify-center gap-2 px-8 py-4 bg-[#6D28D9] text-white text-sm font-semibold hover:bg-[#5b21b6] transition-colors rounded-xl shadow-[0_8px_20px_rgba(109,40,217,0.3)] hover:shadow-[0_8px_25px_rgba(109,40,217,0.4)] hover:-translate-y-0.5 duration-300">
              Explore Competitions <ArrowRight size={16} />
            </Link>
            <a href="#about" className="flex items-center justify-center gap-2 px-8 py-4 bg-white/80 backdrop-blur-md border border-slate-200 text-slate-700 text-sm font-semibold hover:bg-white hover:border-violet-200 transition-all rounded-xl shadow-sm hover:shadow-md hover:-translate-y-0.5 duration-300">
              View Case Studies
            </a>
          </div>

          <div className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-6 pt-8 border-t border-slate-200/60 animate-[fade-in-up_1s_ease-out_0.8s_both]">
            <div>
              <div className="text-2xl font-mono text-[#6D28D9] font-bold mb-1">10k+</div>
              <div className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Participants</div>
            </div>
            <div>
              <div className="text-2xl font-mono text-[#6D28D9] font-bold mb-1">500+</div>
              <div className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Competitions</div>
            </div>
            <div>
              <div className="text-2xl font-mono text-[#6D28D9] font-bold mb-1">100+</div>
              <div className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Organizations</div>
            </div>
            <div>
              <div className="text-2xl font-mono text-[#6D28D9] font-bold mb-1">50+</div>
              <div className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Case Studies</div>
            </div>
          </div>
        </div>

        <div className="w-full lg:w-[60%] relative animate-[fade-in-up_1.5s_ease-out_0.5s_both]">
           <Hero3DCarousel currentIndex={currentIndex} setCurrentIndex={setCurrentIndex} screens={HERO_SLIDES} />
        </div>
      </div>
    </section>
  )
}

function About() {
  const [ref, isVisible] = useScrollReveal();

  return (
    <section id="about" className="py-32 px-6 bg-white relative z-10 overflow-hidden">
      <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-violet-50/50 rounded-full blur-[100px] -translate-y-1/2 translate-x-1/3 pointer-events-none" />
      
      <div ref={ref} className={`max-w-5xl mx-auto relative transition-all duration-1000 ease-out ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-24'}`}>
        <div className="text-center mb-20">
          <h2 className="text-4xl md:text-5xl font-bold text-slate-900 mb-6 tracking-tight">About EventOS</h2>
          <p className="text-xl text-slate-600 font-medium max-w-2xl mx-auto">The complete operating system for modern hackathons.</p>
        </div>
        
        <div className="grid md:grid-cols-2 gap-8 text-slate-600 font-medium leading-relaxed">
          <div className="bg-gradient-to-br from-white to-slate-50/50 backdrop-blur-xl border border-slate-200/60 rounded-3xl p-10 shadow-[0_2px_12px_rgba(0,0,0,0.03)] hover:shadow-[0_20px_40px_rgba(109,40,217,0.15)] hover:-translate-y-2 hover:border-violet-200 transition-all duration-500 relative overflow-hidden group">
            <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-[#6D28D9] to-[#8B5CF6] opacity-30 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="absolute top-0 right-0 w-32 h-32 bg-violet-100 rounded-full blur-[40px] opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <h3 className="text-2xl font-bold text-[#6D28D9] mb-4 relative z-10">What is EventOS?</h3>
            <p className="mb-6 relative z-10 text-lg">
              EventOS is a comprehensive event orchestration engine originally built for the WiSE@TI Hackathon. It is designed to handle the complex logistics of large-scale competitions in a single unified environment.
            </p>
            <p className="relative z-10 text-lg">
              By replacing fragmented tools—like disconnected forms, spreadsheets, and messaging apps—with an integrated platform, EventOS eliminates administrative overhead and allows organizers to focus on the event experience.
            </p>
          </div>
          
          <div className="bg-gradient-to-br from-white to-slate-50/50 backdrop-blur-xl border border-slate-200/60 rounded-3xl p-10 shadow-[0_2px_12px_rgba(0,0,0,0.03)] hover:shadow-[0_20px_40px_rgba(109,40,217,0.15)] hover:-translate-y-2 hover:border-violet-200 transition-all duration-500 relative overflow-hidden group">
            <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-[#6D28D9] to-[#8B5CF6] opacity-30 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="absolute bottom-0 left-0 w-32 h-32 bg-[#8B5CF6]/20 rounded-full blur-[40px] opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <h3 className="text-2xl font-bold text-[#6D28D9] mb-4 relative z-10">Core Philosophy</h3>
            <p className="mb-6 relative z-10 text-lg">
              <strong className="text-slate-900">For Participants:</strong> Remove friction. A unified hub to manage team formation, track milestones, and submit deliverables securely.
            </p>
            <p className="mb-6 relative z-10 text-lg">
              <strong className="text-slate-900">For Mentors & Judges:</strong> Provide clarity. Structured evaluation pipelines, clear team assignments, and centralized communication.
            </p>
            <p className="relative z-10 text-lg">
              <strong className="text-slate-900">For Committees:</strong> Maintain control. Real-time telemetry, automated anomaly detection, and comprehensive control over the entire event lifecycle.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

function FeatureCard({ f, index }) {
  const [ref, isVisible] = useScrollReveal();
  
  const color = 'from-[#6D28D9] to-[#8B5CF6]';
  
  return (
    <div 
      ref={ref}
      style={{ transitionDelay: `${index * 50}ms` }}
      className={`group relative block p-8 rounded-3xl border border-slate-200 bg-white shadow-sm hover:shadow-[0_20px_40px_rgba(109,40,217,0.15)] hover:-translate-y-2 transition-all duration-500 overflow-hidden text-left ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-16'}`}
    >
      <div className={`absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r ${color} opacity-80 group-hover:opacity-100 transition-opacity`} />
      <div className="absolute bottom-0 right-0 w-32 h-32 bg-slate-50 rounded-full blur-[40px] group-hover:bg-violet-50 transition-colors duration-500 -z-10" />
      
      <div className="w-14 h-14 rounded-xl bg-violet-50/80 border border-violet-100 flex items-center justify-center mb-6 group-hover:bg-[#6D28D9] group-hover:border-[#6D28D9] group-hover:scale-110 group-hover:-rotate-6 transition-all duration-500 shadow-sm relative z-10">
        <div className="text-[#6D28D9] group-hover:text-white transition-colors duration-500">
          {f.icon}
        </div>
      </div>
      
      <h3 className="text-xl font-bold mb-3 text-slate-900 group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-[#6D28D9] group-hover:to-[#8B5CF6] transition-all relative z-10">{f.title}</h3>
      <p className="text-base text-slate-500 font-medium group-hover:text-slate-600 transition-colors leading-relaxed relative z-10">{f.description}</p>
    </div>
  )
}

function Features() {
  const features = [
    { icon: <Users size={24} />, title: "Algorithmic Team Formation", description: "AI-powered heuristics that automatically form balanced teams based on multidimensional skill vectors." },
    { icon: <ShieldCheck size={24} />, title: "Anomaly Detection", description: "Real-time monitoring of evaluation streams to automatically flag suspicious statistical variances." },
    { icon: <Activity size={24} />, title: "Evaluation Telemetry", description: "Streamlined rubrics and real-time scoring interfaces for transparent project assessment." },
    { icon: <Target size={24} />, title: "Mentor Logistics", description: "Enterprise tools for mentors to track team velocity, schedule syncs, and submit structured feedback." },
    { icon: <Users size={24} />, title: "Participant Hub", description: "A centralized dashboard for participants to manage repositories, submit deliverables, and track milestones." },
    { icon: <LayoutDashboard size={24} />, title: "Command Center", description: "A comprehensive administrative console to govern the entire event lifecycle and monitor infrastructure." },
    { icon: <Star size={24} />, title: "Real-Time Leaderboards", description: "Dynamic ranking systems that update instantly as evaluation streams are processed." },
    { icon: <FileText size={24} />, title: "Resource Management", description: "Centralized repository for distributing guidelines, templates, and datasets to participants securely." },
    { icon: <Network size={24} />, title: "Cross-Platform Integration", description: "Seamlessly connect with existing enterprise tools through our robust webhook and API architecture." }
  ];

  return (
    <section id="features" className="py-32 px-6 bg-[#F8FAFC] relative z-10">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-20">
          <h2 className="text-4xl md:text-5xl font-bold text-slate-900 mb-6 tracking-tight">Platform Features</h2>
          <p className="text-slate-600 max-w-2xl mx-auto text-xl font-medium">Enterprise-grade tooling designed for massive scale.</p>
        </div>
        
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((f, i) => <FeatureCard key={i} f={f} index={i} />)}
        </div>
      </div>
    </section>
  )
}

function Portals() {
  const [ref, isVisible] = useScrollReveal();
  const portals = [
    { title: 'Participant Portal', path: '/participant', desc: 'Join teams and submit deliverables', color: 'from-[#6D28D9] to-[#8B5CF6]' },
    { title: 'Mentor Portal', path: '/mentor', desc: 'Guide teams to success', color: 'from-[#6D28D9] to-[#8B5CF6]' },
    { title: 'Judge Portal', path: '/judge', desc: 'Evaluate project submissions', color: 'from-[#6D28D9] to-[#8B5CF6]' },
    { title: 'Admin Console', path: '/admin', desc: 'Manage event operations', color: 'from-[#6D28D9] to-[#8B5CF6]' },
  ];
  
  return (
    <section id="portals" className="py-32 px-6 bg-white relative z-10 border-t border-slate-100">
      <div className="max-w-7xl mx-auto text-center">
        <h2 className="text-4xl md:text-5xl font-bold text-slate-900 mb-6 tracking-tight">Access Infrastructure</h2>
        <p className="text-slate-600 max-w-2xl mx-auto text-xl font-medium mb-16">Authenticate to your provisioned workspace based on your clearance level.</p>
        
        <div ref={ref} className={`grid md:grid-cols-2 lg:grid-cols-4 gap-6 transition-all duration-1000 ease-out ${isVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}>
          {portals.map((p, i) => (
            <Link key={i} to={p.path} className="group relative block p-8 rounded-3xl border border-slate-200 bg-white shadow-sm hover:shadow-[0_20px_40px_rgba(109,40,217,0.15)] hover:-translate-y-2 transition-all duration-500 overflow-hidden text-left">
              <div className={`absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r ${p.color} opacity-80 group-hover:opacity-100 transition-opacity`} />
              <div className="absolute bottom-0 right-0 w-32 h-32 bg-slate-50 rounded-full blur-[40px] group-hover:bg-violet-50 transition-colors duration-500 -z-10" />
              
              <h3 className="text-xl font-bold mb-3 text-slate-900 group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-[#6D28D9] group-hover:to-[#8B5CF6] transition-all">{p.title}</h3>
              <p className="text-base text-slate-500 font-medium group-hover:text-slate-600 transition-colors">{p.desc}</p>
              
              <div className="mt-8 flex justify-end opacity-0 group-hover:opacity-100 transition-all duration-300 translate-x-4 group-hover:translate-x-0">
                 <div className="w-8 h-8 rounded-full bg-violet-100 flex items-center justify-center text-[#6D28D9]">
                    <ArrowRight size={16} />
                 </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-[#F8FAFC] py-16 px-6 relative z-10">
      <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-8">
        <div className="flex items-center gap-2 group cursor-pointer">
          <EventOSLogo className="text-[#6D28D9] group-hover:scale-105 transition-transform duration-300" size={40} />
        </div>
        
        <p className="text-base text-slate-500 font-medium">
          © {new Date().getFullYear()} EventOS Infrastructure. All rights reserved.
        </p>
        
        <div className="flex items-center gap-8 text-base text-slate-500 font-medium">
          <a href="#" className="hover:text-[#6D28D9] transition-colors">Privacy Policy</a>
          <a href="#" className="hover:text-[#6D28D9] transition-colors">Terms of Service</a>
          <a href="#" className="hover:text-[#6D28D9] transition-colors">System Status</a>
        </div>
      </div>
    </footer>
  )
}

export default function LandingPage() {
  useEffect(() => {
    // Add smooth scrolling for anchor links
    document.documentElement.style.scrollBehavior = 'smooth';
    return () => {
      document.documentElement.style.scrollBehavior = 'auto';
    };
  }, []);

  return (
    <div className="min-h-screen bg-white text-slate-600 selection:bg-[#A78BFA] selection:text-white font-sans">
      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }
        @keyframes fade-in-up {
          0% { opacity: 0; transform: translateY(30px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        .animate-float {
          animation: float 4s ease-in-out infinite;
        }
      `}</style>
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

