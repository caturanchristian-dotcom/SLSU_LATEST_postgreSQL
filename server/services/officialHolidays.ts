export interface OfficialHolidayDef {
  name: string;
  date: string; // YYYY-MM-DD
  type: 'Regular' | 'Special Non-Working' | 'Special Working';
  description: string;
  category?: 'National' | 'Local' | 'Academic';
}

export const OFFICIAL_PHILIPPINE_HOLIDAYS: OfficialHolidayDef[] = [
  // ==================== 2026 OFFICIAL HOLIDAYS ====================
  // Regular Holidays 2026
  {
    name: "New Year's Day",
    date: "2026-01-01",
    type: "Regular",
    description: "Nationwide Regular Holiday celebrating the first day of the year (Republic Act No. 9492).",
    category: "National"
  },
  {
    name: "Eid al-Fitr (Feast of Ramadan)",
    date: "2026-03-20",
    type: "Regular",
    description: "Islamic feast marking the end of the Holy Month of Ramadan (Presidential Proclamation).",
    category: "National"
  },
  {
    name: "Maundy Thursday (Huwebes Santo)",
    date: "2026-04-02",
    type: "Regular",
    description: "Holy Week Christian observance commemorating the Last Supper (Republic Act No. 9492).",
    category: "National"
  },
  {
    name: "Good Friday (Biyernes Santo)",
    date: "2026-04-03",
    type: "Regular",
    description: "Holy Week Christian observance commemorating the Passion and Crucifixion of Jesus Christ.",
    category: "National"
  },
  {
    name: "Araw ng Kagitingan (Day of Valor)",
    date: "2026-04-09",
    type: "Regular",
    description: "National observance commemorating the heroism of Filipino and American soldiers during the Fall of Bataan (Executive Order No. 203).",
    category: "National"
  },
  {
    name: "Labor Day (Araw ng Paggawa)",
    date: "2026-05-01",
    type: "Regular",
    description: "Regular holiday honoring the economic and social contributions of workers and laborers.",
    category: "National"
  },
  {
    name: "Eid al-Adha (Feast of Sacrifice)",
    date: "2026-05-27",
    type: "Regular",
    description: "Islamic holiday commemorating Ibrahim's willingness to sacrifice his son in obedience to God.",
    category: "National"
  },
  {
    name: "Independence Day (Araw ng Kasarinlan)",
    date: "2026-06-12",
    type: "Regular",
    description: "Celebration of the Philippine Declaration of Independence from Spain on June 12, 1898.",
    category: "National"
  },
  {
    name: "National Heroes Day (Araw ng mga Bayani)",
    date: "2026-08-31",
    type: "Regular",
    description: "Regular holiday celebrated on the last Monday of August honoring all Philippine national heroes.",
    category: "National"
  },
  {
    name: "Bonifacio Day",
    date: "2026-11-30",
    type: "Regular",
    description: "Commemoration of the birth anniversary of Katipunan Supremo Andres Bonifacio.",
    category: "National"
  },
  {
    name: "Christmas Day (Araw ng Pasko)",
    date: "2026-12-25",
    type: "Regular",
    description: "Christian holiday celebrating the Nativity of Jesus Christ.",
    category: "National"
  },
  {
    name: "Rizal Day",
    date: "2026-12-30",
    type: "Regular",
    description: "Regular holiday commemorating the martyrdom of Philippine national hero Dr. Jose Rizal at Bagumbayan in 1896.",
    category: "National"
  },

  // Special Non-Working Days 2026
  {
    name: "First Philippine Republic Day",
    date: "2026-01-23",
    type: "Special Working",
    description: "Republic Act No. 11014 commemorating the inauguration of the First Philippine Republic in Malolos.",
    category: "National"
  },
  {
    name: "Chinese New Year (Spring Festival)",
    date: "2026-02-17",
    type: "Special Non-Working",
    description: "Celebration of the Lunar New Year and cultural heritage.",
    category: "National"
  },
  {
    name: "EDSA People Power Revolution Anniversary",
    date: "2026-02-25",
    type: "Special Non-Working",
    description: "Celebration of the historic peaceful revolution restoring democracy in the Philippines in 1986.",
    category: "National"
  },
  {
    name: "SLSU Charter Day / Foundation Day",
    date: "2026-03-07",
    type: "Special Non-Working",
    description: "Annual University Charter Day and Foundation Anniversary of Southern Leyte State University (Republic Act No. 9313).",
    category: "Academic"
  },
  {
    name: "Black Saturday (Sabado de Gloria)",
    date: "2026-04-04",
    type: "Special Non-Working",
    description: "Holy Week observance commemorating Jesus Christ's body lying in the tomb.",
    category: "National"
  },
  {
    name: "Southern Leyte Charter Day",
    date: "2026-07-01",
    type: "Special Non-Working",
    description: "Provincial holiday celebrating the creation of the province of Southern Leyte (Republic Act No. 2796).",
    category: "Local"
  },
  {
    name: "Ninoy Aquino Day",
    date: "2026-08-21",
    type: "Special Non-Working",
    description: "Commemoration of the assassination of former Senator Benigno 'Ninoy' Aquino Jr. (Republic Act No. 9256).",
    category: "National"
  },
  {
    name: "All Saints' Day (Undas)",
    date: "2026-11-01",
    type: "Special Non-Working",
    description: "Solemnity of All Saints, traditional family day visiting cemeteries and honoring departed saints and loved ones.",
    category: "National"
  },
  {
    name: "All Souls' Day",
    date: "2026-11-02",
    type: "Special Non-Working",
    description: "Additional special non-working day commemorating the faithful departed.",
    category: "National"
  },
  {
    name: "Feast of the Immaculate Conception of Mary",
    date: "2026-12-08",
    type: "Special Non-Working",
    description: "Special non-working holiday celebrating the Principal Patroness of the Philippines (Republic Act No. 10966).",
    category: "National"
  },
  {
    name: "Christmas Eve",
    date: "2026-12-24",
    type: "Special Non-Working",
    description: "Special non-working holiday in preparation for Christmas festivities.",
    category: "National"
  },
  {
    name: "Last Day of the Year (New Year's Eve)",
    date: "2026-12-31",
    type: "Special Non-Working",
    description: "Special non-working holiday celebrating the end of the calendar year.",
    category: "National"
  },

  // ==================== 2025 OFFICIAL HOLIDAYS ====================
  {
    name: "New Year's Day",
    date: "2025-01-01",
    type: "Regular",
    description: "Nationwide Regular Holiday (Proclamation No. 727, s. 2024).",
    category: "National"
  },
  {
    name: "Chinese New Year",
    date: "2025-01-29",
    type: "Special Non-Working",
    description: "Lunar New Year celebration (Proclamation No. 727, s. 2024).",
    category: "National"
  },
  {
    name: "EDSA People Power Revolution Anniversary",
    date: "2025-02-25",
    type: "Special Non-Working",
    description: "39th Anniversary of EDSA People Power Revolution.",
    category: "National"
  },
  {
    name: "SLSU Charter Day / Foundation Day",
    date: "2025-03-07",
    type: "Special Non-Working",
    description: "Annual University Charter Day of Southern Leyte State University.",
    category: "Academic"
  },
  {
    name: "Eid al-Fitr",
    date: "2025-03-31",
    type: "Regular",
    description: "Islamic feast marking the end of Ramadan (Proclamation No. 727).",
    category: "National"
  },
  {
    name: "Araw ng Kagitingan (Day of Valor)",
    date: "2025-04-09",
    type: "Regular",
    description: "Commemoration of Bataan veterans and heroes.",
    category: "National"
  },
  {
    name: "Maundy Thursday",
    date: "2025-04-17",
    type: "Regular",
    description: "Holy Week Christian observance.",
    category: "National"
  },
  {
    name: "Good Friday",
    date: "2025-04-18",
    type: "Regular",
    description: "Holy Week Christian observance.",
    category: "National"
  },
  {
    name: "Black Saturday",
    date: "2025-04-19",
    type: "Special Non-Working",
    description: "Holy Week Christian observance.",
    category: "National"
  },
  {
    name: "Labor Day",
    date: "2025-05-01",
    type: "Regular",
    description: "Workers and Laborers day celebration.",
    category: "National"
  },
  {
    name: "Eid al-Adha",
    date: "2025-06-06",
    type: "Regular",
    description: "Feast of Sacrifice (Proclamation No. 727).",
    category: "National"
  },
  {
    name: "Independence Day",
    date: "2025-06-12",
    type: "Regular",
    description: "Philippine Independence Day celebration.",
    category: "National"
  },
  {
    name: "Southern Leyte Charter Day",
    date: "2025-07-01",
    type: "Special Non-Working",
    description: "Provincial Foundation Day of Southern Leyte.",
    category: "Local"
  },
  {
    name: "Ninoy Aquino Day",
    date: "2025-08-21",
    type: "Special Non-Working",
    description: "Commemoration of Sen. Benigno Aquino Jr.",
    category: "National"
  },
  {
    name: "National Heroes Day",
    date: "2025-08-25",
    type: "Regular",
    description: "National Heroes Day (Last Monday of August).",
    category: "National"
  },
  {
    name: "All Saints' Day (Undas)",
    date: "2025-11-01",
    type: "Special Non-Working",
    description: "Solemnity of All Saints.",
    category: "National"
  },
  {
    name: "All Souls' Day",
    date: "2025-11-02",
    type: "Special Non-Working",
    description: "Commemoration of the faithful departed.",
    category: "National"
  },
  {
    name: "Bonifacio Day",
    date: "2025-11-30",
    type: "Regular",
    description: "Birth anniversary of Andres Bonifacio.",
    category: "National"
  },
  {
    name: "Feast of the Immaculate Conception",
    date: "2025-12-08",
    type: "Special Non-Working",
    description: "Principal Patroness of the Philippines.",
    category: "National"
  },
  {
    name: "Christmas Eve",
    date: "2025-12-24",
    type: "Special Non-Working",
    description: "Christmas Eve preparation.",
    category: "National"
  },
  {
    name: "Christmas Day",
    date: "2025-12-25",
    type: "Regular",
    description: "Nativity of Jesus Christ.",
    category: "National"
  },
  {
    name: "Rizal Day",
    date: "2025-12-30",
    type: "Regular",
    description: "Martyrdom of Dr. Jose Rizal.",
    category: "National"
  },
  {
    name: "Last Day of the Year",
    date: "2025-12-31",
    type: "Special Non-Working",
    description: "New Year's Eve countdown.",
    category: "National"
  },

  // ==================== 2027 OFFICIAL HOLIDAYS ====================
  {
    name: "New Year's Day",
    date: "2027-01-01",
    type: "Regular",
    description: "Nationwide Regular Holiday welcoming 2027.",
    category: "National"
  },
  {
    name: "Chinese New Year",
    date: "2027-02-06",
    type: "Special Non-Working",
    description: "Lunar New Year celebration.",
    category: "National"
  },
  {
    name: "EDSA People Power Revolution Anniversary",
    date: "2027-02-25",
    type: "Special Non-Working",
    description: "EDSA Revolution Anniversary.",
    category: "National"
  },
  {
    name: "Maundy Thursday",
    date: "2027-03-25",
    type: "Regular",
    description: "Holy Week Christian observance.",
    category: "National"
  },
  {
    name: "Good Friday",
    date: "2027-03-26",
    type: "Regular",
    description: "Holy Week Christian observance.",
    category: "National"
  },
  {
    name: "Black Saturday",
    date: "2027-03-27",
    type: "Special Non-Working",
    description: "Holy Week Christian observance.",
    category: "National"
  },
  {
    name: "Araw ng Kagitingan (Day of Valor)",
    date: "2027-04-09",
    type: "Regular",
    description: "Commemoration of Bataan veterans and heroes.",
    category: "National"
  },
  {
    name: "Labor Day",
    date: "2027-05-01",
    type: "Regular",
    description: "Workers and Laborers day celebration.",
    category: "National"
  },
  {
    name: "Independence Day",
    date: "2027-06-12",
    type: "Regular",
    description: "Philippine Independence Day.",
    category: "National"
  },
  {
    name: "National Heroes Day",
    date: "2027-08-30",
    type: "Regular",
    description: "National Heroes Day (Last Monday of August).",
    category: "National"
  },
  {
    name: "Bonifacio Day",
    date: "2027-11-30",
    type: "Regular",
    description: "Birth anniversary of Andres Bonifacio.",
    category: "National"
  },
  {
    name: "Feast of the Immaculate Conception",
    date: "2027-12-08",
    type: "Special Non-Working",
    description: "Principal Patroness of the Philippines.",
    category: "National"
  },
  {
    name: "Christmas Eve",
    date: "2027-12-24",
    type: "Special Non-Working",
    description: "Christmas Eve celebration.",
    category: "National"
  },
  {
    name: "Christmas Day",
    date: "2027-12-25",
    type: "Regular",
    description: "Nativity of Jesus Christ.",
    category: "National"
  },
  {
    name: "Rizal Day",
    date: "2027-12-30",
    type: "Regular",
    description: "Martyrdom of Dr. Jose Rizal.",
    category: "National"
  },
  {
    name: "Last Day of the Year",
    date: "2027-12-31",
    type: "Special Non-Working",
    description: "New Year's Eve.",
    category: "National"
  }
];

