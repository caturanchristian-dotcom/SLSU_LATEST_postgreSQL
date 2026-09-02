export const SLSU_CAMPUSES = [
  'Hinunangan Campus',
  'Sogod (Main) Campus',
  'Tomas Oppus Campus',
  'Bontoc Campus',
  'San Juan Campus'
] as const;

export type SLSUCampus = typeof SLSU_CAMPUSES[number];
