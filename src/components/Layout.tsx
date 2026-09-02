import React, { useState } from 'react';
import { 
  LayoutDashboard, 
  Users, 
  CreditCard, 
  PieChart, 
  FileText,
  LogOut,
  Menu,
  X,
  History,
  Shield,
  Clock,
  Calendar,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ArrowRight,
  CircleDot,
  HelpCircle,
  Expand,
  KeyRound,
  Power,
  Home,
  BookOpen,
  User
} from 'lucide-react';
import { useAuth } from './AuthProvider';
import { Button } from './ui/button';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'motion/react';

interface LayoutProps {
  children: React.ReactNode;
  onNavigate: (page: string) => void;
  currentPage: string;
}

const Layout: React.FC<LayoutProps> = ({ children, onNavigate, currentPage }) => {
  const { user, role, logout } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('sidebar_collapsed') === 'true';
    }
    return false;
  });

  const [openAccordions, setOpenAccordions] = useState<Record<string, boolean>>({
    'DTR': false
  });

  const toggleAccordion = (name: string) => {
    setOpenAccordions(prev => ({
      ...prev,
      [name]: !prev[name]
    }));
  };

  const handleAccordionClick = (itemName: string) => {
    if (isCollapsed) {
      setIsCollapsed(false);
      setOpenAccordions(prev => ({ ...prev, [itemName]: true }));
    } else {
      toggleAccordion(itemName);
    }
  };

  const toggleSidebar = () => {
    setIsCollapsed((prev) => {
      const nextState = !prev;
      localStorage.setItem('sidebar_collapsed', String(nextState));
      return nextState;
    });
  };

  const handleToggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((err) => {
        console.error("Error making page fullscreen", err);
      });
    } else {
      document.exitFullscreen().catch((err) => {
        console.error("Error exiting fullscreen", err);
      });
    }
  };

  const getDisplayName = () => {
    if (!user?.email) return 'User Account';
    if (user.email.toLowerCase().includes('caturanchristian')) {
      return 'Christian Caturan';
    }
    const parts = user.email.toLowerCase().split('@')[0].split(/[._-]/);
    return parts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
  };

  const getDisplayId = () => {
    if (user?.email?.toLowerCase().includes('caturanchristian')) {
      return '2310029-1';
    }
    return role ? `${role.replace('_', ' ').toUpperCase()}` : 'USER-2026';
  };

  const getPageTitle = (page: string) => {
    switch (page) {
      case 'dashboard': 
        if (role === 'employee') return 'My Profile';
        if (role === 'department_head') return 'Department Dashboard';
        return 'System Dashboard';
      case 'employees': return 'Employees Registry';
      case 'schedules': 
        if (role === 'department_head') return 'Faculty Schedules';
        return 'My Profile';
      case 'payroll': return 'Payroll Hub';
      case 'account': return 'My Account';
      case 'deductions': return 'Deductions';
      case 'dtr-regular': return 'DTR Regular';
      case 'dtr-visiting': return 'DTR Visiting';
      case 'dtr-job-order': return 'DTR Job-Order';
      case 'dtr': return 'DTR Service';
      case 'history': return 'Activity Records';
      case 'reports': return 'Financial Analysis';
      case 'audit': return 'Compliance Audit';
      case 'users': return 'Security Center';
      case 'holidays': return 'Holidays Registry';
      case 'profile': return 'My Profile';
      case 'docs': return 'Knowledge Base';
      case 'departments': return 'Departments & Subjects';
      default: return 'Payroll Management System';
    }
  };

  const getPageSublabel = (page: string) => {
    switch (page) {
      case 'dashboard': 
        if (role === 'department_head') return 'Department Overview & Analytics';
        return 'System Dashboard';
      case 'employees': return 'Staff Registry';
      case 'schedules': 
        if (role === 'department_head') return 'Faculty Schedules & Load';
        return 'My Schedules';
      case 'payroll': return 'Payroll Generation';
      case 'account': return 'Account Information';
      case 'deductions': 
        if (role === 'employee') return 'My Deductions';
        return 'Employee Deductions';
      case 'dtr-regular': return 'Regular DTR Logs';
      case 'dtr-visiting': return 'Visiting Faculty Logs';
      case 'dtr-job-order': return 'Job-Order Logs';
      case 'dtr': return 'Sandbox Logs';
      case 'history': return 'Archived Items';
      case 'reports': return 'Revenue & Expense';
      case 'audit': return 'Audit Trails';
      case 'users': return 'Administrator Control';
      case 'holidays': return 'Public Holidays';
      case 'profile': return 'Information';
      case 'docs': return 'Product Manuals';
      case 'departments': return 'Academic Management';
      default: return 'Active Page';
    }
  };

  const categories = [
    {
      title: "MY",
      items: [
        { name: 'Home', id: 'dashboard', icon: Home, roles: ['admin', 'payroll_officer', 'employee', 'accountant'] },
        { name: 'Dashboard', id: 'dashboard', icon: LayoutDashboard, roles: ['admin', 'payroll_officer', 'accountant', 'department_head'] },
        { name: 'Information', id: 'profile', icon: Users, roles: ['admin', 'payroll_officer', 'employee', 'accountant', 'department_head'] },
        { name: 'Schedules', id: 'schedules', icon: Calendar, roles: ['admin', 'payroll_officer', 'employee', 'department_head'] },
      ]
    },
    {
      title: "EMPLOYEE ACCOUNT",
      items: [
        { name: 'My Account', id: 'account', icon: User, roles: ['employee'] },
        { name: 'Deductions', id: 'deductions', icon: PieChart, roles: ['employee'] },
      ]
    },
    {
      title: "REGISTRATION",
      items: [
        { name: 'Employees', id: 'employees', icon: Users, roles: ['admin', 'payroll_officer', 'department_head'] },
        { 
          name: 'DTR', 
          id: 'dtr-group', 
          icon: Clock, 
          roles: ['admin', 'payroll_officer', 'employee'],
          isAccordion: true,
          children: [
            { name: 'Regular DTR', id: 'dtr-regular', roles: ['admin', 'payroll_officer'] },
            { name: 'Visiting DTR', id: 'dtr-visiting', roles: ['admin', 'payroll_officer'] },
            { name: 'Job Order DTR', id: 'dtr-job-order', roles: ['admin', 'payroll_officer'] },
            { name: 'DTR Sandbox', id: 'dtr', roles: ['admin', 'payroll_officer'] },
            { name: 'DTR Logs', id: 'dtr', roles: ['employee'] },
          ]
        },
        { name: 'Departments', id: 'departments', icon: BookOpen, roles: ['admin', 'department_head'] },
        { name: 'Holidays', id: 'holidays', icon: Calendar, roles: ['admin', 'payroll_officer', 'employee', 'accountant', 'department_head'] },
        { name: 'Documentation', id: 'docs', icon: FileText, roles: ['admin', 'payroll_officer', 'employee', 'accountant'] },
      ]
    },
    {
      title: "PAYROLL",
      items: [
        { name: 'Payroll', id: 'payroll', icon: CreditCard, roles: ['admin', 'payroll_officer', 'accountant'] },
        { name: 'Deductions', id: 'deductions', icon: PieChart, roles: ['admin', 'payroll_officer'] },
        { name: 'Financial Reports', id: 'reports', icon: PieChart, roles: ['admin', 'accountant'] },
        { name: 'Compliance Logs', id: 'audit', icon: Shield, roles: ['admin', 'accountant'] },
        { name: 'History Logs', id: 'history', icon: History, roles: ['admin', 'payroll_officer'] },
        { name: 'Users Admin', id: 'users', icon: Shield, roles: ['admin'] },
      ]
    }
  ];

  const filteredCategories = categories.map(cat => ({
    title: cat.title,
    items: cat.items
      .filter(item => role && item.roles.includes(role))
      .map(item => {
        if (item.isAccordion && item.children) {
          return {
            ...item,
            children: item.children.filter(child => role && child.roles.includes(role))
          };
        }
        return item;
      })
      .filter(item => !item.isAccordion || (item.children && item.children.length > 0))
  })).filter(cat => cat.items.length > 0);

  return (
    <div className="min-h-screen bg-[#f4f6f9] flex flex-col md:flex-row w-full font-sans">
      {/* Sidebar - Desktop */}
      <aside className={cn(
        "hidden md:flex flex-col bg-white border-r border-neutral-200/85 transition-all duration-300 ease-in-out shrink-0 select-none h-screen sticky top-0 shadow-sm",
        isCollapsed ? "w-[76px]" : "w-64"
      )}>
        {/* Brand Header */}
        <div className={cn(
          "flex items-center border-b border-neutral-100 px-6 h-16 shrink-0",
          isCollapsed ? "justify-center gap-0 px-2" : "justify-between gap-3"
        )}>
          <div className="flex items-center gap-2.5 overflow-hidden select-none">
            <div className="w-[30px] h-[30px] shrink-0 bg-white text-[#1d58d9] rounded-full p-0.5 border border-[#1d58d9]/20 flex items-center justify-center">
              <img 
                src="https://2.bp.blogspot.com/-h1JqhRBS1l0/WQdMWsZUjWI/AAAAAAAAAGg/220ucc6KzCQeb3E8grfL9dZ2bt5ESvUJwCLcB/s1600/slsuLogo.jpg" 
                alt="SLSU Logo" 
                referrerPolicy="no-referrer"
                className="w-full h-full object-contain" 
              />
            </div>
            {!isCollapsed && (
              <span className="font-extrabold text-xl text-[#1d58d9] tracking-tighter leading-none font-sans">
                PAYROLL
              </span>
            )}
          </div>
          
          <button 
            onClick={toggleSidebar}
            className="p-1 rounded-full text-[#1d58d9] hover:bg-neutral-50 transition-colors focus:outline-none shrink-0"
            title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
          >
            <CircleDot className="w-4 h-4 cursor-pointer" />
          </button>
        </div>

        {/* Scrollable Navigation Items */}
        <nav className="flex-1 overflow-y-auto px-4 py-6 space-y-6 scrollbar-none">
          {filteredCategories.map((cat, catIdx) => (
            <div key={catIdx} className="space-y-1.5">
              {!isCollapsed && (
                <h3 className="px-3 text-[10px] font-bold text-neutral-400 tracking-wider uppercase select-none mb-2">
                  {cat.title}
                </h3>
              )}
              
              <div className="space-y-1">
                {cat.items.map((item) => {
                  if (item.isAccordion) {
                    const hasActiveChild = item.children?.some(child => child.id === currentPage);
                    const isOpen = !!openAccordions[item.name];
                    const filteredChildren = item.children || [];

                    if (isCollapsed) {
                      return (
                        <button
                          key={item.name}
                          onClick={() => handleAccordionClick(item.name)}
                          title={item.name}
                          className={cn(
                            "flex items-center transition-all duration-150 w-full rounded-xl select-none group font-medium text-sm font-sans justify-center p-2.5",
                            hasActiveChild 
                              ? "bg-[#e2ebf8] text-[#1d58d9] font-semibold shadow-[0_1px_2px_rgba(29,88,217,0.05)]" 
                              : "text-neutral-500 hover:bg-neutral-50 hover:text-neutral-900"
                          )}
                        >
                          <item.icon className={cn(
                            "w-[18px] h-[18px] shrink-0 transition-colors",
                            hasActiveChild ? "text-[#1d58d9]" : "text-neutral-400 group-hover:text-neutral-600"
                          )} />
                        </button>
                      );
                    }

                    return (
                      <div 
                        key={item.name} 
                        className={cn(
                          "transition-all duration-200 rounded-xl overflow-hidden",
                          isOpen 
                            ? "bg-white border border-[#e2ebf8] p-1.5 shadow-[0_2px_6px_rgba(29,88,217,0.03)]" 
                            : "bg-transparent"
                        )}
                      >
                        <button
                          onClick={() => toggleAccordion(item.name)}
                          className={cn(
                            "flex items-center justify-between transition-all duration-150 w-full rounded-lg select-none group font-medium text-sm font-sans text-left px-3 py-2.5",
                            isOpen 
                              ? "text-[#1d58d9] font-bold" 
                              : "text-neutral-500 hover:bg-neutral-50 hover:text-neutral-900"
                          )}
                        >
                          <div className="flex items-center gap-3">
                            <item.icon className={cn(
                              "w-[18px] h-[18px] shrink-0 transition-colors",
                              isOpen ? "text-[#1d58d9]" : "text-neutral-400 group-hover:text-neutral-600"
                            )} />
                            <span className="truncate whitespace-nowrap text-[13.5px]">{item.name}</span>
                          </div>
                          
                          <ChevronDown className={cn(
                            "w-4 h-4 text-neutral-400 transition-transform duration-200 shrink-0",
                            isOpen && "transform rotate-180 text-[#1d58d9]"
                          )} />
                        </button>

                        {isOpen && (
                          <div className="mt-1 flex flex-col">
                            <div className="border-t border-neutral-100 my-1 mx-2" />
                            <div className="space-y-0.5">
                              {filteredChildren.map((child) => {
                                const isChildActive = currentPage === child.id;
                                return (
                                  <button
                                    key={child.name}
                                    onClick={() => onNavigate(child.id)}
                                    className={cn(
                                      "flex items-center gap-2.5 w-full rounded-lg select-none group font-medium text-[13px] font-sans text-left transition-all duration-150 py-2 px-3.5",
                                      isChildActive
                                        ? "bg-[#e2ebf8]/80 text-[#1d58d9] font-bold"
                                        : "text-neutral-500 hover:bg-neutral-50 hover:text-neutral-900"
                                    )}
                                  >
                                    <ArrowRight className={cn(
                                      "w-3.5 h-3.5 shrink-0 transition-transform duration-150",
                                      isChildActive 
                                        ? "text-[#1d58d9] transform translate-x-0.5" 
                                        : "text-neutral-300 group-hover:text-neutral-600 group-hover:translate-x-0.5"
                                    )} />
                                    <span className="truncate whitespace-nowrap">{child.name}</span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  }

                  const isActive = currentPage === item.id;
                  return (
                    <button
                      key={item.name}
                      onClick={() => onNavigate(item.id)}
                      title={item.name}
                      className={cn(
                        "flex items-center transition-all duration-150 w-full rounded-xl select-none group font-medium text-sm font-sans text-left",
                        isCollapsed ? "justify-center p-2.5" : "gap-3 px-3 py-2.5",
                        isActive 
                          ? "bg-[#e2ebf8] text-[#1d58d9] font-semibold shadow-[0_1px_2px_rgba(29,88,217,0.05)]" 
                          : "text-neutral-500 hover:bg-neutral-50 hover:text-neutral-900"
                      )}
                    >
                      <item.icon className={cn(
                        "w-[18px] h-[18px] shrink-0 transition-colors",
                        isActive 
                          ? "text-[#1d58d9]" 
                          : "text-neutral-400 group-hover:text-neutral-600"
                      )} />
                      
                      {!isCollapsed && (
                        <span className="truncate whitespace-nowrap">
                          {item.name}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </aside>

      {/* Right Side Container */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen">
        {/* Top Navbar */}
        <header className="hidden md:flex items-center justify-between bg-white border-b border-neutral-200/80 px-8 py-3.5 sticky top-0 z-40 select-none h-16 shadow-[0_1px_2px_rgba(0,0,0,0.01)]">
          {/* Left section */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-black uppercase tracking-widest text-[#8a99ad] font-sans">
              Payroll Management System
            </span>
          </div>
          
          {/* Right section */}
          <div className="flex items-center gap-6">
            <button 
              title="Help Center"
              onClick={() => onNavigate('docs')}
              className="p-1.5 rounded-full text-neutral-400 hover:text-neutral-700 hover:bg-neutral-50 transition-colors focus:outline-none"
            >
              <HelpCircle className="w-5 h-5 cursor-pointer" />
            </button>
            
            <button 
              title="Toggle Fullscreen"
              onClick={handleToggleFullscreen}
              className="p-1.5 rounded-full text-neutral-400 hover:text-neutral-700 hover:bg-neutral-50 transition-colors focus:outline-none"
            >
              <Expand className="w-4 h-4 cursor-pointer" />
            </button>
            
            {/* User Profile dropdown */}
            <div className="relative">
              <button 
                onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
                className="flex items-center gap-3 focus:outline-none hover:opacity-95 active:scale-95 transition-all text-left"
              >
                <div className="text-right flex flex-col justify-center font-sans">
                  <span className="text-xs font-bold text-neutral-800 leading-none mb-0.5 whitespace-nowrap">
                    {getDisplayName()}
                  </span>
                  <span className="text-[10px] font-extrabold text-[#1d58d9] leading-none tracking-wide text-right font-mono">
                    {getDisplayId()}
                  </span>
                </div>
                
                {/* Profile Badge/Emblem */}
                <div className="w-[38px] h-[38px] rounded-full border-2 border-[#1d58d9]/25 p-0.5 shrink-0 overflow-hidden bg-white flex items-center justify-center">
                  <img 
                    src={user?.profileImage || "https://2.bp.blogspot.com/-h1JqhRBS1l0/WQdMWsZUjWI/AAAAAAAAAGg/220ucc6KzCQeb3E8grfL9dZ2bt5ESvUJwCLcB/s1600/slsuLogo.jpg"} 
                    alt="Profile Emblem" 
                    referrerPolicy="no-referrer"
                    className={cn(
                      "w-full h-full rounded-full",
                      user?.profileImage ? "object-cover" : "object-contain"
                    )} 
                  />
                </div>
              </button>
              
              <AnimatePresence>
                {isProfileMenuOpen && (
                  <>
                    <div 
                      className="fixed inset-0 z-40" 
                      onClick={() => setIsProfileMenuOpen(false)} 
                    />
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      transition={{ duration: 0.15 }}
                      className="absolute right-0 mt-3.5 w-52 bg-white border border-neutral-200/80 shadow-xl rounded-xl p-1.5 z-50 origin-top-right whitespace-nowrap"
                    >
                      <button
                        onClick={() => {
                          onNavigate('profile');
                          setIsProfileMenuOpen(false);
                        }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-[11px] font-bold text-neutral-600 hover:bg-[#e2ebf8] hover:text-[#1d58d9] rounded-lg text-left tracking-wide uppercase transition-colors"
                      >
                        <KeyRound className="w-4 h-4 text-neutral-400 shrink-0" />
                        <span>My Accounts</span>
                      </button>
                      
                      <div className="border-t border-neutral-100 my-1" />
                      
                      {role !== 'employee' && (
                        <>
                          <button
                            onClick={() => {
                              onNavigate('audit');
                              setIsProfileMenuOpen(false);
                            }}
                            className="w-full flex items-center gap-3 px-4 py-2.5 text-[11px] font-bold text-neutral-600 hover:bg-[#e2ebf8] hover:text-[#1d58d9] rounded-lg text-left tracking-wide uppercase transition-colors"
                          >
                            <History className="w-4 h-4 text-neutral-400 shrink-0" />
                            <span>Logs</span>
                          </button>
                          
                          <div className="border-t border-neutral-100 my-1" />
                        </>
                      )}
                      
                      <button
                        onClick={() => {
                          logout();
                          setIsProfileMenuOpen(false);
                        }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-[11px] font-bold text-red-600 hover:bg-red-50 rounded-lg text-left tracking-wide uppercase transition-colors"
                      >
                        <Power className="w-4 h-4 text-red-500 shrink-0" />
                        <span>Logout</span>
                      </button>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          </div>
        </header>

        {/* Mobile Header */}
        <header className="md:hidden bg-white border-b border-neutral-200 p-4 flex items-center justify-between sticky top-0 z-50 select-none shadow-sm h-16">
          <div className="flex items-center gap-2">
            <div className="w-[28px] h-[28px] shrink-0 bg-white text-[#1d58d9] rounded-full p-0.5 border border-[#1d58d9]/20 flex items-center justify-center">
              <img 
                src="https://2.bp.blogspot.com/-h1JqhRBS1l0/WQdMWsZUjWI/AAAAAAAAAGg/220ucc6KzCQeb3E8grfL9dZ2bt5ESvUJwCLcB/s1600/slsuLogo.jpg" 
                alt="SLSU Logo" 
                referrerPolicy="no-referrer"
                className="w-full h-full object-contain" 
              />
            </div>
            <span className="font-extrabold text-lg text-[#1d58d9] tracking-tighter">PAYROLL</span>
          </div>
          <Button variant="ghost" size="icon" onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}>
            {isMobileMenuOpen ? <X className="text-neutral-800" /> : <Menu className="text-neutral-800" />}
          </Button>
        </header>

        {/* Mobile menu overlay */}
        <AnimatePresence>
          {isMobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="md:hidden absolute top-[64px] left-0 right-0 bg-white border-b border-neutral-200 z-40 p-4 shadow-xl overflow-y-auto max-h-[calc(100vh-64px)] scrollbar-none"
            >
              <nav className="space-y-4">
                {filteredCategories.map((cat, catIdx) => (
                  <div key={catIdx} className="space-y-1.5">
                    <h3 className="text-[10px] font-bold text-neutral-400 tracking-wider uppercase px-2">
                      {cat.title}
                    </h3>
                    <div className="space-y-1">
                      {cat.items.map((item) => {
                        if (item.isAccordion) {
                          const isOpen = !!openAccordions[item.name];
                          const filteredChildren = item.children || [];

                          return (
                            <div 
                              key={item.name} 
                              className={cn(
                                "transition-all duration-200 rounded-xl overflow-hidden",
                                isOpen 
                                  ? "bg-white border border-[#e2ebf8] p-1.5 shadow-[0_2px_6px_rgba(29,88,217,0.03)]" 
                                  : "bg-transparent"
                              )}
                            >
                              <button
                                onClick={() => toggleAccordion(item.name)}
                                className={cn(
                                  "flex items-center justify-between transition-all duration-150 w-full rounded-lg select-none group font-medium text-sm font-sans text-left px-3 py-2.5",
                                  isOpen 
                                    ? "text-[#1d58d9] font-bold" 
                                    : "text-[#555] hover:bg-neutral-50 px-3 py-2.5"
                                )}
                              >
                                <div className="flex items-center gap-3">
                                  <item.icon className={cn(
                                    "w-5 h-5 shrink-0 transition-colors",
                                    isOpen ? "text-[#1d58d9]" : "text-neutral-400"
                                  )} />
                                  <span className="text-sm">{item.name}</span>
                                </div>
                                <ChevronDown className={cn(
                                  "w-4 h-4 text-neutral-400 transition-transform duration-200 shrink-0",
                                  isOpen && "transform rotate-180 text-[#1d58d9]"
                                )} />
                              </button>

                              {isOpen && (
                                <div className="mt-1 flex flex-col">
                                  <div className="border-t border-neutral-100 my-1 mx-2" />
                                  <div className="space-y-0.5">
                                    {filteredChildren.map((child) => {
                                      const isChildActive = currentPage === child.id;
                                      return (
                                        <button
                                          key={child.name}
                                          onClick={() => {
                                            onNavigate(child.id);
                                            setIsMobileMenuOpen(false);
                                          }}
                                          className={cn(
                                            "flex items-center gap-2.5 w-full rounded-lg select-none group font-medium text-[13px] font-sans text-left transition-all duration-150 py-2 px-3.5",
                                            isChildActive
                                              ? "bg-[#e2ebf8]/80 text-[#1d58d9] font-bold"
                                              : "text-neutral-500 hover:bg-neutral-50"
                                          )}
                                        >
                                          <ArrowRight className={cn(
                                            "w-3.5 h-3.5 shrink-0 transition-transform duration-150",
                                            isChildActive 
                                              ? "text-[#1d58d9] transform translate-x-0.5" 
                                              : "text-neutral-300 group-hover:text-neutral-600"
                                          )} />
                                          <span>{child.name}</span>
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        }

                        const isActive = currentPage === item.id;
                        return (
                          <button
                            key={item.name}
                            onClick={() => {
                              onNavigate(item.id);
                              setIsMobileMenuOpen(false);
                            }}
                            className={cn(
                              "flex items-center gap-3 w-full px-4 py-2.5 rounded-xl font-medium text-sm text-left transition-colors",
                              isActive 
                                ? "bg-[#e2ebf8] text-[#1d58d9]" 
                                : "text-neutral-500 hover:bg-neutral-50"
                            )}
                          >
                            <item.icon className="w-5 h-5 shrink-0" />
                            <span>{item.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
                
                <div className="border-t border-neutral-100 my-2" />
                
                <Button 
                  variant="ghost" 
                  className="w-full justify-start text-red-500 font-semibold"
                  onClick={logout}
                >
                  <Power className="w-5 h-5 mr-3 shrink-0" />
                  Logout
                </Button>
              </nav>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main Content Area */}
        <main className="flex-1 p-4 md:p-8 overflow-y-auto w-full min-h-0 bg-[#f4f6f9]">
          <motion.div
            key={currentPage}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="max-w-7xl w-full mx-auto"
          >
            {/* Breadcrumbs / Page Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 select-none font-sans">
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-extrabold text-neutral-800 tracking-tight capitalize">
                  {getPageTitle(currentPage)}
                </h2>
                <div className="h-4 w-[1px] bg-neutral-300 mx-2 hidden sm:block" />
                <div className="flex items-center gap-1.5 text-xs text-neutral-500 font-medium">
                  <Home 
                    className="w-3.5 h-3.5 text-neutral-400 cursor-pointer hover:text-neutral-600 transition-colors" 
                    onClick={() => onNavigate('dashboard')} 
                  />
                  <span className="text-neutral-400 font-bold select-none">&gt;</span>
                  <span className="capitalize text-[#1d58d9] font-bold tracking-wide">
                    {getPageSublabel(currentPage)}
                  </span>
                </div>
              </div>
            </div>

            {/* Rendered page children */}
            {children}
          </motion.div>
        </main>
      </div>
    </div>
  );
};

export default Layout;
