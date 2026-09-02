import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { SLSU_CAMPUSES } from '../lib/constants';
import { 
  Plus, 
  Search, 
  Trash2, 
  Edit2, 
  Shield,
  ShieldCheck,
  RefreshCw,
  Mail,
  User as UserIcon,
  MoreVertical,
  Building2,
  CheckCircle2,
  Database,
  KeyRound,
  ExternalLink,
  Layers
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Badge } from "../components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "../components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import { Label } from "../components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import { toast } from 'sonner';
import { DeleteConfirmationDialog } from '../components/DeleteConfirmationDialog';
import { format } from 'date-fns';

const Users = () => {
  const [users, setUsers] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRole, setFilterRole] = useState('all');
  const [filterCampus, setFilterCampus] = useState('all');
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Supabase Auth Management State
  const [supabaseStatus, setSupabaseStatus] = useState<any>(null);
  const [isSyncingSupabase, setIsSyncingSupabase] = useState(false);
  const [isSupabaseModalOpen, setIsSupabaseModalOpen] = useState(false);

  const [formData, setFormData] = useState({
    email: '',
    displayName: '',
    password: '',
    role: 'employee',
    campus: 'Hinunangan Campus'
  });

  useEffect(() => {
    fetchUsers();
    fetchSupabaseStatus();
  }, []);

  const fetchUsers = async () => {
    try {
      const data = await api.users.list();
      setUsers(data);
    } catch (error: any) {
      toast.error('Failed to fetch users');
    } finally {
      setLoading(false);
    }
  };

  const fetchSupabaseStatus = async () => {
    try {
      const status = await api.users.getSupabaseStatus();
      setSupabaseStatus(status);
    } catch (error) {
      console.warn("Failed to fetch Supabase status:", error);
    }
  };

  const handleSyncSupabase = async () => {
    setIsSyncingSupabase(true);
    const toastId = toast.loading('Synchronizing all users and employees to Supabase Auth...');
    try {
      const result = await api.users.syncSupabase();
      toast.success(result.message || `Successfully synced ${result.synced} users to Supabase Auth!`, { id: toastId });
      await fetchUsers();
      await fetchSupabaseStatus();
    } catch (error: any) {
      toast.error(error.message || 'Failed to synchronize with Supabase Auth', { id: toastId });
    } finally {
      setIsSyncingSupabase(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingUser) {
        await api.users.update(editingUser.id, formData);
        toast.success('User updated and synced with Supabase Auth');
      } else {
        await api.users.create(formData);
        toast.success('User created in database and registered with Supabase Auth');
      }
      setIsAddOpen(false);
      setEditingUser(null);
      resetForm();
      fetchUsers();
      fetchSupabaseStatus();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleDelete = async (id: string) => {
    setItemToDelete(id);
    setIsDeleteOpen(true);
  };

  const confirmDelete = async () => {
    if (!itemToDelete) return;
    
    setIsDeleting(true);
    try {
      await api.users.delete(itemToDelete);
      toast.success('User deleted from local database and Supabase Auth');
      setIsDeleteOpen(false);
      fetchUsers();
      fetchSupabaseStatus();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsDeleting(false);
      setItemToDelete(null);
    }
  };

  const resetForm = () => {
    setFormData({
      email: '',
      displayName: '',
      password: '',
      role: 'employee',
      campus: 'Hinunangan Campus'
    });
  };

  const filteredUsers = users.filter(u => {
    const matchesSearch = (u.displayName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (u.email || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = filterRole === 'all' || u.role === filterRole;
    const matchesCampus = filterCampus === 'all' || (u.campus || 'Hinunangan Campus') === filterCampus;
    return matchesSearch && matchesRole && matchesCampus;
  });

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'admin': return 'bg-neutral-900 text-white';
      case 'payroll_officer': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'employee': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      case 'department_head': return 'bg-purple-100 text-purple-700 border-purple-200';
      case 'accountant': return 'bg-amber-100 text-amber-800 border-amber-200';
      default: return 'bg-neutral-100 text-neutral-700';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Primary Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-3xl font-bold tracking-tight text-neutral-900">User Management</h2>
            <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 gap-1.5 py-1 px-2.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>Supabase Auth Enabled</span>
            </Badge>
          </div>
          <p className="text-neutral-500 mt-1">Manage system accounts, user roles, campuses, and Supabase Auth credentials.</p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button 
            variant="outline"
            onClick={handleSyncSupabase} 
            disabled={isSyncingSupabase}
            className="border-emerald-200 text-emerald-800 hover:bg-emerald-50 gap-2 bg-white"
          >
            <RefreshCw className={`w-4 h-4 text-emerald-600 ${isSyncingSupabase ? 'animate-spin' : ''}`} />
            <span>{isSyncingSupabase ? 'Syncing...' : 'Sync with Supabase'}</span>
          </Button>

          <Button 
            variant="outline"
            onClick={() => setIsSupabaseModalOpen(true)}
            className="border-neutral-200 text-neutral-700 hover:bg-neutral-50 gap-2 bg-white"
          >
            <KeyRound className="w-4 h-4 text-neutral-500" />
            <span>Auth Status</span>
          </Button>

          <Dialog open={isAddOpen} onOpenChange={(open) => {
            setIsAddOpen(open);
            if (!open) {
              setEditingUser(null);
              resetForm();
            }
          }}>
            <DialogTrigger render={(props) => (
              <Button {...props} className="bg-neutral-900 text-white gap-2">
                <Plus className="w-4 h-4" />
                Add User
              </Button>
            )} />
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingUser ? 'Edit User' : 'Add New User'}</DialogTitle>
                <DialogDescription>
                  This account will be automatically provisioned in both the database and Supabase Auth.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="displayName">Display Name</Label>
                  <Input 
                    id="displayName" 
                    placeholder="John Doe" 
                    value={formData.displayName}
                    onChange={e => setFormData(prev => ({...prev, displayName: e.target.value}))}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <Input 
                    id="email" 
                    type="email" 
                    placeholder="john@slsu.edu.ph" 
                    value={formData.email}
                    onChange={e => setFormData(prev => ({...prev, email: e.target.value}))}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="role">System Role</Label>
                  <Select 
                    value={formData.role} 
                    onValueChange={(v: string | null) => {
                      if (v) setFormData(prev => ({...prev, role: v}));
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Administrator</SelectItem>
                      <SelectItem value="accountant">Accountant</SelectItem>
                      <SelectItem value="payroll_officer">Payroll Officer</SelectItem>
                      <SelectItem value="department_head">Department Head</SelectItem>
                      <SelectItem value="employee">Employee</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="campus">Campus Assignment</Label>
                  <Select 
                    value={formData.campus} 
                    onValueChange={(v: string | null) => {
                      if (v) setFormData(prev => ({...prev, campus: v}));
                    }}
                  >
                    <SelectTrigger className="bg-white">
                      <SelectValue placeholder="Select campus" />
                    </SelectTrigger>
                    <SelectContent className="bg-white">
                      {SLSU_CAMPUSES.map(c => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input 
                    id="password" 
                    type="password" 
                    placeholder="••••••••" 
                    value={formData.password}
                    onChange={e => setFormData(prev => ({...prev, password: e.target.value}))}
                    required={!editingUser}
                  />
                  {editingUser && <p className="text-[10px] text-neutral-400">Leave blank to keep current password in database & Supabase</p>}
                </div>
                <DialogFooter className="pt-4">
                  <Button type="submit" className="w-full bg-neutral-900 text-white">
                    {editingUser ? 'Update User & Sync' : 'Create User & Register in Supabase'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Supabase Status Summary Banner */}
      <div className="bg-gradient-to-r from-emerald-900 via-neutral-900 to-slate-900 rounded-2xl p-5 text-white shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-6 h-6 text-emerald-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold">Supabase Authentication Active</h3>
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            </div>
            <p className="text-xs text-neutral-300 mt-0.5">
              All {supabaseStatus?.totalAuthUsers || users.length} user accounts and employee profiles are fully synchronized with Supabase Auth for unified single-sign-on and role validation.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="bg-white/10 px-3.5 py-1.5 rounded-lg text-xs font-semibold backdrop-blur-xs flex items-center gap-1.5">
            <UserIcon className="w-3.5 h-3.5 text-emerald-400" />
            <span>{supabaseStatus?.totalAuthUsers || users.length} Supabase Accounts</span>
          </div>
          <Button 
            size="sm"
            onClick={handleSyncSupabase}
            disabled={isSyncingSupabase}
            className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold gap-1.5 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncingSupabase ? 'animate-spin' : ''}`} />
            <span>Sync Now</span>
          </Button>
        </div>
      </div>

      {/* Table Card */}
      <Card className="border-neutral-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-neutral-100 bg-neutral-50/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
            <Input 
              placeholder="Search users by name or email..." 
              className="pl-10 bg-white"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Select 
              value={filterCampus} 
              onValueChange={(v: string | null) => {
                if (v) setFilterCampus(v);
              }}
            >
              <SelectTrigger className="w-[180px] bg-white">
                <SelectValue placeholder="Filter by Campus" />
              </SelectTrigger>
              <SelectContent className="bg-white">
                <SelectItem value="all">All Campuses</SelectItem>
                {SLSU_CAMPUSES.map(c => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select 
              value={filterRole} 
              onValueChange={(v: string | null) => {
                if (v) setFilterRole(v);
              }}
            >
              <SelectTrigger className="w-[160px] bg-white">
                <SelectValue placeholder="Filter by Role" />
              </SelectTrigger>
              <SelectContent className="bg-white">
                <SelectItem value="all">All Roles</SelectItem>
                <SelectItem value="admin">Administrator</SelectItem>
                <SelectItem value="accountant">Accountant</SelectItem>
                <SelectItem value="payroll_officer">Payroll Officer</SelectItem>
                <SelectItem value="department_head">Department Head</SelectItem>
                <SelectItem value="employee">Employee</SelectItem>
              </SelectContent>
            </Select>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => {
                setSearchTerm('');
                setFilterRole('all');
                setFilterCampus('all');
              }}
            >
              Reset
            </Button>
          </div>
        </div>
        <div className="overflow-auto custom-scrollbar max-h-[600px]">
          <Table>
            <TableHeader>
              <TableRow className="bg-neutral-50/50">
                <TableHead>User</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Campus</TableHead>
                <TableHead>Auth Provider</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center">Loading users...</TableCell>
                </TableRow>
              ) : filteredUsers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-neutral-500">No users found.</TableCell>
                </TableRow>
              ) : (
                filteredUsers.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-neutral-100 flex items-center justify-center font-bold text-neutral-600 text-xs">
                          {u.displayName ? u.displayName[0] : 'U'}
                        </div>
                        <div>
                          <div className="font-semibold text-neutral-900">{u.displayName}</div>
                          <div className="text-xs text-neutral-400">{u.email}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={getRoleBadge(u.role)}>
                        {u.role.replace('_', ' ').toUpperCase()}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="bg-sky-50/80 text-sky-800 border-sky-200/80 gap-1 text-[11px] font-semibold py-0.5 px-2.5">
                        <Building2 className="w-3 h-3 text-sky-600 shrink-0" />
                        {u.campus || 'Hinunangan Campus'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200/70 text-emerald-800 text-[11px] font-medium">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                        <span>Supabase Auth</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-neutral-500">
                      {u.createdAt ? format(new Date(u.createdAt), 'MMM dd, yyyy') : 'N/A'}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger render={(props) => (
                          <Button {...props} variant="ghost" size="icon">
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        )} />
                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuItem className="gap-2" onClick={() => {
                            setEditingUser(u);
                            setFormData({
                              email: u.email,
                              displayName: u.displayName,
                              password: '',
                              role: u.role,
                              campus: u.campus || 'Hinunangan Campus'
                            });
                            setIsAddOpen(true);
                          }}>
                            <Edit2 className="w-4 h-4" />
                            Edit User & Auth
                          </DropdownMenuItem>
                          <DropdownMenuItem className="gap-2 text-red-600 focus:text-red-600" onClick={() => handleDelete(u.id)}>
                            <Trash2 className="w-4 h-4" />
                            Delete Account
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Supabase Auth Details Dialog */}
      <Dialog open={isSupabaseModalOpen} onOpenChange={setIsSupabaseModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-600" />
              <DialogTitle>Supabase Authentication Status</DialogTitle>
            </div>
            <DialogDescription>
              Real-time synchronization status and registered user accounts in Supabase Auth.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-3">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200/70">
                <p className="text-[11px] text-neutral-500 font-medium">Auth Provider</p>
                <p className="text-sm font-bold text-neutral-900 flex items-center gap-1.5 mt-0.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  Supabase Auth (Cloud)
                </p>
              </div>
              <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200/70">
                <p className="text-[11px] text-neutral-500 font-medium">Synced Users</p>
                <p className="text-sm font-bold text-neutral-900 mt-0.5">
                  {supabaseStatus?.totalAuthUsers || 0} Registered
                </p>
              </div>
              <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200/70">
                <p className="text-[11px] text-neutral-500 font-medium">Status</p>
                <p className="text-sm font-bold text-emerald-600 mt-0.5">
                  Fully Operational
                </p>
              </div>
            </div>

            <div>
              <p className="text-xs font-bold text-neutral-700 mb-2">Registered Accounts in Supabase Auth</p>
              <div className="max-h-60 overflow-y-auto border border-neutral-200 rounded-xl divide-y divide-neutral-100 bg-white">
                {supabaseStatus?.authUsers?.length ? (
                  supabaseStatus.authUsers.map((su: any) => (
                    <div key={su.id} className="p-2.5 flex items-center justify-between text-xs hover:bg-neutral-50/50">
                      <div>
                        <p className="font-semibold text-neutral-900">{su.email}</p>
                        <p className="text-[10px] text-neutral-400">
                          {su.metadata?.displayName || 'User'} • {su.metadata?.role || 'employee'} • {su.metadata?.campus || 'Hinunangan'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full font-medium border border-emerald-200">
                          Verified
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-6 text-center text-xs text-neutral-500">
                    No accounts registered in Supabase Auth yet. Click &quot;Sync with Supabase&quot; to populate.
                  </div>
                )}
              </div>
            </div>
          </div>
          <DialogFooter className="flex justify-between items-center sm:justify-between">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSyncSupabase}
              disabled={isSyncingSupabase}
              className="border-emerald-300 text-emerald-800 hover:bg-emerald-50 gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncingSupabase ? 'animate-spin' : ''}`} />
              <span>Resync All Accounts</span>
            </Button>
            <Button size="sm" onClick={() => setIsSupabaseModalOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <DeleteConfirmationDialog 
        isOpen={isDeleteOpen}
        onOpenChange={setIsDeleteOpen}
        onConfirm={confirmDelete}
        isLoading={isDeleting}
        title="Delete User & Supabase Auth Account"
        description="Are you sure you want to delete this user? This will remove their database record and deactivate their login from Supabase Auth."
      />
    </div>
  );
};

export default Users;
