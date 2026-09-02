import React, { useEffect, useState, useRef } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../components/AuthProvider';
import { compressImage } from '../lib/image';
import { 
  User, 
  Mail, 
  Lock, 
  Save, 
  Shield,
  Briefcase,
  Calendar,
  CreditCard,
  Eye,
  EyeOff,
  Phone,
  MessageSquare,
  Upload,
  BadgeAlert,
  BadgeCheck,
  Building,
  GraduationCap,
  Award,
  BookOpen,
  Info,
  ChevronRight,
  FileText,
  Sliders,
  CheckCircle2,
  Trash2
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from "../components/ui/label";
import { toast } from 'sonner';
import { format } from 'date-fns';
import { formatCurrency } from '../lib/utils';

type TabType = 'information' | 'settings';

const Profile = () => {
  const { user } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [smsLogs, setSmsLogs] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<TabType>('information');
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [formData, setFormData] = useState({
    displayName: '',
    firstName: '',
    lastName: '',
    phoneNumber: '',
    password: '',
    confirmPassword: ''
  });

  useEffect(() => {
    fetchProfile();
  }, [user]);

  const fetchProfile = async () => {
    try {
      if (!user?.email) return;
      const data = await api.profile.get(user.email);
      setProfile(data);
      setFormData({
        displayName: data.displayName || '',
        firstName: data.firstName || '',
        lastName: data.lastName || '',
        phoneNumber: data.phoneNumber || '',
        password: '',
        confirmPassword: ''
      });
      if (data.role === 'employee') {
        const logs = await api.payroll.getMySmsLogs(user.email);
        setSmsLogs(logs || []);
      }
    } catch (error: any) {
      toast.error('Failed to load profile details');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (formData.password && formData.password !== formData.confirmPassword) {
      return toast.error('Passwords do not match');
    }

    setSaving(true);
    try {
      await api.profile.update({
        email: user?.email,
        displayName: formData.displayName,
        firstName: formData.firstName,
        lastName: formData.lastName,
        phoneNumber: formData.phoneNumber,
        password: formData.password
      });
      const saved = localStorage.getItem('payroll_user');
      if (saved) {
        try {
          const u = JSON.parse(saved);
          u.displayName = formData.displayName;
          localStorage.setItem('payroll_user', JSON.stringify(u));
          window.dispatchEvent(new Event('user-updated'));
        } catch (e) {
          console.error(e);
        }
      }
      toast.success('Your profile settings have been updated successfully');
      setFormData(prev => ({ ...prev, password: '', confirmPassword: '' }));
      fetchProfile();
    } catch (error: any) {
      toast.error(error.message || 'Failed to update settings');
    } finally {
      setSaving(false);
    }
  };

  const handleTriggerUpload = () => {
    fileInputRef.current?.click();
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const toastId = toast.loading("Compressing and saving your new profile photo...");
    try {
      const base64 = await compressImage(file, 250, 250, 0.7);
      await api.profile.update({
        email: user?.email,
        displayName: profile?.displayName || user?.displayName || '',
        firstName: profile?.firstName || '',
        lastName: profile?.lastName || '',
        phoneNumber: profile?.phoneNumber || '',
        profileImage: base64
      });
      const saved = localStorage.getItem('payroll_user');
      if (saved) {
        try {
          const u = JSON.parse(saved);
          u.profileImage = base64;
          localStorage.setItem('payroll_user', JSON.stringify(u));
          window.dispatchEvent(new Event('user-updated'));
        } catch (e) {
          console.error(e);
        }
      }
      toast.success("Profile photo updated successfully!", { id: toastId });
      fetchProfile();
    } catch (error: any) {
      toast.error(error.message || "Failed to upload photo", { id: toastId });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
          <p className="text-xs text-neutral-400 font-medium">Loading Information System records...</p>
        </div>
      </div>
    );
  }

  const fullName = profile ? `${profile.firstName || ''} ${profile.lastName || ''}`.trim() : user?.displayName || 'User-Record';
  const displayEmail = profile?.email || user?.email || '';
  const displayId = profile?.employeeId || '2310257-1';
  const displayRole = profile?.role === 'employee' ? 'Employee' : 'Administrator';
  
  return (
    <div className="space-y-6">
      {/* Tab Switcher Selector */}
      <div className="flex items-center border-b border-neutral-200 pb-2 gap-4">
        <button
          onClick={() => setActiveTab('information')}
          className={`flex items-center gap-2 py-2 px-4 text-sm font-bold border-b-2 transition-all ${
            activeTab === 'information'
              ? 'border-blue-600 text-[#1a55cc]'
              : 'border-transparent text-neutral-400 hover:text-neutral-700'
          }`}
        >
          <FileText className="w-4 h-4" />
          Information Sheet
        </button>
        <button
          onClick={() => setActiveTab('settings')}
          className={`flex items-center gap-2 py-2 px-4 text-sm font-bold border-b-2 transition-all ${
            activeTab === 'settings'
              ? 'border-blue-600 text-[#1a55cc]'
              : 'border-transparent text-neutral-400 hover:text-neutral-700'
          }`}
        >
          <Sliders className="w-4 h-4" />
          Settings & Security
        </button>
      </div>

      {activeTab === 'information' ? (
        <div className="space-y-8 animate-fadeIn">
          {/* Institutional Banner */}
          <div className="relative bg-gradient-to-r from-[#213f70] via-[#355275] to-[#1c3052] rounded-3xl overflow-hidden shadow-md text-white min-h-[220px] md:min-h-[260px] p-8 flex flex-col justify-between">
            {/* Campus overlay blueprint look */}
            <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.05)_1px,_transparent_1px),_linear-gradient(90deg,_rgba(255,255,255,0.05)_1px,_transparent_1px)] bg-[size:20px_20px] opacity-25" />
            
            {/* Big Kingfisher mascot representation on the right side */}
            <div className="absolute right-0 bottom-0 top-0 w-1/3 opacity-40 md:opacity-90 flex pointer-events-none select-none z-10 items-center justify-end pr-6">
              <img 
                src="https://sis.southernleytestateu.edu.ph/images/help_us_king_fisher.png" 
                alt="SLSU Kingfisher Mascot" 
                className="w-full h-full max-h-[160px] md:max-h-[220px] object-contain"
                referrerPolicy="no-referrer"
              />
            </div>

            {/* University Title & SIS Logo Label */}
            <div className="relative z-20 space-y-1">
              <h1 className="text-xl md:text-3xl font-extrabold tracking-widest text-shadow-sm font-sans uppercase">
                SOUTHERN LEYTE STATE UNIVERSITY
              </h1>
              <p className="text-xs md:text-sm text-blue-200/80 font-mono tracking-wider font-semibold">
                {profile?.role === 'employee' ? 'Employee Information System (EIS)' : 'Student Information System (SIS)'}
              </p>
            </div>

            {/* Empty space for design */}
            <div className="h-10 shrink-0" />

            {/* Bottom Profile Header detail within Banner */}
            <div className="relative z-20 flex items-end">
              {/* Dummy spacing so we can clear the photo block that extends overlayed */}
              <div className="w-[150px] shrink-0 hidden md:block" />
              <div className="ml-0 md:ml-6 pb-2">
                <h2 className="text-xl md:text-2xl font-extrabold tracking-tight">
                  {fullName}
                </h2>
                <p className="text-xs text-blue-200/70 font-mono font-medium">
                  {displayId}
                </p>
              </div>
            </div>
          </div>

          {/* Profile Picture Overlay Positioned below / floating */}
          <div className="relative -mt-24 md:-mt-28 px-8 flex flex-col md:flex-row items-center md:items-end gap-6 z-30 select-none">
            {/* White-bordered Image container exactly matching image */}
            <div className="w-40 h-48 md:w-44 md:h-52 bg-white rounded-2xl p-1.5 shadow-md border border-neutral-200/80 overflow-hidden flex flex-col justify-between items-center relative group">
              <div className="w-full h-[82%] bg-neutral-100 rounded-xl overflow-hidden flex items-center justify-center">
                {profile?.profileImage ? (
                  <img 
                    src={profile.profileImage} 
                    alt={fullName}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-full h-full bg-[#355275] text-white flex flex-col items-center justify-center p-2 text-center">
                    <User className="w-12 h-12 text-blue-100/50 mb-1" />
                    <span className="text-[10px] uppercase font-bold tracking-wider opacity-60">No Image Set</span>
                  </div>
                )}
              </div>
              
              {/* Label banner at bottom inside container */}
              <div className="w-full text-center py-1 select-none">
                <p className="text-[8.5px] md:text-[9.5px] font-black tracking-wide text-neutral-700 uppercase truncate">
                  {profile?.lastName ? `${profile.lastName}, ${profile.firstName?.[0]}.` : fullName}
                </p>
              </div>
            </div>

            {/* Fully Functional Upload Photo trigger right next to profile box */}
            <div className="pb-1">
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handlePhotoUpload} 
                accept="image/*" 
                className="hidden" 
              />
              <Button
                onClick={handleTriggerUpload}
                className="bg-[#1a55cc] hover:bg-blue-700 text-white font-extrabold text-xs tracking-wider uppercase py-2 px-5 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500/20 active:scale-95 transition-all flex items-center gap-2 border border-blue-700"
              >
                <Upload className="w-3.5 h-3.5" />
                Upload new photo
              </Button>
            </div>
          </div>

          {/* 3 Columns detailed metadata panels */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 pt-4">
            {/* Column 1: ABOUT CARD */}
            <Card className="border border-neutral-200/80 shadow-sm rounded-2xl bg-white p-6 flex flex-col justify-between">
              <div>
                <h3 className="text-xs font-black text-neutral-400 uppercase tracking-widest leading-none mb-6 pb-2.5 border-b border-neutral-100">
                  ABOUT
                </h3>
                
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <User className="w-4 h-4 text-neutral-400 shrink-0 mt-0.5" />
                    <div className="text-sm">
                      <span className="text-neutral-400 font-semibold block text-[10px] uppercase tracking-wider">Full Name</span>
                      <span className="font-bold text-neutral-800">{fullName}</span>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <Shield className="w-4 h-4 text-neutral-400 shrink-0 mt-0.5" />
                    <div className="text-sm">
                      <span className="text-neutral-400 font-semibold block text-[10px] uppercase tracking-wider">Gender</span>
                      <span className="font-bold text-neutral-800 capitalize">{profile?.gender || 'Male'}</span>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <GraduationCap className="w-4 h-4 text-neutral-400 shrink-0 mt-0.5" />
                    <div className="text-sm">
                      <span className="text-neutral-400 font-semibold block text-[10px] uppercase tracking-wider">Course / Position</span>
                      <span className="font-bold text-neutral-800">
                        {profile?.position || (profile?.role === 'employee' ? 'SLSU Academic Staff' : 'BSIT (2021)')}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <Phone className="w-4 h-4 text-neutral-400 shrink-0 mt-0.5" />
                    <div className="text-sm">
                      <span className="text-neutral-400 font-semibold block text-[10px] uppercase tracking-wider">Mobile Contact</span>
                      <span className="font-bold text-neutral-800">{profile?.phoneNumber || '09171234567'}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-6 mt-6 border-t border-neutral-50 flex items-center justify-between text-[10px] text-neutral-400">
                <span>Verified Personnel Profile</span>
                <BadgeCheck className="w-4 h-4 text-blue-600" />
              </div>
            </Card>

            {/* Column 2: OTHER INFORMATION */}
            <Card className="border border-neutral-200/80 shadow-sm rounded-2xl bg-white p-6">
              <h3 className="text-xs font-black text-neutral-400 uppercase tracking-widest leading-none mb-6 pb-2.5 border-b border-neutral-100">
                OTHER INFORMATION
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-4 gap-x-6">
                <div className="text-sm">
                  <span className="text-neutral-400 font-semibold block text-[10px] uppercase tracking-wider">NSTP / BP Number</span>
                  <span className="font-bold text-neutral-800 font-mono truncate block">
                    {profile?.bpno || 'C-08-117512-24'}
                  </span>
                </div>

                <div className="text-sm">
                  <span className="text-neutral-400 font-semibold block text-[10px] uppercase tracking-wider">Net Category</span>
                  <span className="font-bold text-neutral-800 capitalize">
                    {profile?.category || 'Not Set'}
                  </span>
                </div>

                <div className="text-sm">
                  <span className="text-neutral-400 font-semibold block text-[10px] uppercase tracking-wider">Entry Credentials</span>
                  <span className="font-bold text-neutral-800 block truncate" title="SF9/F138, Good Moral">
                    {profile?.prefix || 'SF9/F138, Good Moral'}
                  </span>
                </div>

                <div className="text-sm">
                  <span className="text-neutral-400 font-semibold block text-[10px] uppercase tracking-wider">LRN / CRN</span>
                  <span className="font-bold text-neutral-800 font-mono">
                    {profile?.crn || '134423100088'}
                  </span>
                </div>

                <div className="text-sm">
                  <span className="text-neutral-400 font-semibold block text-[10px] uppercase tracking-wider">Date of Birth</span>
                  <span className="font-bold text-neutral-800">
                    {profile?.birthDate ? format(new Date(profile.birthDate), 'MMM dd, yyyy') : 'October 12, 2002'}
                  </span>
                </div>

                <div className="text-sm">
                  <span className="text-neutral-400 font-semibold block text-[10px] uppercase tracking-wider">Effectivity Date</span>
                  <span className="font-bold text-[#1a55cc]">
                    {profile?.effectivityDate ? format(new Date(profile.effectivityDate), 'MMM dd, yyyy') : 'June 15, 2024'}
                  </span>
                </div>
              </div>
            </Card>

            {/* Column 3: NOTE & REMARKS */}
            <Card className="border border-neutral-200/80 shadow-sm rounded-2xl bg-white p-6 flex flex-col justify-between">
              <div className="space-y-6">
                <div>
                  <h3 className="text-xs font-black text-neutral-400 uppercase tracking-widest leading-none mb-3">
                    NOTE:
                  </h3>
                  {/* Soft alert style card with rounded edges */}
                  <div className="p-4 bg-[#e0f7f9] border border-[#b2ebf2] rounded-xl text-neutral-700 text-xs font-medium">
                    No note available. Accounts verified automatically.
                  </div>
                </div>

                <div>
                  <h3 className="text-xs font-black text-neutral-400 uppercase tracking-widest leading-none mb-2">
                    REMARKS:
                  </h3>
                  <div className="space-y-2">
                    <p className="text-xs text-neutral-500 leading-relaxed">
                      Personnel is currently authenticated and verified as active within the SLSU Employee Registry. No pending structural notifications.
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-3 bg-neutral-50 border border-neutral-100 rounded-xl mt-4 flex items-center gap-2 select-none">
                <Info className="w-4 h-4 text-blue-500" />
                <span className="text-[10px] text-neutral-400 leading-tight">
                  Last updated or re-synced: {profile?.createdAt ? format(new Date(profile.createdAt), 'MMM dd, yyyy') : 'N/A'}
                </span>
              </div>
            </Card>
          </div>
        </div>
      ) : (
        /* Settings & Security Tab */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-fadeIn">
          <div className="lg:col-span-2 space-y-6">
            <Card className="border border-neutral-200 shadow-sm bg-white rounded-2xl">
              <CardHeader>
                <CardTitle className="text-lg font-bold text-neutral-800">Personal Information Settings</CardTitle>
                <CardDescription>Update your name, display, and key contact details.</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label htmlFor="firstName" className="font-semibold text-neutral-700">First Name</Label>
                      <Input 
                        id="firstName" 
                        value={formData.firstName}
                        onChange={e => setFormData({...formData, firstName: e.target.value})}
                        placeholder="Enter first name"
                        className="rounded-xl border-neutral-300"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="lastName" className="font-semibold text-neutral-700">Last Name</Label>
                      <Input 
                        id="lastName" 
                        value={formData.lastName}
                        onChange={e => setFormData({...formData, lastName: e.target.value})}
                        placeholder="Enter last name"
                        className="rounded-xl border-neutral-300"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="displayName" className="font-semibold text-neutral-700">Display Name</Label>
                    <Input 
                      id="displayName" 
                      value={formData.displayName}
                      onChange={e => setFormData({...formData, displayName: e.target.value})}
                      placeholder="e.g. Regie Reales, Jr."
                      className="rounded-xl border-neutral-300"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="phoneNumber" className="font-semibold text-neutral-700">Phone Number (SMS System Warnings)</Label>
                    <div className="relative">
                      <Input 
                        id="phoneNumber" 
                        value={formData.phoneNumber}
                        onChange={e => setFormData({...formData, phoneNumber: e.target.value})}
                        placeholder="e.g. 09171234567"
                        className="pl-10 rounded-xl border-neutral-300"
                      />
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 w-4 h-4" />
                    </div>
                    <p className="text-[10px] text-neutral-400">Used to match custom notifications during clock ticks.</p>
                  </div>

                  <div className="space-y-2">
                    <Label className="font-semibold text-neutral-700">Email Address (Managed by Administrator)</Label>
                    <div className="flex items-center gap-3 px-4 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-neutral-500 text-sm font-medium">
                      <Mail className="w-4 h-4 text-neutral-400" />
                      {displayEmail}
                      <span className="ml-auto text-[10px] font-bold uppercase tracking-widest bg-neutral-200 px-2 py-0.5 rounded text-neutral-600">Locked</span>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-neutral-100 space-y-4">
                    <h4 className="text-sm font-bold text-neutral-800 flex items-center gap-2">
                      <Lock className="w-4 h-4 text-neutral-500" />
                      Security & Password Management
                    </h4>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <Label htmlFor="password">New Password</Label>
                        <div className="relative">
                          <Input 
                            id="password" 
                            type={showPassword ? "text" : "password"} 
                            value={formData.password}
                            onChange={e => setFormData({...formData, password: e.target.value})}
                            placeholder="••••••••"
                            className="pr-10 rounded-xl border-neutral-300"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 transition-colors"
                          >
                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="confirmPassword">Confirm New Password</Label>
                        <div className="relative">
                          <Input 
                            id="confirmPassword" 
                            type={showConfirmPassword ? "text" : "password"} 
                            value={formData.confirmPassword}
                            onChange={e => setFormData({...formData, confirmPassword: e.target.value})}
                            placeholder="••••••••"
                            className="pr-10 rounded-xl border-neutral-300"
                          />
                          <button
                            type="button"
                            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 transition-colors"
                          >
                            {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>
                    </div>
                    <p className="text-[10px] text-neutral-400">Leave both input fields blank if you do not request to update password.</p>
                  </div>

                  <div className="flex justify-end pt-4">
                    <Button type="submit" className="bg-[#1a55cc] text-white hover:bg-blue-700 px-6 py-2 rounded-xl flex items-center gap-2" disabled={saving}>
                      <Save className="w-4 h-4" />
                      {saving ? 'Updating Settings...' : 'Save All Changes'}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="border border-neutral-200 shadow-sm bg-white rounded-2xl">
              <CardHeader>
                <CardTitle className="text-lg font-bold text-neutral-800">Authorization Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-blue-600 flex items-center justify-center text-white font-bold text-xl">
                    {fullName?.[0]?.toUpperCase() || 'U'}
                  </div>
                  <div>
                    <p className="font-bold text-neutral-900">{fullName}</p>
                    <p className="text-xs text-neutral-500 capitalize">{displayRole} Access</p>
                  </div>
                </div>

                <div className="space-y-3 pt-4 border-t border-neutral-100">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-neutral-400 font-semibold">User Role</span>
                    <span className="font-bold text-neutral-800 capitalize">{profile?.role}</span>
                  </div>

                  {profile?.role === 'employee' && (
                    <>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-neutral-400 font-semibold">Disbursed Cat</span>
                        <span className="font-bold text-neutral-800 capitalize">{profile?.category || 'Regular'}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-neutral-400 font-semibold">Basic Pay</span>
                        <span className="font-bold text-[#1a55cc]">₱{formatCurrency(profile?.basicSalary || 0)}</span>
                      </div>
                    </>
                  )}
                </div>

                <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200 font-sans">
                  <div className="flex items-center gap-2 text-emerald-700 font-bold text-xs mb-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Account Verified
                  </div>
                  <p className="text-[10px] text-emerald-600 leading-tight">
                    This account is in excellent standing within the SLSU Information Portal network.
                  </p>
                </div>
              </CardContent>
            </Card>

            {profile?.role === 'employee' && (
              <Card className="border border-neutral-200 shadow-sm bg-neutral-50 rounded-2xl overflow-hidden">
                <CardHeader className="p-5 pb-3">
                  <CardTitle className="text-sm font-bold flex items-center gap-2 text-neutral-800 leading-none">
                    <MessageSquare className="w-4 h-4 text-neutral-500" />
                    SMS Sim Box Logs
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-5 pt-0 space-y-3 max-h-[260px] overflow-y-auto">
                  {smsLogs.length === 0 ? (
                    <p className="text-[10.5px] text-neutral-400 py-6 text-center italic">
                      No matching active logs yet. Real-time entries will generate during clock ticks.
                    </p>
                  ) : (
                    smsLogs.map((log: any) => (
                      <div key={log.id} className="p-3 bg-white rounded-xl border border-neutral-200/65 text-[11.5px] leading-relaxed text-neutral-700">
                        <div className="flex justify-between items-center text-[9px] text-neutral-400 mb-1.5 font-mono">
                          <span className="font-bold text-blue-600">REMINDER RECEIVED</span>
                          <span>{format(new Date(log.createdAt), 'MMM dd, h:mm a')}</span>
                        </div>
                        <p className="font-medium">{log.message}</p>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Profile;
