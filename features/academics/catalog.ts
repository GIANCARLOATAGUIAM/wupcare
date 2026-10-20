// Official WUP academic catalog (client-supplied, 2026-10-21). Names and
// abbreviations are kept exactly as supplied. IDs are stable slugs and are
// the only identifiers stored: abbreviations are not unique (two programs
// use "BSRT").
//
// Migration 0014 seeds public.colleges and public.programs with exactly these
// rows (tests/academic-catalog.test.cjs keeps them in step), and the database
// enforces that a student's program belongs to the student's college.

export type College = { id: string; code: string; name: string };
export type Program = { id: string; collegeId: string; name: string; abbreviation: string };

export const COLLEGES: readonly College[] = [
  { id: "cas", code: "CAS", name: "College of Arts and Sciences" },
  { id: "cams", code: "CAMS", name: "College of Allied Medical Sciences" },
  { id: "cba", code: "CBA", name: "College of Business and Accountancy" },
  { id: "ccje", code: "CCJE", name: "College of Criminal Justice Education" },
  { id: "cect", code: "CECT", name: "College of Engineering and Computer Technology" },
  { id: "chtm", code: "CHTM", name: "College of Hospitality and Tourism Management" },
  { id: "coed", code: "COED", name: "College of Education" },
  { id: "con", code: "CON", name: "College of Nursing" },
];

export const PROGRAMS: readonly Program[] = [
  { id: "cas-ba-communication", collegeId: "cas", name: "Bachelor of Arts in Communication", abbreviation: "BA Communication" },
  { id: "cas-ba-political-science", collegeId: "cas", name: "Bachelor of Arts in Political Science", abbreviation: "BA Political Science" },
  { id: "cas-bs-psychology", collegeId: "cas", name: "Bachelor of Science in Psychology", abbreviation: "BS Psychology" },
  { id: "cas-bs-social-work", collegeId: "cas", name: "Bachelor of Science in Social Work", abbreviation: "BS Social Work" },

  { id: "cams-bs-medical-technology", collegeId: "cams", name: "Bachelor of Science in Medical Technology", abbreviation: "BSMT" },
  { id: "cams-bs-pharmacy", collegeId: "cams", name: "Bachelor of Science in Pharmacy", abbreviation: "BS Pharmacy" },
  { id: "cams-bs-physical-therapy", collegeId: "cams", name: "Bachelor of Science in Physical Therapy", abbreviation: "BSPT" },
  { id: "cams-bs-radiologic-technology", collegeId: "cams", name: "Bachelor of Science in Radiologic Technology", abbreviation: "BSRT" },
  { id: "cams-bs-respiratory-therapy", collegeId: "cams", name: "Bachelor of Science in Respiratory Therapy", abbreviation: "BSRT" },

  { id: "cba-bs-accountancy", collegeId: "cba", name: "Bachelor of Science in Accountancy", abbreviation: "BSA" },
  { id: "cba-bs-business-administration", collegeId: "cba", name: "Bachelor of Science in Business Administration", abbreviation: "BSBA" },
  { id: "cba-bs-management-accounting", collegeId: "cba", name: "Bachelor of Science in Management Accounting", abbreviation: "BSMA" },
  { id: "cba-bs-real-estate-management", collegeId: "cba", name: "Bachelor of Science in Real Estate Management", abbreviation: "BSREM" },
  { id: "cba-bs-accounting-information-management", collegeId: "cba", name: "Bachelor of Science in Accounting Information Management", abbreviation: "BSAIM" },

  { id: "ccje-bs-criminology", collegeId: "ccje", name: "Bachelor of Science in Criminology", abbreviation: "BS Crim" },

  { id: "cect-bs-information-technology", collegeId: "cect", name: "Bachelor of Science in Information Technology", abbreviation: "BSIT" },
  { id: "cect-bs-computer-engineering", collegeId: "cect", name: "Bachelor of Science in Computer Engineering", abbreviation: "BSCpE" },
  { id: "cect-bs-electronics-communications-engineering", collegeId: "cect", name: "Bachelor of Science in Electronics and Communications Engineering", abbreviation: "BSECE" },

  { id: "chtm-bs-tourism-management", collegeId: "chtm", name: "Bachelor of Science in Tourism Management", abbreviation: "BSTM" },
  { id: "chtm-bs-hospitality-management", collegeId: "chtm", name: "Bachelor of Science in Hospitality Management", abbreviation: "BSHM" },
  { id: "chtm-bs-nutrition-dietetics", collegeId: "chtm", name: "Bachelor of Science in Nutrition and Dietetics", abbreviation: "BSND" },

  { id: "coed-beed", collegeId: "coed", name: "Bachelor of Elementary Education", abbreviation: "BEEd" },
  { id: "coed-bsed", collegeId: "coed", name: "Bachelor of Secondary Education", abbreviation: "BSEd" },

  { id: "con-bs-nursing", collegeId: "con", name: "Bachelor of Science in Nursing", abbreviation: "BSN" },
];

const collegesById = new Map(COLLEGES.map((c) => [c.id, c]));
const programsById = new Map(PROGRAMS.map((p) => [p.id, p]));

export const collegeById = (id: string | null | undefined) => (id ? collegesById.get(id) : undefined);
export const programById = (id: string | null | undefined) => (id ? programsById.get(id) : undefined);
export const programsForCollege = (collegeId: string | null | undefined) => PROGRAMS.filter((p) => p.collegeId === collegeId);
export const programBelongsTo = (programId: string, collegeId: string) => programById(programId)?.collegeId === collegeId;

export const collegeLabel = (c: College) => `${c.name} (${c.code})`;
export const programLabel = (p: Program) => `${p.name} (${p.abbreviation})`;

// What to show for a student record. Catalog records use the official names
// (or codes/abbreviations when short); records saved before the catalog show
// their free text and are flagged so staff can update them.
export type AcademicRecord = { college_id?: string | null; program_id?: string | null; college?: string | null; program?: string | null; year_level?: number | null };

export function academicParts(s: AcademicRecord, short = false) {
  const college = collegeById(s.college_id);
  const program = programById(s.program_id);
  const parts = [
    college ? (short ? college.code : college.name) : s.college,
    program ? (short ? program.abbreviation : program.name) : s.program,
  ].filter((x): x is string => Boolean(x));
  return {
    parts,
    year: s.year_level ? `Year ${s.year_level}` : null,
    legacy: (!college && Boolean(s.college)) || (!program && Boolean(s.program)),
  };
}
