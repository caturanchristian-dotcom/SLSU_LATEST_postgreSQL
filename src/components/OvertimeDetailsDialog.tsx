import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from './ui/dialog';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Clock, CheckCircle2, User, FileText, Calendar, ExternalLink } from 'lucide-react';
import { format } from 'date-fns';
import { formatTimeRange, OvertimeRequestRecord } from '../lib/dtrOvertimeHelper';

interface OvertimeDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dateStr: string;
  requests: OvertimeRequestRecord[];
  dayNumber?: number;
}

export const OvertimeDetailsDialog: React.FC<OvertimeDetailsDialogProps> = ({
  open,
  onOpenChange,
  dateStr,
  requests,
  dayNumber
}) => {
  if (!requests || requests.length === 0) return null;

  let formattedDate = dateStr;
  try {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
      formattedDate = format(d, 'EEEE, MMMM dd, yyyy');
    }
  } catch (e) {
    formattedDate = dateStr;
  }

  // Calculate total approved hours
  const totalApprovedHours = requests.reduce((acc, r) => {
    return acc + Number(r.payableHours ?? r.approvedHours ?? r.requestedHours ?? 0);
  }, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md w-full bg-white rounded-3xl p-6 shadow-2xl border border-neutral-100 font-sans">
        <DialogHeader className="pb-3 border-b border-neutral-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-50 text-[#1d58d9] flex items-center justify-center">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-black text-neutral-900 tracking-tight flex items-center gap-2">
                Approved Overtime Details
                <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] font-bold px-2 py-0.5">
                  CSC Form 48 Record
                </Badge>
              </DialogTitle>
              <DialogDescription className="text-xs text-neutral-500 flex items-center gap-1.5 mt-0.5">
                <Calendar className="w-3.5 h-3.5 text-neutral-400" />
                {formattedDate} {dayNumber ? `(Day ${dayNumber})` : ''}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="py-3 space-y-4 max-h-[60vh] overflow-y-auto pr-1">
          {requests.map((req, idx) => {
            const approvedHr = Number(req.payableHours ?? req.approvedHours ?? req.requestedHours ?? 0);
            return (
              <div 
                key={req.id || idx} 
                className="bg-neutral-50/70 border border-neutral-200/80 rounded-2xl p-4 space-y-3"
              >
                {requests.length > 1 && (
                  <div className="flex items-center justify-between border-b border-neutral-200 pb-2">
                    <span className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider">
                      Overtime Session #{idx + 1}
                    </span>
                    <Badge className="bg-emerald-100 text-emerald-800 border-none text-[9.5px] font-extrabold">
                      Approved
                    </Badge>
                  </div>
                )}

                {/* Requested Time & Approved Hours */}
                <div className="grid grid-cols-2 gap-3 bg-white p-3 rounded-xl border border-neutral-200/70">
                  <div>
                    <span className="text-[10px] font-semibold text-neutral-400 block uppercase tracking-wider">
                      Requested Time
                    </span>
                    <span className="text-xs font-bold font-mono text-neutral-800">
                      {formatTimeRange(req.startTime, req.endTime)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] font-semibold text-neutral-400 block uppercase tracking-wider">
                      Approved Hours
                    </span>
                    <span className="text-xs font-black font-mono text-[#1d58d9]">
                      {approvedHr.toFixed(2)} hours
                    </span>
                  </div>
                </div>

                {/* Status */}
                <div className="flex items-center justify-between text-xs">
                  <span className="text-neutral-500 font-medium">Status:</span>
                  <span className="inline-flex items-center gap-1 font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200/70 text-[11px]">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Approved
                  </span>
                </div>

                {/* Reason */}
                <div className="space-y-1">
                  <span className="text-[10.5px] font-semibold text-neutral-500 flex items-center gap-1">
                    <FileText className="w-3 h-3 text-neutral-400" />
                    Purpose / Justification:
                  </span>
                  <p className="text-xs text-neutral-800 bg-white p-2.5 rounded-xl border border-neutral-200 leading-relaxed font-normal">
                    {req.reason || 'Official university services and urgent institutional deliverables.'}
                  </p>
                </div>

                {/* Approver info */}
                <div className="pt-1 border-t border-neutral-200/70 flex items-center justify-between text-xs">
                  <span className="text-neutral-400 text-[11px] flex items-center gap-1">
                    <User className="w-3 h-3 text-neutral-400" /> Approved By:
                  </span>
                  <span className="font-bold text-neutral-700">
                    {req.approverName || 'Department Supervisor / Campus Director'}
                  </span>
                </div>

                {req.approvalRemarks && (
                  <div className="text-[11px] text-neutral-500 italic bg-blue-50/50 p-2 rounded-lg border border-blue-100">
                    <strong className="text-neutral-700 font-semibold not-italic">Remarks: </strong>
                    {req.approvalRemarks}
                  </div>
                )}

                {req.documentUrl && (
                  <div className="pt-1">
                    <a
                      href={req.documentUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] text-[#1d58d9] hover:underline font-semibold inline-flex items-center gap-1"
                    >
                      <ExternalLink className="w-3 h-3" /> View Uploaded Authority to Work OT
                    </a>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Total Summary Footer */}
        <div className="mt-1 p-3 bg-blue-50/70 rounded-2xl border border-blue-100 flex items-center justify-between text-xs">
          <span className="text-neutral-600 font-medium">Daily Overtime Credit:</span>
          <span className="font-black text-[#1d58d9] text-sm">
            {totalApprovedHours.toFixed(2)} hours
          </span>
        </div>

        <DialogFooter className="pt-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="w-full rounded-xl border-neutral-200 text-xs font-bold text-neutral-700 h-9"
          >
            Close Details
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
