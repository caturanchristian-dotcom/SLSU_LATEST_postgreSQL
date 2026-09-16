export const SLSU_CAMPUSES = [
  'Hinunangan Campus',
  'Sogod (Main) Campus',
  'Tomas Oppus Campus',
  'Bontoc Campus',
  'San Juan Campus'
] as const;

export type SLSUCampus = typeof SLSU_CAMPUSES[number];

export const SLSU_LOGO_URL = 'https://upload.wikimedia.org/wikipedia/commons/0/0d/Southern_Leyte_State_University.png?utm_source=en.wikipedia.org&utm_campaign=index&utm_content=original';
export const SLSU_LOGO_FALLBACK_URL = '/slsu-logo.png';