function toLocalDateStr(val: any): string {
  if (!val) return '';
  if (val instanceof Date) {
    const year = val.getFullYear();
    const month = String(val.getMonth() + 1).padStart(2, '0');
    const day = String(val.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return String(val).split('T')[0];
}

/**
 * Seeds or synchronizes the official Philippine holidays into the database.
 * If force is true, or if only test dummy records exist (<= 3 or random test names),
 * it cleans out test dummy records and populates official real calendar holidays.
 */
export async function syncOfficialHolidays(db: any, force: boolean = false): Promise<{ count: number; updated: boolean }> {
  try {
    const existing = await db.prepare("SELECT * FROM holidays").all() as any[];

    // First deduplicate any existing records
    const seenKeys = new Map<string, string>();
    const duplicateIds: string[] = [];
    for (const h of existing) {
      const dateStr = toLocalDateStr(h.date);
      const key = `${dateStr}::${String(h.name || '').trim().toLowerCase()}`;
      if (seenKeys.has(key)) {
        duplicateIds.push(h.id);
      } else {
        seenKeys.set(key, h.id);
      }
    }
    for (const dupId of duplicateIds) {
      await db.prepare("DELETE FROM holidays WHERE id = ?").run(dupId);
    }

    const isDummyOnly = existing.length <= 3 && existing.every((h: any) => {
      const lower = String(h.name || '').toLowerCase();
      return lower === 'dsdsd' || lower === 'jj' || lower.includes('test') || lower.length <= 3;
    });

    if (!force && existing.length >= 15 && !isDummyOnly) {
      return { count: existing.length - duplicateIds.length, updated: false };
    }

    // Clean out known dummy records or if force sync requested
    if (force || isDummyOnly) {
      await db.prepare("DELETE FROM holidays WHERE LOWER(name) IN ('dsdsd', 'jj', 'test', 'dummy') OR LENGTH(name) <= 2").run();
    }

    let insertedCount = 0;
    const remainingHols = await db.prepare("SELECT date, name FROM holidays").all() as any[];
    const existingDates = new Set(remainingHols.map((h: any) => {
      const d = toLocalDateStr(h.date);
      return `${d}::${String(h.name).toLowerCase().trim()}`;
    }));

    for (const h of OFFICIAL_PHILIPPINE_HOLIDAYS) {
      const key = `${h.date}::${h.name.toLowerCase().trim()}`;
      if (!existingDates.has(key)) {
        const id = `hol-${h.date}-${Math.random().toString(36).substring(2, 7)}`;
        await db.prepare(`
          INSERT INTO holidays (id, name, date, type, description)
          VALUES (?, ?, ?, ?, ?)
        `).run(id, h.name, h.date, h.type, h.description);
        insertedCount++;
        existingDates.add(key);
      }
    }

    return { count: insertedCount, updated: true };
  } catch (err) {
    console.error("[Holidays] Failed to sync official holidays:", err);
    throw err;
  }
}
