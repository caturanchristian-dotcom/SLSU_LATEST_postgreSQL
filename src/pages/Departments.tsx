import React, { useEffect, useState, useMemo } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../components/AuthProvider';
import { useRealtime } from '../hooks/useRealtime';
import { 
  Plus, 
  Search, 
  Trash2, 
  Edit2, 
  BookOpen, 
  Building2, 
  GraduationCap, 
  User as UserIcon, 
  ArrowRight, 
  Layers, 
  FileText, 
  BookMarked,
  Sparkles,
  Award
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
  DialogFooter,
} from "../components/ui/dialog";
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

interface Department {
  id: string;
  name: string;
  code: string;
  departmentHeadId: string | null;
  description: string;
  headName?: string;
  headEmail?: string;
  createdAt?: string;
}

interface Subject {
  id: string;
  departmentId: string;
  code: string;
  name: string;
  units: number;
  description: string;
  departmentName?: string;
  departmentCode?: string;
  createdAt?: string;
}

interface DepartmentHead {
  id: string;
  email: string;
  displayName: string;
  role: string;
}

const Departments = () => {
  const { user, role } = useAuth();
  const isAdmin = role === 'admin';
  const isDeptHead = role === 'department_head';

  const [activeTab, setActiveTab] = useState<'departments' | 'subjects'>('departments');
  const [departments, setDepartments] = useState<Department[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [deptHeads, setDeptHeads] = useState<DepartmentHead[]>([]);
  const [loading, setLoading] = useState(true);

  // Search and Filter states
  const [deptSearch, setDeptSearch] = useState('');
  const [subjectSearch, setSubjectSearch] = useState('');
  const [selectedDeptFilter, setSelectedDeptFilter] = useState<string>('all');

  // Modals state
  const [isDeptModalOpen, setIsDeptModalOpen] = useState(false);
  const [editingDept, setEditingDept] = useState<Department | null>(null);
  const [deptForm, setDeptForm] = useState({
    name: '',
    code: '',
    departmentHeadId: 'none',
    description: ''
  });

  const [isSubjModalOpen, setIsSubjModalOpen] = useState(false);
  const [editingSubj, setEditingSubj] = useState<Subject | null>(null);
  const [subjForm, setSubjForm] = useState({
    departmentId: '',
    code: '',
    name: '',
    units: '3',
    description: ''
  });

  // Delete states
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'dept' | 'subj'; id: string; name: string } | null>(null);

  const fetchData = async () => {
    try {
      const [deptsData, subjsData, headsData] = await Promise.all([
        api.departments.list().catch(() => []),
        api.subjects.list().catch(() => []),
        api.departments.listHeads().catch(() => [])
      ]);
      setDepartments(Array.isArray(deptsData) ? deptsData : []);
      setSubjects(Array.isArray(subjsData) ? subjsData : []);
      setDeptHeads(Array.isArray(headsData) ? headsData : []);
    } catch (error: any) {
      toast.error('Failed to load academic data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Set up instant real-time sync when departments or subjects change
  useRealtime(['departments_changed', 'subjects_changed'], () => {
    fetchData();
  });

  // Find departments that the current user manages
  const managedDeptIds = useMemo(() => {
    if (!user) return [];
    return departments
      .filter(d => d.departmentHeadId === user.id)
      .map(d => d.id);
  }, [departments, user]);

  // Check if current user can manage a specific subject
  const canManageSubject = (subj: Subject) => {
    if (isAdmin) return true;
    if (isDeptHead && user) {
      // Find the subject's department to check head ID
      const dept = departments.find(d => d.id === subj.departmentId);
      return dept?.departmentHeadId === user.id;
    }
    return false;
  };

  // Check if current user can manage a specific department
  const canManageDept = (dept: Department) => {
    if (isAdmin) return true;
    return false; // Dept heads cannot update department details or assign heads
  };

  // Handlers for Departments
  const handleOpenAddDept = () => {
    setEditingDept(null);
    setDeptForm({
      name: '',
      code: '',
      departmentHeadId: deptHeads.length > 0 ? deptHeads[0].id : 'none',
      description: ''
    });
    setIsDeptModalOpen(true);
  };

  const handleOpenEditDept = (dept: Department) => {
    setEditingDept(dept);
    setDeptForm({
      name: dept.name,
      code: dept.code,
      departmentHeadId: dept.departmentHeadId || 'none',
      description: dept.description || ''
    });
    setIsDeptModalOpen(true);
  };

  const handleSaveDept = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deptForm.name.trim() || !deptForm.code.trim()) {
      toast.error('Department name and code are required');
      return;
    }

    const payload = {
      name: deptForm.name.trim(),
      code: deptForm.code.trim().toUpperCase(),
      departmentHeadId: deptForm.departmentHeadId === 'none' ? null : deptForm.departmentHeadId,
      description: deptForm.description.trim()
    };

    try {
      if (editingDept) {
        await api.departments.update(editingDept.id, payload);
        toast.success('Department updated successfully');
      } else {
        await api.departments.create(payload);
        toast.success('Department created successfully');
      }
      setIsDeptModalOpen(false);
      fetchData();
    } catch (error: any) {
      toast.error(error.message || 'Error saving department');
    }
  };

  // Handlers for Subjects
  const handleOpenAddSubj = () => {
    setEditingSubj(null);
    
    // Auto-select first department that the user can manage
    let initialDeptId = '';
    if (isDeptHead && managedDeptIds.length > 0) {
      initialDeptId = managedDeptIds[0];
    } else if (departments.length > 0) {
      initialDeptId = departments[0].id;
    }

    setSubjForm({
      departmentId: initialDeptId,
      code: '',
      name: '',
      units: '3',
      description: ''
    });
    setIsSubjModalOpen(true);
  };

  const handleOpenEditSubj = (subj: Subject) => {
    setEditingSubj(subj);
    setSubjForm({
      departmentId: subj.departmentId,
      code: subj.code,
      name: subj.name,
      units: String(subj.units),
      description: subj.description || ''
    });
    setIsSubjModalOpen(true);
  };

  const handleSaveSubj = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subjForm.departmentId || !subjForm.code.trim() || !subjForm.name.trim()) {
      toast.error('All fields except description are required');
      return;
    }

    const payload = {
      departmentId: subjForm.departmentId,
      code: subjForm.code.trim().toUpperCase(),
      name: subjForm.name.trim(),
      units: Number(subjForm.units) || 3,
      description: subjForm.description.trim()
    };

    try {
      if (editingSubj) {
        await api.subjects.update(editingSubj.id, payload);
        toast.success('Subject updated successfully');
      } else {
        await api.subjects.create(payload);
        toast.success('Subject created successfully');
      }
      setIsSubjModalOpen(false);
      fetchData();
    } catch (error: any) {
      toast.error(error.message || 'Error saving subject');
    }
  };

  // Delete flow
  const handlePromptDelete = (type: 'dept' | 'subj', id: string, name: string) => {
    setDeleteTarget({ type, id, name });
    setIsDeleteOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      if (deleteTarget.type === 'dept') {
        await api.departments.delete(deleteTarget.id);
        toast.success(`Department "${deleteTarget.name}" deleted successfully`);
      } else {
        await api.subjects.delete(deleteTarget.id);
        toast.success(`Subject "${deleteTarget.name}" deleted successfully`);
      }
      setIsDeleteOpen(false);
      setDeleteTarget(null);
      fetchData();
    } catch (error: any) {
      toast.error(error.message || 'Deletion failed');
    }
  };

  // Effect to auto-select the department head's department filter
  useEffect(() => {
    if (isDeptHead && user && departments.length > 0) {
      const myDept = departments.find(d => d.departmentHeadId === user.id);
      if (myDept) {
        setSelectedDeptFilter(myDept.id);
      }
    }
  }, [departments, isDeptHead, user]);

  // Filter lists
  const filteredDepartments = departments.filter(dept => {
    // If department head, only allow their own department to be viewed
    if (isDeptHead && user) {
      if (dept.departmentHeadId !== user.id) {
        return false;
      }
    }

    const term = deptSearch.toLowerCase().trim();
    if (!term) return true;
    return (
      dept.name.toLowerCase().includes(term) ||
      dept.code.toLowerCase().includes(term) ||
      (dept.headName && dept.headName.toLowerCase().includes(term))
    );
  });

  const filteredSubjects = subjects.filter(subj => {
    // If department head, only allow subjects belonging to their department to be viewed
    if (isDeptHead && user) {
      const dept = departments.find(d => d.id === subj.departmentId);
      if (!dept || dept.departmentHeadId !== user.id) {
        return false;
      }
    }

    // Check search term
    const term = subjectSearch.toLowerCase().trim();
    const matchesSearch = !term || (
      subj.name.toLowerCase().includes(term) ||
      subj.code.toLowerCase().includes(term) ||
      (subj.description && subj.description.toLowerCase().includes(term))
    );

    // Check department filter
    const matchesDept = selectedDeptFilter === 'all' || subj.departmentId === selectedDeptFilter;

    return matchesSearch && matchesDept;
  });

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 bg-white/50 backdrop-blur-sm rounded-2xl border border-neutral-100">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#1d58d9] mb-3"></div>
        <p className="text-xs text-neutral-500 font-medium">Synchronizing academic registers...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 font-sans select-none">
      {/* Overview Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <Card className="shadow-sm border-neutral-200/60 bg-white hover:shadow-md transition-all">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs font-bold text-neutral-400 uppercase tracking-wider">
                {isDeptHead ? 'Your Department' : 'Total Departments'}
              </span>
              <h3 className="text-3xl font-extrabold text-neutral-800 tracking-tight">
                {isDeptHead && user
                  ? departments.filter(d => d.departmentHeadId === user.id).length
                  : departments.length
                }
              </h3>
              <p className="text-[10px] text-neutral-400">
                {isDeptHead ? 'Active academic division' : 'Colleges & academic offices'}
              </p>
            </div>
            <div className="w-12 h-12 bg-blue-50 text-[#1d58d9] rounded-xl flex items-center justify-center">
              <Building2 className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-neutral-200/60 bg-white hover:shadow-md transition-all">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs font-bold text-neutral-400 uppercase tracking-wider">
                {isDeptHead ? 'Department Subjects' : 'Total Subjects'}
              </span>
              <h3 className="text-3xl font-extrabold text-neutral-800 tracking-tight">
                {isDeptHead && user
                  ? subjects.filter(s => {
                      const dept = departments.find(d => d.id === s.departmentId);
                      return dept?.departmentHeadId === user.id;
                    }).length
                  : subjects.length
                }
              </h3>
              <p className="text-[10px] text-neutral-400">
                {isDeptHead ? 'Curriculum courses under your care' : 'Curriculum catalog records'}
              </p>
            </div>
            <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center">
              <BookOpen className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-neutral-200/60 bg-white hover:shadow-md transition-all">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1">
              {isDeptHead ? (
                <>
                  <span className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Your Department</span>
                  <h3 className="text-lg font-bold text-neutral-800 leading-tight mt-1 truncate max-w-[180px]">
                    {departments.find(d => d.departmentHeadId === user?.id)?.code || 'No Department Assigned'}
                  </h3>
                  <p className="text-[10px] text-emerald-600 font-semibold">Active Department Head</p>
                </>
              ) : (
                <>
                  <span className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Department Heads</span>
                  <h3 className="text-3xl font-extrabold text-neutral-800 tracking-tight">
                    {departments.filter(d => d.departmentHeadId !== null).length}
                  </h3>
                  <p className="text-[10px] text-neutral-400">Assigned coordinators</p>
                </>
              )}
            </div>
            <div className="w-12 h-12 bg-purple-50 text-purple-600 rounded-xl flex items-center justify-center">
              <GraduationCap className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs Switcher & Actions */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 border-b border-neutral-200 pb-1">
        <div className="flex items-center gap-1.5 bg-neutral-100 p-1.5 rounded-xl self-start">
          <button
            onClick={() => setActiveTab('departments')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-all ${
              activeTab === 'departments'
                ? 'bg-white text-[#1d58d9] shadow-sm'
                : 'text-neutral-500 hover:text-neutral-800'
            }`}
          >
            <Building2 className="w-4 h-4" />
            <span>Departments</span>
          </button>
          <button
            onClick={() => setActiveTab('subjects')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-all ${
              activeTab === 'subjects'
                ? 'bg-white text-[#1d58d9] shadow-sm'
                : 'text-neutral-500 hover:text-neutral-800'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span>Curriculum Subjects</span>
          </button>
        </div>

        {/* Action Button */}
        <div>
          {activeTab === 'departments' && isAdmin && (
            <Button 
              onClick={handleOpenAddDept}
              className="bg-[#1d58d9] hover:bg-[#1644b5] text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-md shadow-[#1d58d9]/10"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Department
            </Button>
          )}

          {activeTab === 'subjects' && (isAdmin || (isDeptHead && managedDeptIds.length > 0)) && (
            <Button 
              onClick={handleOpenAddSubj}
              className="bg-[#1d58d9] hover:bg-[#1644b5] text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-md shadow-[#1d58d9]/10"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Subject
            </Button>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      {activeTab === 'departments' ? (
        <div className="space-y-4">
          {/* Department Search & Filter */}
          <div className="relative max-w-md w-full">
            <Search className="absolute left-3.5 top-1/2 transform -translate-y-1/2 w-4 h-4 text-neutral-400" />
            <Input
              placeholder="Search departments by name, code, or head..."
              value={deptSearch}
              onChange={(e) => setDeptSearch(e.target.value)}
              className="pl-10 pr-4 py-2.5 rounded-xl border-neutral-200 bg-white text-xs text-neutral-700 shadow-sm focus-visible:ring-1 focus-visible:ring-[#1d58d9]"
            />
          </div>

          {filteredDepartments.length === 0 ? (
            <div className="bg-white rounded-2xl border border-neutral-100 p-12 text-center shadow-sm">
              <Building2 className="w-12 h-12 text-neutral-300 mx-auto mb-3" />
              <h3 className="text-sm font-bold text-neutral-700">No departments found</h3>
              <p className="text-xs text-neutral-400 mt-1">Try adjusting your search terms or register a new department.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {filteredDepartments.map((dept) => {
                const headInitials = dept.headName 
                  ? dept.headName.split(' ').map(p => p[0]).join('').substring(0, 2).toUpperCase()
                  : 'N/A';
                
                const deptSubjects = subjects.filter(s => s.departmentId === dept.id);
                const isManagedByMe = dept.departmentHeadId === user?.id;

                return (
                  <Card key={dept.id} className="shadow-sm border-neutral-200/75 bg-white overflow-hidden relative group hover:shadow-md transition-all flex flex-col justify-between">
                    <div>
                      {/* Card Header Color Band */}
                      <div className="h-2.5 bg-neutral-100 group-hover:bg-[#1d58d9]/20 transition-all" />
                      
                      <div className="p-6">
                        <div className="flex items-start justify-between gap-4">
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-2">
                              <Badge className="bg-[#1d58d9]/10 text-[#1d58d9] hover:bg-[#1d58d9]/15 border-none px-2.5 py-1 text-[11px] font-black tracking-wide">
                                {dept.code}
                              </Badge>
                              {isManagedByMe && (
                                <Badge className="bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-none px-2 py-0.5 text-[9px] font-bold">
                                  Your Dept
                                </Badge>
                              )}
                            </div>
                            <h4 className="text-base font-extrabold text-neutral-800 leading-snug tracking-tight">
                              {dept.name}
                            </h4>
                          </div>

                          {/* Subject Counts */}
                          <button 
                            onClick={() => {
                              setSelectedDeptFilter(dept.id);
                              setActiveTab('subjects');
                            }}
                            className="text-right hover:opacity-80 transition-all shrink-0"
                            title="View subjects under this department"
                          >
                            <span className="text-lg font-black text-[#1d58d9]">{deptSubjects.length}</span>
                            <span className="block text-[9px] text-neutral-400 font-bold uppercase tracking-wider">Subjects</span>
                          </button>
                        </div>

                        {/* Description */}
                        <p className="text-xs text-neutral-500 mt-4 leading-relaxed line-clamp-2">
                          {dept.description || 'No description provided for this academic department.'}
                        </p>

                        {/* Head Coordinator Profile */}
                        <div className="mt-6 pt-4 border-t border-neutral-100 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 bg-neutral-50 text-neutral-500 font-extrabold text-xs rounded-full border border-neutral-200 flex items-center justify-center">
                              {headInitials}
                            </div>
                            <div className="flex flex-col justify-center">
                              <span className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider leading-none">Department Head</span>
                              <span className="text-xs font-bold text-neutral-700 leading-snug mt-1">
                                {dept.headName || 'Vacant / Unassigned'}
                              </span>
                              {dept.headEmail && (
                                <span className="text-[10px] text-neutral-400 mt-0.5">
                                  {dept.headEmail}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Footer Actions (Only Admins can modify department details) */}
                    {isAdmin && (
                      <div className="bg-neutral-50/50 px-6 py-3 border-t border-neutral-100/80 flex items-center justify-end gap-2.5">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleOpenEditDept(dept)}
                          className="w-8 h-8 rounded-full text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handlePromptDelete('dept', dept.id, dept.name)}
                          className="w-8 h-8 rounded-full text-neutral-500 hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Subjects Filters */}
          <div className="flex flex-col md:flex-row items-stretch md:items-center gap-4 bg-white p-4 rounded-2xl border border-neutral-200/60 shadow-sm">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 transform -translate-y-1/2 w-4 h-4 text-neutral-400" />
              <Input
                placeholder="Search subjects by code, name, or description..."
                value={subjectSearch}
                onChange={(e) => setSubjectSearch(e.target.value)}
                className="pl-10 pr-4 py-2 rounded-xl border-neutral-200 text-xs text-neutral-700 focus-visible:ring-1 focus-visible:ring-[#1d58d9]"
              />
            </div>

            {/* Department Filter Select */}
            <div className="w-full md:w-64">
              <Select 
                value={selectedDeptFilter} 
                onValueChange={(val: string | null) => {
                  if (val) setSelectedDeptFilter(val);
                }}
              >
                <SelectTrigger className="rounded-xl border-neutral-200 text-xs text-neutral-600 focus:ring-1 focus:ring-[#1d58d9]">
                  <SelectValue placeholder="Filter by Department" />
                </SelectTrigger>
                <SelectContent>
                  {!isDeptHead && <SelectItem value="all">All Departments</SelectItem>}
                  {departments
                    .filter(dept => !isDeptHead || dept.departmentHeadId === user?.id)
                    .map(dept => (
                      <SelectItem key={dept.id} value={dept.id}>
                        {dept.code} - {dept.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Subjects Table */}
          {filteredSubjects.length === 0 ? (
            <div className="bg-white rounded-2xl border border-neutral-100 p-12 text-center shadow-sm">
              <BookOpen className="w-12 h-12 text-neutral-300 mx-auto mb-3" />
              <h3 className="text-sm font-bold text-neutral-700">No subjects found</h3>
              <p className="text-xs text-neutral-400 mt-1">Try adjusting your filters, searching, or register a curriculum subject.</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-neutral-200/60 overflow-hidden shadow-sm">
              <Table>
                <TableHeader className="bg-neutral-50/70">
                  <TableRow className="border-b border-neutral-150">
                    <TableHead className="text-xs font-bold text-neutral-600 tracking-wider h-11">Code</TableHead>
                    <TableHead className="text-xs font-bold text-neutral-600 tracking-wider h-11">Subject Name</TableHead>
                    <TableHead className="text-xs font-bold text-neutral-600 tracking-wider h-11">Department</TableHead>
                    <TableHead className="text-xs font-bold text-neutral-600 tracking-wider h-11 text-center">Units</TableHead>
                    <TableHead className="text-xs font-bold text-neutral-600 tracking-wider h-11">Description</TableHead>
                    <TableHead className="text-xs font-bold text-neutral-600 tracking-wider h-11 text-right pr-6">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSubjects.map((subj) => {
                    const editable = canManageSubject(subj);
                    
                    return (
                      <TableRow key={subj.id} className="border-b border-neutral-100 hover:bg-neutral-50/50 transition-colors">
                        <TableCell className="font-mono text-xs font-bold text-neutral-800 py-3.5">
                          {subj.code}
                        </TableCell>
                        <TableCell className="text-xs font-bold text-neutral-800 py-3.5">
                          {subj.name}
                        </TableCell>
                        <TableCell className="py-3.5">
                          <Badge className="bg-[#1d58d9]/5 text-[#1d58d9] hover:bg-[#1d58d9]/10 border-none px-2 py-0.5 text-[10px] font-bold">
                            {subj.departmentCode || 'N/A'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs font-bold text-neutral-700 text-center py-3.5">
                          {subj.units}
                        </TableCell>
                        <TableCell className="text-xs text-neutral-500 py-3.5 max-w-xs truncate">
                          {subj.description || 'No description provided.'}
                        </TableCell>
                        <TableCell className="text-right py-3.5 pr-6 whitespace-nowrap">
                          {editable ? (
                            <div className="flex items-center justify-end gap-1.5">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleOpenEditSubj(subj)}
                                className="w-8 h-8 rounded-full text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handlePromptDelete('subj', subj.id, subj.name)}
                                className="w-8 h-8 rounded-full text-neutral-500 hover:bg-red-50 hover:text-red-600"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          ) : (
                            <span className="text-[10px] font-bold text-neutral-400 italic">Admin/Head Lock</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}

      {/* DEPARTMENT SAVE MODAL */}
      <Dialog open={isDeptOpenModalHelper()} onOpenChange={(open) => !open && setIsDeptModalOpen(false)}>
        <DialogContent className="max-w-md bg-white rounded-2xl border-none p-6 shadow-2xl font-sans select-none">
          <DialogHeader>
            <DialogTitle className="text-base font-extrabold text-neutral-800">
              {editingDept ? 'Modify Academic Department' : 'Establish New Department'}
            </DialogTitle>
            <DialogDescription className="text-xs text-neutral-400">
              Define the identity, abbreviation code, and coordinator for the department.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveDept} className="space-y-4 mt-4">
            <div className="space-y-1.5">
              <Label htmlFor="dept-name" className="text-xs font-bold text-neutral-500">Department Name</Label>
              <Input
                id="dept-name"
                placeholder="e.g. College of Computer Studies"
                value={deptForm.name}
                onChange={(e) => setDeptForm(prev => ({ ...prev, name: e.target.value }))}
                className="rounded-xl border-neutral-200 text-xs py-2"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="dept-code" className="text-xs font-bold text-neutral-500">Abbreviation Code</Label>
                <Input
                  id="dept-code"
                  placeholder="e.g. CCS"
                  value={deptForm.code}
                  onChange={(e) => setDeptForm(prev => ({ ...prev, code: e.target.value.toUpperCase() }))}
                  className="rounded-xl border-neutral-200 text-xs font-bold py-2"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="dept-head" className="text-xs font-bold text-neutral-500">Department Head</Label>
                <Select
                  value={deptForm.departmentHeadId}
                  onValueChange={(val: string | null) => {
                    if (val) setDeptForm(prev => ({ ...prev, departmentHeadId: val }));
                  }}
                >
                  <SelectTrigger id="dept-head" className="rounded-xl border-neutral-200 text-xs">
                    <SelectValue placeholder="Select head coordinator" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Unassigned / Vacant</SelectItem>
                    {(Array.isArray(deptHeads) ? deptHeads : []).map(head => (
                      <SelectItem key={head.id} value={head.id}>
                        {head.displayName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="dept-desc" className="text-xs font-bold text-neutral-500">Description</Label>
              <textarea
                id="dept-desc"
                placeholder="Brief summary describing the academic programs or focus area of this department..."
                rows={3}
                value={deptForm.description}
                onChange={(e) => setDeptForm(prev => ({ ...prev, description: e.target.value }))}
                className="w-full rounded-xl border border-neutral-200 text-xs p-3 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#1d58d9]"
              />
            </div>

            <DialogFooter className="pt-4 flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setIsDeptModalOpen(false)}
                className="rounded-xl font-bold text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="bg-[#1d58d9] hover:bg-[#1644b5] text-white font-bold text-xs rounded-xl px-5"
              >
                {editingDept ? 'Update Department' : 'Create Department'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* SUBJECT SAVE MODAL */}
      <Dialog open={isSubjModalOpen} onOpenChange={(open) => !open && setIsSubjModalOpen(false)}>
        <DialogContent className="max-w-md bg-white rounded-2xl border-none p-6 shadow-2xl font-sans select-none">
          <DialogHeader>
            <DialogTitle className="text-base font-extrabold text-neutral-800">
              {editingSubj ? 'Modify Curriculum Subject' : 'Add New Curriculum Subject'}
            </DialogTitle>
            <DialogDescription className="text-xs text-neutral-400">
              Specify the department, course alphanumeric code, and unit details for this subject.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveSubj} className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="subj-dept" className="text-xs font-bold text-neutral-500">Department</Label>
                <Select
                  value={subjForm.departmentId}
                  onValueChange={(val: string | null) => {
                    if (val) setSubjForm(prev => ({ ...prev, departmentId: val }));
                  }}
                  disabled={isDeptHead && managedDeptIds.length <= 1} // Limit to their department if they only have one
                >
                  <SelectTrigger id="subj-dept" className="rounded-xl border-neutral-200 text-xs">
                    <SelectValue placeholder="Select department" />
                  </SelectTrigger>
                  <SelectContent>
                    {departments
                      .filter(d => !isDeptHead || d.departmentHeadId === user?.id)
                      .map(dept => (
                        <SelectItem key={dept.id} value={dept.id}>
                          {dept.code} - {dept.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="subj-units" className="text-xs font-bold text-neutral-500">Credit Units</Label>
                <Select
                  value={subjForm.units}
                  onValueChange={(val: string | null) => {
                    if (val) setSubjForm(prev => ({ ...prev, units: val }));
                  }}
                >
                  <SelectTrigger id="subj-units" className="rounded-xl border-neutral-200 text-xs">
                    <SelectValue placeholder="Units" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 Unit</SelectItem>
                    <SelectItem value="2">2 Units</SelectItem>
                    <SelectItem value="3">3 Units</SelectItem>
                    <SelectItem value="4">4 Units</SelectItem>
                    <SelectItem value="5">5 Units</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-1 space-y-1.5">
                <Label htmlFor="subj-code" className="text-xs font-bold text-neutral-500">Subject Code</Label>
                <Input
                  id="subj-code"
                  placeholder="e.g. CCS101"
                  value={subjForm.code}
                  onChange={(e) => setSubjForm(prev => ({ ...prev, code: e.target.value.toUpperCase() }))}
                  className="rounded-xl border-neutral-200 text-xs font-mono font-bold py-2"
                  required
                />
              </div>

              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="subj-name" className="text-xs font-bold text-neutral-500">Subject Name</Label>
                <Input
                  id="subj-name"
                  placeholder="e.g. Introduction to Computing"
                  value={subjForm.name}
                  onChange={(e) => setSubjForm(prev => ({ ...prev, name: e.target.value }))}
                  className="rounded-xl border-neutral-200 text-xs py-2"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="subj-desc" className="text-xs font-bold text-neutral-500">Description</Label>
              <textarea
                id="subj-desc"
                placeholder="Brief summary describing the course contents, pre-requisites, or syllabus objective..."
                rows={3}
                value={subjForm.description}
                onChange={(e) => setSubjForm(prev => ({ ...prev, description: e.target.value }))}
                className="w-full rounded-xl border border-neutral-200 text-xs p-3 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#1d58d9]"
              />
            </div>

            <DialogFooter className="pt-4 flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setIsSubjModalOpen(false)}
                className="rounded-xl font-bold text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="bg-[#1d58d9] hover:bg-[#1644b5] text-white font-bold text-xs rounded-xl px-5"
              >
                {editingSubj ? 'Update Subject' : 'Create Subject'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* DELETE CONFIRMATION MODAL */}
      <Dialog open={isDeleteOpen} onOpenChange={(open) => !open && setIsDeleteOpen(false)}>
        <DialogContent className="max-w-md bg-white rounded-2xl border-none p-6 shadow-2xl font-sans select-none text-center">
          <div className="w-14 h-14 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <Trash2 className="w-6 h-6" />
          </div>
          
          <h3 className="text-base font-extrabold text-neutral-800">
            Delete {deleteTarget?.type === 'dept' ? 'Department' : 'Curriculum Subject'}?
          </h3>
          <p className="text-xs text-neutral-500 mt-2 leading-relaxed">
            Are you sure you want to delete <strong className="text-neutral-700 font-extrabold">"{deleteTarget?.name}"</strong>?
            {deleteTarget?.type === 'dept' && " Doing so will also cascade and permanently remove all subjects registered under this department."}
            <br />This action is completely irreversible.
          </p>

          <div className="flex items-center justify-center gap-3 mt-6">
            <Button
              variant="ghost"
              onClick={() => setIsDeleteOpen(false)}
              className="rounded-xl font-bold text-xs"
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmDelete}
              className="bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl px-5"
            >
              Yes, Delete Permanently
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );

  function isDeptOpenModalHelper() {
    return isDeptModalOpen;
  }
};

export default Departments;
