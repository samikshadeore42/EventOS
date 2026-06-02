import React from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Calendar, Users, Trophy, Shield, Zap, Sparkles, CheckSquare, Target, User, LayoutDashboard, Lock, Star, Clock, Heart } from 'lucide-react'

function Navbar() {
  return (
    <nav className="border-b border-slate-200/80 bg-white/80 backdrop-blur-md sticky top-0 z-50 shadow-sm">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="text-indigo-600" size={24} />
          <span className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-teal-600">
            EventOS
          </span>
        </div>
        
        <div className="hidden md:flex items-center gap-6 text-sm font-medium">
          <a href="#about" className="text-slate-600 hover:text-indigo-600 transition-colors">About</a>
          <a href="#features" className="text-slate-600 hover:text-indigo-600 transition-colors">Features</a>
          
          <div className="h-4 w-px bg-slate-200 mx-2"></div>
          
          <Link to="/participant" className="text-slate-600 hover:text-indigo-600 transition-colors">Participant</Link>
          <Link to="/mentor" className="text-slate-600 hover:text-teal-600 transition-colors">Mentor</Link>
          <Link to="/judge" className="text-slate-600 hover:text-amber-600 transition-colors">Judge</Link>
          <Link to="/admin" className="px-4 py-2 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg hover:bg-indigo-100 hover:border-indigo-300 transition-all font-semibold">
            Admin Portal
          </Link>
        </div>
      </div>
    </nav>
  )
}

