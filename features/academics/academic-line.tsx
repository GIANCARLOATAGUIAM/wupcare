import { academicParts, type AcademicRecord } from "./catalog";

// " · College · Program · Year N" after a student's number, with a marker
// when the college or program is free text from before the official catalog.
export function AcademicLine({ student }: { student: AcademicRecord }) {
  const { parts, year, legacy } = academicParts(student);
  return (
    <>
      {[...parts, year].filter(Boolean).map((x) => ` · ${x}`)}
      {legacy ? <span className="ml-1.5 text-xs text-warning-foreground">(not from the official list; update in Edit)</span> : null}
    </>
  );
}
