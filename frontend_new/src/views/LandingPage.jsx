import React from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Calendar, Users, Trophy, Shield, Zap, Sparkles } from 'lucide-react'

function Navbar() {
  return (
    <nav className="border-b border-slate-700/50 bg-slate-900/50 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="text-indigo-400" size={24} />
          <span className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-teal-400">
            EventOS
          </span>
        </div>
        
        <div className="hidden md:flex items-center gap-6 text-sm font-medium">
          <a href="#about" className="text-slate-300 hover:text-white transition-colors">About</a>
          <a href="#features" className="text-slate-300 hover:text-white transition-colors">Features</a>
          
          <div className="h-4 w-px bg-slate-700/50 mx-2"></div>
          
          <Link to="/participant" className="text-slate-300 hover:text-indigo-400 transition-colors">Participant</Link>
          <Link to="/mentor" className="text-slate-300 hover:text-teal-400 transition-colors">Mentor</Link>
          <Link to="/judge" className="text-slate-300 hover:text-amber-400 transition-colors">Judge</Link>
          <Link to="/admin" className="px-4 py-2 bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 rounded-lg hover:bg-indigo-600/30 hover:border-indigo-400/50 transition-all">
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
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-indigo-900/20 rounded-full blur-[120px] pointer-events-none"></div>
      
      <div className="max-w-4xl mx-auto text-center relative z-10">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-teal-900/30 border border-teal-500/30 text-teal-300 text-xs font-semibold mb-8 animate-fade-in-up">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-teal-500"></span>
          </span>
          System Online
        </div>
        
        <h1 className="text-5xl md:text-7xl font-extrabold text-white tracking-tight mb-8">
          Intelligent <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-purple-400 to-teal-400">Event Orchestration</span>
        </h1>
        
        <p className="text-lg md:text-xl text-slate-400 mb-10 max-w-2xl mx-auto leading-relaxed">
          The all-in-one platform for managing hackathons. AI-driven team formation, anomaly detection, and automated workflows from application to evaluation.
        </p>
        
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link to="/participant" className="flex items-center gap-2 px-8 py-3.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold hover:shadow-lg hover:shadow-indigo-500/25 transition-all w-full sm:w-auto justify-center">
            Apply Now <ArrowRight size={18} />
          </Link>
          <Link to="/admin" className="flex items-center gap-2 px-8 py-3.5 rounded-xl bg-slate-800 border border-slate-700 text-white font-semibold hover:bg-slate-700 transition-all w-full sm:w-auto justify-center">
            View Dashboard
          </Link>
        </div>
      </div>
    </section>
  )
}

function Features() {
  const features = [
    {
      icon: <Users className="text-indigo-400" size={24} />,
      title: "Smart Team Formation",
      description: "AI-powered algorithms that automatically form balanced teams based on skill vectors and constraints."
    },
    {
      icon: <Shield className="text-teal-400" size={24} />,
      title: "Anomaly Detection",
      description: "Real-time monitoring of judge evaluations to flag suspicious scoring patterns automatically."
    },
    {
      icon: <Trophy className="text-amber-400" size={24} />,
      title: "Live Leaderboards",
      description: "Dynamic calculation of team scores with variance analysis and instant progression tracking."
    },
    {
      icon: <Zap className="text-purple-400" size={24} />,
      title: "Automated Comms",
      description: "Generative AI creates tailored emails for milestone updates and participant outreach."
    }
  ]

  return (
    <section id="features" className="py-24 px-6 relative z-10">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold text-white mb-4">Enterprise-Grade Architecture</h2>
          <p className="text-slate-400 max-w-2xl mx-auto">EventOS handles the complex logistics so your committee can focus on the experience.</p>
        </div>
        
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((f, i) => (
            <div key={i} className="bg-slate-800/40 border border-slate-700/50 p-6 rounded-2xl hover:bg-slate-800/60 transition-colors group">
              <div className="w-12 h-12 rounded-lg bg-slate-900/50 border border-slate-700/50 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                {f.icon}
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">{f.title}</h3>
              <p className="text-sm text-slate-400 leading-relaxed">{f.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function About() {
  return (
    <section id="about" className="py-24 px-6 bg-slate-900/30 border-t border-slate-800/50 relative z-10">
      <div className="max-w-5xl mx-auto text-center">
        <h2 className="text-3xl font-bold text-white mb-6">About EventOS</h2>
        <p className="text-lg text-slate-400 leading-relaxed max-w-3xl mx-auto">
          Built for the WiSE@TI Hackathon, EventOS is a highly scalable orchestration engine. 
          By bridging the gap between participants, mentors, judges, and admins, the platform ensures 
          a seamless workflow. With state-of-the-art anomaly scanners and robust portal management, 
          managing large-scale events has never been easier.
        </p>
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer className="border-t border-slate-800 bg-slate-950 py-12 px-6 relative z-10">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-2">
          <Sparkles className="text-indigo-400" size={20} />
          <span className="text-lg font-bold text-slate-300">EventOS</span>
        </div>
        
        <p className="text-sm text-slate-500">
          © {new Date().getFullYear()} EventOS Platform. All rights reserved.
        </p>
        
        <div className="flex items-center gap-6 text-sm text-slate-400">
          <a href="#" className="hover:text-white transition-colors">Privacy</a>
          <a href="#" className="hover:text-white transition-colors">Terms</a>
          <a href="#" className="hover:text-white transition-colors">Support</a>
        </div>
      </div>
    </footer>
  )
}

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-300 selection:bg-indigo-500/30">
      <Navbar />
      <main>
        <Hero />
        <Features />
        <About />
      </main>
      <Footer />
    </div>
  )
}