function Hero() {
  return (
    <section className="relative overflow-hidden pt-32 pb-20 px-6">
      {/* Background Glows */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-indigo-100/50 rounded-full blur-[120px] pointer-events-none"></div>
      
      <div className="max-w-4xl mx-auto text-center relative z-10">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-teal-50 border border-teal-200 text-teal-700 text-xs font-bold mb-8 animate-fade-in-up shadow-sm">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-teal-500"></span>
          </span>
          System Online
        </div>
        
        <h1 className="text-5xl md:text-7xl font-extrabold text-slate-900 tracking-tight mb-8">
          Intelligent <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 via-purple-600 to-teal-600">Event Orchestration</span>
        </h1>
        
        <p className="text-lg md:text-xl text-slate-600 mb-10 max-w-2xl mx-auto leading-relaxed font-medium">
          The all-in-one platform for managing hackathons. EventOS streamlines every aspect of your event lifecycle, from registration to final awards.
        </p>
        
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link to="/participant" className="flex items-center gap-2 px-8 py-3.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold hover:shadow-lg hover:shadow-indigo-500/25 transition-all w-full sm:w-auto justify-center">
            Apply Now <ArrowRight size={18} />
          </Link>
          <a href="#about" className="flex items-center gap-2 px-8 py-3.5 rounded-xl bg-white border border-slate-200 text-slate-700 shadow-sm font-semibold hover:bg-slate-50 transition-all w-full sm:w-auto justify-center">
            Learn More
          </a>
        </div>
      </div>
    </section>
  )
}

function About() {
  return (
    <section id="about" className="py-24 px-6 bg-white relative z-10 border-t border-slate-200">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-slate-900 mb-4">About EventOS</h2>
          <p className="text-lg text-slate-600 font-medium">The complete operating system for modern hackathons.</p>
        </div>
        
        <div className="grid md:grid-cols-2 gap-8 text-slate-600 font-medium leading-relaxed">
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-8 shadow-sm">
            <h3 className="text-xl font-bold text-indigo-700 mb-3">What is EventOS?</h3>
            <p className="mb-6">
              EventOS is a comprehensive event orchestration engine originally built for the WiSE@TI Hackathon. It is designed to handle the complex logistics of large-scale competitions in a single unified environment.
            </p>
            
            <h3 className="text-xl font-bold text-indigo-700 mb-3">Why was it built?</h3>
            <p>
              Organizing hackathons traditionally involves juggling multiple disconnected tools for registration, team formation, and judging. EventOS was built to unite these processes into a single, cohesive platform to reduce friction and eliminate data silos.
            </p>
          </div>
          
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-8 shadow-sm">
            <h3 className="text-xl font-bold text-indigo-700 mb-3">What problem does it solve?</h3>
            <p className="mb-6">
              It eliminates manual administrative overhead. By automating team assignments, detecting judging anomalies, and facilitating automated communication, it allows organizers to focus strictly on the event experience rather than logistics.
            </p>
            
            <h3 className="text-xl font-bold text-indigo-700 mb-3">Who uses it?</h3>
            <p className="mb-6">
              The platform bridges the gap between participants, mentors, judges, and committee administrators, providing tailored digital experiences and secure portals for each specific role.
            </p>
            
            <h3 className="text-xl font-bold text-indigo-700 mb-3">Our Vision</h3>
            <p>
              To empower organizations to host fair, efficient, and engaging events through intelligent automation and seamless user experiences.
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
      icon: <Users className="text-indigo-600" size={24} />,
      title: "Team Formation Engine",
      description: "AI-powered algorithms that automatically form balanced teams based on skill vectors."
    },
    {
      icon: <Shield className="text-teal-600" size={24} />,
      title: "AI-Powered Anomaly Detection",
      description: "Real-time monitoring of judge evaluations to flag suspicious scoring patterns automatically."
    },
    {
      icon: <CheckSquare className="text-blue-600" size={24} />,
      title: "Judge Evaluation System",
      description: "Streamlined rubrics and scoring interfaces for fair and efficient project assessment."
    },
    {
      icon: <Target className="text-rose-600" size={24} />,
      title: "Mentor Management",
      description: "Tools for mentors to track team progress, schedule meetings, and submit feedback."
    },
    {
      icon: <User className="text-amber-600" size={24} />,
      title: "Participant Portal",
      description: "A unified dashboard for participants to view their team, submit projects, and track milestones."
    },
    {
      icon: <LayoutDashboard className="text-purple-600" size={24} />,
      title: "Admin Dashboard",
      description: "A comprehensive command center for organizers to manage the entire event lifecycle."
    },
    {
      icon: <Trophy className="text-yellow-500" size={24} />,
      title: "Leaderboard Management",
      description: "Dynamic calculation of team scores with variance analysis and instant progression tracking."
    },
    {
      icon: <Zap className="text-orange-500" size={24} />,
      title: "Automated Workflows",
      description: "Generative AI creates tailored emails for milestone updates and participant outreach."
    },
    {
      icon: <Lock className="text-emerald-600" size={24} />,
      title: "Authentication & Role-Based Access",
      description: "Secure login and authorization ensuring proper access for all user types."
    }
  ]

  return (
    <section id="features" className="py-24 px-6 bg-slate-50 relative z-10 border-t border-slate-200">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold text-slate-900 mb-4">Platform Capabilities</h2>
          <p className="text-slate-600 max-w-2xl mx-auto text-lg font-medium">Everything you need to run a successful hackathon from start to finish.</p>
        </div>
        
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((f, i) => (
            <div key={i} className="bg-white border border-slate-200 shadow-sm p-6 rounded-2xl hover:shadow-md hover:border-indigo-200 transition-all duration-300 group">
              <div className="w-12 h-12 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center mb-6 group-hover:scale-110 group-hover:bg-indigo-50 transition-all duration-300">
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
    { title: 'Participant Portal', path: '/participant', desc: 'Join teams and submit your work', colorClass: 'text-indigo-700 group-hover:text-indigo-600', hoverBorder: 'hover:border-indigo-300' },
    { title: 'Mentor Portal', path: '/mentor', desc: 'Guide teams to success', colorClass: 'text-teal-700 group-hover:text-teal-600', hoverBorder: 'hover:border-teal-300' },
    { title: 'Judge Portal', path: '/judge', desc: 'Evaluate project submissions', colorClass: 'text-amber-700 group-hover:text-amber-600', hoverBorder: 'hover:border-amber-300' },
    { title: 'Admin Dashboard', path: '/admin', desc: 'Manage the entire event', colorClass: 'text-purple-700 group-hover:text-purple-600', hoverBorder: 'hover:border-purple-300' },
  ]
  
  return (
    <section id="portals" className="py-24 px-6 bg-white relative z-10 border-t border-slate-200">
      <div className="max-w-7xl mx-auto text-center">
        <h2 className="text-3xl font-bold text-slate-900 mb-4">Access Your Portal</h2>
        <p className="text-slate-600 max-w-2xl mx-auto text-lg font-medium mb-12">Login to your dedicated workspace based on your role.</p>
        
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
          {portals.map((p, i) => (
            <Link key={i} to={p.path} className={`block p-6 rounded-2xl border border-slate-200 hover:shadow-md transition-all text-left group bg-slate-50 hover:bg-white ${p.hoverBorder}`}>
              <h3 className={`text-lg font-bold mb-1 transition-colors ${p.colorClass}`}>{p.title}</h3>
              <p className="text-sm text-slate-600 font-medium">{p.desc}</p>
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}

function Benefits() {
  return (
    <section id="benefits" className="py-24 px-6 bg-slate-50 relative z-10 border-t border-slate-200">
      <div className="max-w-5xl mx-auto text-center">
        <h2 className="text-3xl font-bold text-slate-900 mb-12">Why Choose EventOS?</h2>
        <div className="grid md:grid-cols-3 gap-8">
          <div>
            <div className="w-12 h-12 mx-auto rounded-full bg-indigo-100 flex items-center justify-center mb-4 text-indigo-600">
              <Clock size={24} />
            </div>
            <h3 className="text-lg font-bold text-slate-900 mb-2">Save Hundreds of Hours</h3>
            <p className="text-sm text-slate-600 font-medium">Automate tedious tasks like team matching and communication, freeing your organizers to focus on impact.</p>
          </div>
          <div>
            <div className="w-12 h-12 mx-auto rounded-full bg-teal-100 flex items-center justify-center mb-4 text-teal-600">
              <Star size={24} />
            </div>
            <h3 className="text-lg font-bold text-slate-900 mb-2">Ensure Fair Outcomes</h3>
            <p className="text-sm text-slate-600 font-medium">Our anomaly detection and balanced team generation guarantee a level playing field for all participants.</p>
          </div>
          <div>
            <div className="w-12 h-12 mx-auto rounded-full bg-amber-100 flex items-center justify-center mb-4 text-amber-600">
              <Heart size={24} />
            </div>
            <h3 className="text-lg font-bold text-slate-900 mb-2">Better Experience</h3>
            <p className="text-sm text-slate-600 font-medium">Dedicated, intuitive portals make it easy for participants, mentors, and judges to engage effortlessly.</p>
          </div>
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
          <Sparkles className="text-indigo-600" size={20} />
          <span className="text-lg font-bold text-slate-800">EventOS</span>
        </div>
        
        <p className="text-sm text-slate-500 font-medium">
          © {new Date().getFullYear()} EventOS Platform. All rights reserved.
        </p>
        
        <div className="flex items-center gap-6 text-sm text-slate-500 font-medium">
          <a href="#" className="hover:text-indigo-600 transition-colors">Privacy</a>
          <a href="#" className="hover:text-indigo-600 transition-colors">Terms</a>
          <a href="#" className="hover:text-indigo-600 transition-colors">Support</a>
        </div>
      </div>
    </footer>
  )
}

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-700 selection:bg-indigo-100">
      <Navbar />
      <main>
        <Hero />
        <About />
        <Features />
        <Portals />
        <Benefits />
      </main>
      <Footer />
    </div>
  )
}
