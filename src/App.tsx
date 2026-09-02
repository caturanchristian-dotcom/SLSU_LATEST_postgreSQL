import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './components/AuthProvider';
import { Toaster } from 'sonner';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Employees from './pages/Employees';
import Payroll from './pages/Payroll';
import Deductions from './pages/Deductions';
import DTR from './pages/DTR';
import DTRRegular from './pages/DTRRegular';
import DTRVisiting from './pages/DTRVisiting';
import DTRJobOrder from './pages/DTRJobOrder';
import History from './pages/History';
import Profile from './pages/Profile';
import UsersPage from './pages/Users';
import Schedules from './pages/Schedules';
import Documentation from './pages/Documentation';
import Reports from './pages/Reports';
import AuditLogs from './pages/AuditLogs';
import HolidaysPage from './pages/Holidays';
import Departments from './pages/Departments';
import Layout from './components/Layout';
import ErrorBoundary from './components/ErrorBoundary';

const AppContent = () => {
  const { user, loading } = useAuth();
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [employeeCategory, setEmployeeCategory] = useState<string | null>(null);

  useEffect(() => {
    if (user && user.role === 'employee') {
      fetch('/api/employees')
        .then(res => res.json())
        .then(emps => {
          const matched = emps.find((e: any) => e.email.toLowerCase() === user.email.toLowerCase());
          if (matched) {
            setEmployeeCategory(matched.category);
          }
        })
        .catch(err => console.error("Could not fetch employee profile matching user context", err));
    }
  }, [user]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-neutral-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-neutral-900"></div>
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard': return <Dashboard onNavigate={setCurrentPage} />;
      case 'account': return <Dashboard onNavigate={setCurrentPage} initialSubview="account" />;
      case 'employees': return <Employees />;
      case 'payroll': return <Payroll />;
      case 'deductions': {
        if (user?.role === 'employee') {
          return <Dashboard onNavigate={setCurrentPage} initialSubview="deductions" />;
        }
        return <Deductions />;
      }
      case 'schedules': return <Schedules />;
      case 'dtr-regular': return <DTRRegular />;
      case 'dtr-visiting': return <DTRVisiting />;
      case 'dtr-job-order': return <DTRJobOrder />;
      case 'dtr': {
        if (user?.role === 'employee' && employeeCategory) {
          if (employeeCategory === 'Regular Employee' || employeeCategory === 'FACULTY' || employeeCategory === 'STAFF') return <DTRRegular />;
          if (employeeCategory === 'Visiting Instructor') return <DTRVisiting />;
          if (employeeCategory === 'Job Order') return <DTRJobOrder />;
        }
        return <DTR />;
      }
      case 'history': return <History />;
      case 'profile': return <Profile />;
      case 'users': return <UsersPage />;
      case 'docs': return <Documentation />;
      case 'reports': return <Reports />;
      case 'audit': return <AuditLogs />;
      case 'holidays': return <HolidaysPage />;
      case 'departments': return <Departments />;
      default: return <Dashboard onNavigate={setCurrentPage} />;
    }
  };

  return (
    <Layout onNavigate={setCurrentPage} currentPage={currentPage}>
      {renderPage()}
    </Layout>
  );
};

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <AppContent />
        <Toaster position="top-right" richColors />
      </AuthProvider>
    </ErrorBoundary>
  );
}
