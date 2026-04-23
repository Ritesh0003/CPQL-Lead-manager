/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { AuthProvider, useAuth } from './AuthContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';
import { auth } from './firebase';
import { 
  LayoutDashboard, 
  Users, 
  Briefcase, 
  FileText, 
  LogOut, 
  PlusCircle,
  BarChart3,
  ChevronRight,
  Search,
  Filter,
  MessageSquare,
  Menu,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// Components
import Dashboard from './components/Dashboard';
import UserManagement from './components/UserManagement';
import ProjectManagement from './components/ProjectManagement';
import LeadManagement from './components/LeadManagement';
import Reports from './components/Reports';
import Settings from './components/Settings';
import VendorList from './components/VendorList';

function Login() {
  const handleLogin = () => {
    const provider = new GoogleAuthProvider();
    signInWithPopup(auth, provider);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute top-0 left-0 w-full h-full opacity-20">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-500 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-500 rounded-full blur-[120px]" />
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full glass-card rounded-2xl p-10 z-10 text-center"
      >
        <div className="w-20 h-20 bg-gray-900 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-2xl">
          <Briefcase className="text-white w-10 h-10" />
        </div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">CPQL Lead Manager</h1>
        <p className="text-gray-600 mb-8">Secure partner portal for lead tracking and project management.</p>
        
        <button
          onClick={handleLogin}
          className="w-full flex items-center justify-center gap-3 bg-gray-900 text-white font-semibold py-4 px-6 rounded-xl hover:bg-gray-800 transition-all shadow-lg hover:shadow-xl active:scale-[0.98]"
        >
          <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-6 h-6" alt="Google" />
          Sign in with Google
        </button>
      </motion.div>
    </div>
  );
}

function MainLayout() {
  const { profile, isAdmin, isSM, isPartner, isVendor } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true);

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, show: true },
    { id: 'leads', label: 'Leads', icon: FileText, show: true },
    { id: 'projects', label: 'Projects', icon: Briefcase, show: true },
    { id: 'vendors', label: 'Vendors', icon: Users, show: isAdmin || isSM },
    { id: 'users', label: 'Users', icon: Users, show: isAdmin },
    { id: 'reports', label: 'Reports', icon: BarChart3, show: isAdmin || isSM },
    { id: 'settings', label: 'Settings', icon: PlusCircle, show: isAdmin },
  ];

  const handleLogout = () => signOut(auth);

  const closeMobileMenu = () => setIsMobileMenuOpen(false);

  return (
    <div className="min-h-screen flex bg-gray-50">
      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 left-0 w-full bg-white/80 backdrop-blur-md border-b border-gray-100 z-30 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-gray-900 rounded-lg flex items-center justify-center">
            <Briefcase className="text-white w-4 h-4" />
          </div>
          <span className="font-bold text-lg tracking-tight">CPQL</span>
        </div>
        <div className="w-8 h-8 bg-gradient-to-br from-gray-800 to-gray-900 rounded-full flex items-center justify-center shadow-sm">
          <span className="font-bold text-white text-xs">{profile?.displayName?.charAt(0)}</span>
        </div>
      </div>

      {/* Desktop Sidebar */}
      <aside 
        className={`
          hidden md:flex sticky top-0 left-0 h-screen bg-white border-r border-gray-100 flex-col z-40 transition-all duration-300 ease-in-out
          ${isSidebarCollapsed ? 'w-20' : 'w-64'}
        `}
        onMouseEnter={() => setIsSidebarCollapsed(false)}
        onMouseLeave={() => setIsSidebarCollapsed(true)}
      >
        <div className="p-6 border-b border-gray-50 bg-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gray-900 rounded-xl flex items-center justify-center shadow-sm shrink-0">
              <Briefcase className="text-white w-5 h-5" />
            </div>
            <span className={`font-black text-xl tracking-tighter transition-opacity duration-300 ${isSidebarCollapsed ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100'}`}>CPQL</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 pt-6 scrollbar-hide">
          <nav className="space-y-2">
            {navItems.filter(item => item.show).map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-semibold transition-all ${
                  activeTab === item.id 
                    ? 'bg-gray-900 text-white shadow-md' 
                    : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
                } ${isSidebarCollapsed ? 'justify-center px-0' : ''}`}
                title={isSidebarCollapsed ? item.label : undefined}
              >
                <item.icon className="w-5 h-5 shrink-0" />
                <span className={`transition-opacity duration-300 whitespace-nowrap ${isSidebarCollapsed ? 'opacity-0 w-0 overflow-hidden block' : 'opacity-100'}`}>
                  {item.label}
                </span>
              </button>
            ))}
          </nav>
        </div>

        <div className="p-4 border-t border-gray-50 bg-white">
          <div className={`flex items-center gap-3 mb-4 ${isSidebarCollapsed ? 'justify-center' : 'px-2'}`}>
            <div className="w-10 h-10 bg-gradient-to-br from-gray-800 to-gray-900 rounded-full flex items-center justify-center overflow-hidden shadow-sm shrink-0">
              <span className="font-bold text-white shadow-sm">{profile?.displayName?.charAt(0)}</span>
            </div>
            <div className={`flex-1 min-w-0 transition-opacity duration-300 ${isSidebarCollapsed ? 'opacity-0 w-0 overflow-hidden block' : 'opacity-100'}`}>
              <p className="text-sm font-bold text-gray-900 truncate">{profile?.displayName}</p>
              <p className="text-[10px] text-gray-400 uppercase tracking-widest font-black">{profile?.role?.replace(/_/g, ' ')}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-bold text-red-600 bg-red-50 hover:bg-red-100 transition-all ${isSidebarCollapsed ? 'px-0' : ''}`}
            title={isSidebarCollapsed ? "Logout" : undefined}
          >
            <LogOut className="w-4 h-4 shrink-0" />
            <span className={`transition-opacity duration-300 ${isSidebarCollapsed ? 'opacity-0 w-0 overflow-hidden block' : 'opacity-100'}`}>
              Logout
            </span>
          </button>
        </div>
      </aside>

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 w-full bg-white/90 backdrop-blur-md border-t border-gray-100 z-40 pb-safe">
        <div className="flex items-center justify-around p-2">
          {navItems.filter(item => item.show).slice(0, 5).map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`flex flex-col items-center justify-center w-16 h-14 rounded-2xl transition-all ${
                activeTab === item.id 
                  ? 'text-gray-900' 
                  : 'text-gray-400 hover:bg-gray-50'
              }`}
            >
              <div className={`p-1.5 rounded-xl mb-1 ${activeTab === item.id ? 'bg-gray-100' : ''}`}>
                <item.icon className="w-5 h-5 shrink-0" />
              </div>
              <span className="text-[9px] font-bold tracking-wide">{item.label}</span>
            </button>
          ))}
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 w-full min-w-0 pt-16 pb-24 md:pt-0 md:pb-0 relative overflow-x-hidden">
        <div className="px-2 py-4 md:p-8 max-w-[1600px] mx-auto min-h-screen">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              {activeTab === 'dashboard' && <Dashboard />}
              {activeTab === 'users' && <UserManagement />}
              {activeTab === 'vendors' && <VendorList />}
              {activeTab === 'projects' && <ProjectManagement />}
              {activeTab === 'leads' && <LeadManagement />}
              {activeTab === 'reports' && <Reports />}
              {activeTab === 'settings' && <Settings />}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}

function AppContent() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-12 h-12 border-4 border-gray-900 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return user ? <MainLayout /> : <Login />;
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ErrorBoundary>
  );
}

