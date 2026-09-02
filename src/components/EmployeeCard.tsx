import React from 'react';
import { 
  Briefcase, 
  Mail, 
  Edit2, 
  Trash2, 
  Check, 
  User,
  Building2
} from 'lucide-react';
import { Button } from './ui/button';
import { formatCurrency } from '../lib/utils';

export interface Employee {
  id: string;
  employeeId: string;
  firstName: string;
  lastName: string;
  email: string;
  category: string;
  basicSalary: number;
  salaryType: string;
  status: string;
  phoneNumber?: string;
  bpno?: string;
  mi?: string;
  prefix?: string;
  appellation?: string;
  position?: string;
  profileImage?: string;
  employeeNo?: string;
  teachingDepartmentId?: string;
  campus?: string;
}

interface EmployeeCardProps {
  emp: Employee;
  onEdit: (emp: Employee) => void;
  onDelete: (id: string) => void;
  onViewDetails: (emp: Employee) => void;
  departments?: any[];
}

const capitalizeName = (str: string): string => {
  if (!str) return '';
  return str
    .split(/\s+/)
    .map(word => {
      if (!word) return '';
      if (word.includes('-')) {
        return word
          .split('-')
          .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
          .join('-');
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
};

export const EmployeeCard: React.FC<EmployeeCardProps> = ({
  emp,
  onEdit,
  onDelete,
  onViewDetails,
  departments = []
}) => {
  const empNoNum = (emp.employeeNo || emp.bpno || '').replace(/\D/g, '');
  const formattedEmpNo = empNoNum ? `Emp-${empNoNum.slice(-3).padStart(3, '0')}` : `Emp-${String(emp.id).slice(-3)}`;

  return (
    <div className="border border-neutral-200/80 rounded-2xl bg-white shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden flex flex-col group">
      {/* Card Header with Royal Blue Background */}
      <div className="bg-[#1e74f1] h-28 relative flex items-center justify-center p-4">
        {/* Active Status Badge */}
        {emp.status === 'active' ? (
          <div className="absolute top-3 right-3 flex items-center gap-1 bg-emerald-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm">
            <Check className="w-3 h-3 stroke-[3px]" />
            Active
          </div>
        ) : (
          <div className="absolute top-3 right-3 flex items-center gap-1 bg-neutral-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm">
            Inactive
          </div>
        )}
        
        {/* Center Avatar */}
        <div 
          className="absolute -bottom-8 w-20 h-20 rounded-full border-4 border-white bg-white shadow-md overflow-hidden flex items-center justify-center cursor-pointer hover:scale-105 transition-transform"
          onClick={() => onViewDetails(emp)}
        >
          {emp.profileImage ? (
            <img 
              src={emp.profileImage} 
              alt={`${emp.firstName} ${emp.lastName}`} 
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-neutral-100 to-neutral-200 flex items-center justify-center font-bold text-neutral-600 text-sm">
              {emp.firstName ? emp.firstName[0] : ''}{emp.lastName ? emp.lastName[0] : ''}
            </div>
          )}
        </div>
      </div>

      {/* Card Content */}
      <div className="pt-10 pb-4 px-5 flex-1 flex flex-col items-center">
        {/* Name */}
        <h3 
          className="font-bold text-neutral-800 text-base text-center tracking-tight cursor-pointer hover:text-[#1e74f1] transition-colors line-clamp-1"
          onClick={() => onViewDetails(emp)}
        >
          {[emp.lastName ? String(emp.lastName).toUpperCase() : '', capitalizeName(emp.firstName || '')].filter(Boolean).join(' ') || 'Unnamed Employee'}
        </h3>

        {/* ID Badge */}
        <span className="bg-neutral-500 text-white text-[10px] font-bold px-3 py-0.5 rounded-full mt-1.5 mb-4 shadow-sm tracking-wide">
          {formattedEmpNo}
        </span>

        {/* Metadata fields with icons to match image exactly */}
        <div className="w-full space-y-2.5 px-1 text-xs text-neutral-600 font-sans font-medium mb-4 flex-1">
          {/* Department/Position */}
          <div className="flex items-center gap-2.5">
            <Briefcase className="w-3.5 h-3.5 text-sky-400 shrink-0" />
            <span className="truncate text-neutral-800" title={emp.position || emp.category}>
              {emp.position || emp.category}
            </span>
          </div>
          
          {/* Email */}
          <div className="flex items-center gap-2.5">
            <Mail className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
            <span className="truncate text-neutral-500" title={emp.email}>
              {emp.email}
            </span>
          </div>

          {/* Phone */}
          <div className="flex items-center gap-2.5">
            <div className="w-3.5 h-3.5 flex items-center justify-center text-neutral-400 shrink-0">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
              </svg>
            </div>
            <span className="truncate text-neutral-500">
              {emp.phoneNumber || '5522336699'}
            </span>
          </div>

          {/* Campus */}
          <div className="flex items-center gap-2.5">
            <Building2 className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
            <span className="truncate text-neutral-700 font-semibold" title={emp.campus || 'Hinunangan Campus'}>
              {emp.campus || 'Hinunangan Campus'}
            </span>
          </div>

          {/* Category */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <User className="w-3.5 h-3.5 text-blue-500 shrink-0" />
            <span className="bg-blue-50 text-blue-700 text-[10px] font-extrabold px-2 py-0.5 rounded border border-blue-100 uppercase tracking-wider">
              {emp.category?.replace('-', ' ') || ''}
            </span>
            {emp.category?.toLowerCase() === 'visiting instructor' && emp.teachingDepartmentId && (
              <span className="bg-amber-50 text-amber-700 text-[10px] font-extrabold px-2 py-0.5 rounded border border-amber-100 uppercase tracking-wider">
                Dept: {departments.find(d => d.id === emp.teachingDepartmentId)?.code || emp.teachingDepartmentId}
              </span>
            )}
          </div>

          {/* Salary */}
          <div className="flex items-center gap-1.5 text-neutral-800 font-bold text-sm pt-0.5">
            <span className="text-emerald-500 font-bold">₱</span>
            <span>{formatCurrency(emp.basicSalary)}</span>
          </div>
        </div>

        {/* Buttons section matching image footer */}
        <div className="w-full grid grid-cols-2 gap-2 pt-3 border-t border-neutral-100">
          <Button 
            variant="outline" 
            size="sm" 
            className="h-9 gap-1.5 text-xs font-semibold border-neutral-200 hover:bg-neutral-50 rounded-xl text-neutral-700 w-full"
            onClick={() => onEdit(emp)}
          >
            <Edit2 className="w-3 h-3 text-neutral-400" />
            Edit
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            className="h-9 gap-1.5 text-xs font-semibold border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300 rounded-xl w-full"
            onClick={() => onDelete(emp.id)}
          >
            <Trash2 className="w-3 h-3 text-red-400" />
            Delete
          </Button>
        </div>
      </div>
    </div>
  );
};
