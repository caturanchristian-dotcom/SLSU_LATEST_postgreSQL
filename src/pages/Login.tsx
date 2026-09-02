import React, { useState } from 'react';
import { useAuth } from '../components/AuthProvider';
import { LogIn, Eye, EyeOff, AlertCircle, Building2, ShieldCheck, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { SLSU_CAMPUSES } from '../lib/constants';

const Login = () => {
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [email, setEmail] = useState('caturanchristian@gmail.com');
  const [password, setPassword] = useState('admin123');
  const [campus, setCampus] = useState<string>('Hinunangan Campus');
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [assignedCampusSuggestion, setAssignedCampusSuggestion] = useState<string | null>(null);
  const [showSupabaseSetupModal, setShowSupabaseSetupModal] = useState(false);
  const { login, loginWithGoogle, isSupabaseConfigured } = useAuth();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setLoginError(null);
    setAssignedCampusSuggestion(null);

    try {
      await login(email.trim(), password, campus);
      toast.success(`Welcome back! Logged into ${campus}.`);
    } catch (error: any) {
      console.error("Login error:", error);
      const errMsg = error.message || 'Login failed. Please check your credentials.';
      setLoginError(errMsg);
      toast.error(errMsg);

      if (error.assignedCampus) {
        setAssignedCampusSuggestion(error.assignedCampus);
      } else {
        // Fallback search in error message
        const matched = SLSU_CAMPUSES.find(c => errMsg.toLowerCase().includes(c.toLowerCase()));
        if (matched) {
          setAssignedCampusSuggestion(matched);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setLoginError(null);
    setAssignedCampusSuggestion(null);

    if (!isSupabaseConfigured) {
      setShowSupabaseSetupModal(true);
      return;
    }

    setGoogleLoading(true);
    try {
      await loginWithGoogle(campus);
    } catch (error: any) {
      console.error("Google sign-in error:", error);
      const errMsg = error.message || 'Failed to start Google sign-in';
      setLoginError(errMsg);
      toast.error(errMsg);
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleResetDefaults = () => {
    setEmail('caturanchristian@gmail.com');
    setPassword('admin123');
    setCampus('Hinunangan Campus');
    setLoginError(null);
    setAssignedCampusSuggestion(null);
    toast.success('Default administrator credentials loaded!');
  };

  return (
    <div className="min-h-screen bg-[#f3f6f9] flex items-center justify-center p-4">
      {/* Outer Card with box shadow matching the style of the design */}
      <div className="w-full max-w-[950px] bg-white rounded-3xl overflow-hidden shadow-[0_12px_40px_rgba(0,0,0,0.06)] border border-neutral-100/80 flex flex-col md:flex-row min-h-[500px]">
        
        {/* Left Form Section */}
        <div className="w-full md:w-1/2 p-8 md:p-12 flex flex-col justify-center bg-white border-r border-neutral-50">
          <div className="text-center mb-8 select-none">
            <h1 className="text-[#355275] font-extrabold text-2xl tracking-wider uppercase font-sans leading-tight">
              Southern Leyte State University
            </h1>
            <p className="text-[#355275] font-extrabold text-lg tracking-widest mt-1 font-sans">
              (PAYROLL)
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            {/* Login Error Notification Banner */}
            {loginError && (
              <div className="bg-red-50/90 border border-red-200 text-red-800 px-3.5 py-3 rounded-xl text-xs flex items-start gap-2.5 animate-in fade-in slide-in-from-top-1 shadow-xs">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-bold text-red-800">Login Failed</p>
                  <p className="text-red-700 font-medium mt-0.5 leading-relaxed">{loginError}</p>
                  {assignedCampusSuggestion && (
                    <button
                      type="button"
                      onClick={() => {
                        setCampus(assignedCampusSuggestion);
                        setLoginError(null);
                        setAssignedCampusSuggestion(null);
                        toast.info(`Switched selected campus to ${assignedCampusSuggestion}`);
                      }}
                      className="mt-2 text-[11px] bg-red-600 hover:bg-red-700 text-white font-bold px-3 py-1.5 rounded-lg transition-all inline-flex items-center gap-1.5 shadow-xs cursor-pointer active:scale-95"
                    >
                      <Building2 className="w-3.5 h-3.5" />
                      <span>Switch to {assignedCampusSuggestion}</span>
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Campus dropdown */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-[#355275] tracking-widest uppercase font-sans block">
                CAMPUS
              </label>
              <div className="relative">
                <select
                  id="campus-select"
                  value={campus}
                  onChange={e => {
                    setCampus(e.target.value);
                    setLoginError(null);
                    setAssignedCampusSuggestion(null);
                  }}
                  className="w-full h-11 px-3.5 bg-[#fbfcfd] border border-[#c9d4e4] rounded-lg text-neutral-800 text-[13.5px] font-medium font-sans focus:outline-none focus:ring-1 focus:ring-[#1d58d9] focus:border-[#1d58d9] transition-all cursor-pointer"
                >
                  {SLSU_CAMPUSES.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Google Sign-in Option */}
            <div className="space-y-3">
              <button
                type="button"
                id="google-signin-btn"
                onClick={handleGoogleSignIn}
                disabled={googleLoading || loading}
                className="w-full h-11 flex items-center justify-center gap-3 bg-white hover:bg-neutral-50/90 active:scale-[0.99] border border-neutral-300 rounded-lg text-neutral-700 font-sans font-semibold text-[13.5px] shadow-xs transition-all cursor-pointer disabled:opacity-70 select-none"
              >
                {googleLoading ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-neutral-400 border-t-[#1d58d9]" />
                ) : (
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    />
                  </svg>
                )}
                <span>{googleLoading ? 'Connecting to Google...' : 'Sign in with Google'}</span>
              </button>

              {/* Divider */}
              <div className="relative flex items-center justify-center my-2">
                <div className="border-t border-neutral-200/80 w-full"></div>
                <span className="bg-white px-3 text-[11px] font-bold text-neutral-400 uppercase tracking-wider whitespace-nowrap">
                  or sign in with password
                </span>
                <div className="border-t border-neutral-200/80 w-full"></div>
              </div>
            </div>

            {/* Email Address element */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-[#355275] tracking-widest uppercase font-sans block">
                EMAIL ADDRESS
              </label>
              <input 
                id="email" 
                type="email" 
                placeholder="email@example.com" 
                value={email}
                onChange={e => {
                  setEmail(e.target.value);
                  setLoginError(null);
                  setAssignedCampusSuggestion(null);
                }}
                required
                className="w-full h-11 px-3.5 bg-[#fbfcfd] border border-[#c9d4e4] rounded-lg text-[13.5px] text-neutral-800 placeholder-neutral-400 font-medium font-sans focus:outline-none focus:ring-1 focus:ring-[#1d58d9] focus:border-[#1d58d9] transition-all"
              />
            </div>

            {/* Password input with toggle */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-[#355275] tracking-widest uppercase font-sans block">
                PASSWORD
              </label>
              <div className="relative">
                <input 
                  id="password" 
                  type={showPassword ? "text" : "password"} 
                  placeholder="Password" 
                  value={password}
                  onChange={e => {
                    setPassword(e.target.value);
                    setLoginError(null);
                  }}
                  required
                  className="w-full h-11 px-3.5 pr-11 bg-[#fbfcfd] border border-[#c9d4e4] rounded-lg text-[13.5px] text-neutral-800 placeholder-neutral-400 font-medium font-sans focus:outline-none focus:ring-1 focus:ring-[#1d58d9] focus:border-[#1d58d9] transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-[#1d58d9] transition-colors"
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Options Row */}
            <div className="flex items-center justify-between text-[13px] font-medium font-sans pt-1">
              <label className="flex items-center gap-2 text-neutral-500 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showPassword}
                  onChange={(e) => setShowPassword(e.target.checked)}
                  className="w-4 h-4 rounded border-[#c9d4e4] text-[#1d58d9] focus:ring-[#1d58d9] focus:ring-offset-0"
                />
                <span>Show Password</span>
              </label>
              <button
                type="button"
                onClick={() => toast.info("Please request password recovery from your campus HR Office.")}
                className="text-[#3b5998] hover:text-[#2f4982] hover:underline cursor-pointer"
              >
                Forgot password?
              </button>
            </div>

            {/* Supabase Auth Shield Indicator */}
            <div className="flex items-center justify-center gap-1.5 py-1 text-[11px] text-emerald-700 bg-emerald-50/70 border border-emerald-200/60 rounded-md font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>Protected by <strong>Supabase Auth</strong> Cloud Security</span>
            </div>

            {/* Submit Button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="w-full h-11 flex overflow-hidden rounded bg-[#db4332] hover:bg-[#c63828] active:scale-[0.98] text-white transition-all font-sans font-bold shadow-sm cursor-pointer select-none disabled:opacity-80"
              >
                <div className="bg-[#bc3121] px-3.5 flex items-center justify-center border-r border-[#a82516]/10 h-full shrink-0">
                  {loading ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                  ) : (
                    <LogIn className="w-4 h-4" />
                  )}
                </div>
                <div className="flex-1 flex items-center justify-center text-sm tracking-wide">
                  {loading ? 'Entering...' : 'Login'}
                </div>
              </button>
            </div>
          </form>
        </div>

        {/* Right Illustration Section */}
        <div className="hidden md:flex w-1/2 bg-gradient-to-br from-[#1e3a8a] via-[#2563eb] to-[#1d4ed8] p-12 items-center justify-center relative overflow-hidden">
          {/* Ambient background decoration */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-3xl -mr-16 -mt-16" />
          <div className="absolute bottom-0 left-0 w-80 h-80 bg-blue-400/10 rounded-full blur-3xl -ml-24 -mb-24" />
          
          <div className="max-w-[380px] w-full flex flex-col items-center justify-center text-center relative z-10 text-white select-none">
            {/* Highly polished University Crest / Seal Container */}
            <div className="w-44 h-44 rounded-full bg-white p-1.5 shadow-[0_12px_36px_rgba(0,0,0,0.25)] border-2 border-white/40 flex items-center justify-center mb-8 transform transition-transform duration-500 hover:scale-[1.05] overflow-hidden">
              <img 
                src="https://2.bp.blogspot.com/-h1JqhRBS1l0/WQdMWsZUjWI/AAAAAAAAAGg/220ucc6KzCQeb3E8grfL9dZ2bt5ESvUJwCLcB/s1600/slsuLogo.jpg" 
                alt="Southern Leyte State University Seal" 
                className="w-full h-full rounded-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = 'https://2.bp.blogspot.com/-h1JqhRBS1l0/WQdMWsZUjWI/AAAAAAAAAGg/220ucc6KzCQeb3E8grfL9dZ2bt5ESvUJwCLcB/s1600/slsuLogo.jpg';
                }}
                referrerPolicy="no-referrer"
              />
            </div>
            
            <h2 className="text-2xl font-extrabold tracking-tight mb-3 font-sans">
              SLSU Portal
            </h2>
            <div className="h-1 w-16 bg-amber-400 rounded-full mb-5" />
            <p className="text-white/85 text-xs md:text-sm font-medium leading-relaxed max-w-[300px] font-sans">
              Secure integrated system for payroll processing, human resource management, and campus administration.
            </p>
            
            <div className="mt-8 flex gap-2.5 bg-white/5 backdrop-blur-sm px-4 py-2 rounded-full border border-white/10 text-[10px] font-bold text-amber-300 tracking-wider">
              <span>EST. 2004</span>
              <span className="text-white/20">•</span>
              <span>ADMIN SYSTEM</span>
            </div>
          </div>
        </div>

      </div>

      {/* Supabase OAuth Setup Guidance Modal */}
      {showSupabaseSetupModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-neutral-200">
            <div className="flex items-center gap-3 pb-3 border-b border-neutral-100">
              <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-neutral-800">Supabase Google OAuth Setup</h3>
                <p className="text-xs text-neutral-500">Enable Google Single Sign-On for Southern Leyte State University</p>
              </div>
            </div>

            <div className="mt-4 space-y-3.5 text-xs text-neutral-600 leading-relaxed">
              <p>
                To enable <strong>Sign in with Google</strong>, configure your Supabase project with Google Auth:
              </p>

              <div className="bg-neutral-50 p-3.5 rounded-xl border border-neutral-200 space-y-2">
                <p className="font-bold text-neutral-800 flex items-center gap-1.5">
                  <span className="w-4 h-4 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px]">1</span>
                  Add Environment Variables
                </p>
                <p className="text-[11px] text-neutral-500">
                  Set these variables in your environment or project settings:
                </p>
                <div className="font-mono text-[11px] bg-neutral-900 text-emerald-300 p-2.5 rounded-lg select-all overflow-x-auto">
                  VITE_SUPABASE_URL=https://&lt;your-project&gt;.supabase.co<br />
                  VITE_SUPABASE_ANON_KEY=&lt;your-anon-key&gt;
                </div>
              </div>

              <div className="bg-neutral-50 p-3.5 rounded-xl border border-neutral-200 space-y-2">
                <p className="font-bold text-neutral-800 flex items-center gap-1.5">
                  <span className="w-4 h-4 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px]">2</span>
                  Supabase Google Provider
                </p>
                <p className="text-[11px] text-neutral-500">
                  In your Supabase Dashboard under <strong>Authentication &gt; Providers &gt; Google</strong>, toggle <em>Enable Google Provider</em> and add your Google OAuth Client ID & Secret.
                </p>
              </div>

              <div className="bg-neutral-50 p-3.5 rounded-xl border border-neutral-200 space-y-1.5">
                <p className="font-bold text-neutral-800 flex items-center gap-1.5">
                  <span className="w-4 h-4 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px]">3</span>
                  Authorized Redirect URL
                </p>
                <p className="text-[11px] text-neutral-500">
                  Add this callback in your Google Cloud Console OAuth configuration:
                </p>
                <div className="font-mono text-[11px] bg-white border border-neutral-300 p-2 rounded text-neutral-800 select-all break-all">
                  https://&lt;your-project-id&gt;.supabase.co/auth/v1/callback
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowSupabaseSetupModal(false)}
                className="px-4 py-2 bg-neutral-900 hover:bg-neutral-800 text-white rounded-lg text-xs font-semibold cursor-pointer transition-all"
              >
                Close & Continue with Password
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Login;
