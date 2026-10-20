import { FilterBar, FilterSelect, SearchInput } from "@/components/app/list-controls";

const STATUS_OPTIONS = [
  { value: "", label: "All" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

/**
 * Account-list filters: the shared automatic filter bar (search waits 300 ms,
 * Status applies at once, ?page resets). `children` (the table) dims while
 * the new results load (see globals.css).
 */
export function AutoListFilters({
  initial,
  searchPlaceholder,
  children,
}: {
  initial: { q: string; status: string };
  searchPlaceholder: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <FilterBar label="Filter accounts">
        <SearchInput defaultValue={initial.q} placeholder={searchPlaceholder} />
        <FilterSelect name="status" label="Status" defaultValue={initial.status} options={STATUS_OPTIONS} className="sm:w-36" />
      </FilterBar>
      <div className="min-w-0">{children}</div>
    </>
  );
}
