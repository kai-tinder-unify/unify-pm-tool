import { useEffect, useMemo, useRef, useState } from 'react';

/**
 * Searchable text combobox. Type to filter `options`; click or press Enter to pick a
 * suggestion, or just type a value that isn't in the list (free-text "add new"). The
 * input text IS the value, so the parent treats it like a normal controlled input and
 * the existing options are only suggestions.
 */
export default function Combobox({
  value,
  onChange,
  options,
  placeholder,
  required,
  newLabel,
  onCommit,
}: {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  required?: boolean;
  /** Label for the "use what I typed as a new entry" row; omit to hide that row. */
  newLabel?: (typed: string) => string;
  /** Fired when a value is committed (a suggestion is chosen or the field blurs). Use
   *  for inline / auto-save fields; plain form fields can ignore it and read `value`. */
  onCommit?: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const wrapRef = useRef<HTMLDivElement>(null);

  const q = value.trim().toLowerCase();
  const filtered = useMemo(() => {
    const base = q ? options.filter((o) => o.toLowerCase().includes(q)) : options;
    return base.slice(0, 50);
  }, [options, q]);

  const showNew = !!newLabel && value.trim().length > 0 && !options.some((o) => o.toLowerCase() === q);
  const rowCount = filtered.length + (showNew ? 1 : 0);

  // Close on outside click while open.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  // Selecting an existing option sets the value; the "add new" row (index === filtered.length)
  // keeps the typed text. Either way we commit the picked value and close the menu.
  const chooseIndex = (i: number) => {
    const picked = i >= 0 && i < filtered.length ? filtered[i] : value;
    if (i >= 0 && i < filtered.length) onChange(filtered[i]);
    onCommit?.(picked.trim());
    setOpen(false);
    setActive(-1);
  };

  return (
    <div className="relative" ref={wrapRef}>
      <input
        className="input"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => onCommit?.(value.trim())}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setOpen(true);
            setActive((a) => Math.min(a + 1, rowCount - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === 'Enter' && open && active >= 0 && active < rowCount) {
            e.preventDefault();
            chooseIndex(active);
          } else if (e.key === 'Escape') {
            setOpen(false);
            setActive(-1);
          }
        }}
        placeholder={placeholder}
        required={required}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        autoComplete="off"
      />
      {open && rowCount > 0 && (
        <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-line bg-white py-1 text-sm shadow-card">
          {filtered.map((o, i) => (
            <li key={o}>
              <button
                type="button"
                className={`w-full px-3 py-1.5 text-left transition-colors ${
                  active === i ? 'bg-aqua/10 text-navy' : 'text-ink hover:bg-paper-deep'
                }`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  chooseIndex(i);
                }}
                onMouseEnter={() => setActive(i)}
              >
                {o}
              </button>
            </li>
          ))}
          {showNew && (
            <li>
              <button
                type="button"
                className={`w-full px-3 py-1.5 text-left transition-colors ${
                  active === filtered.length ? 'bg-aqua/10 text-navy' : 'text-muted hover:bg-paper-deep'
                }`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  chooseIndex(filtered.length);
                }}
                onMouseEnter={() => setActive(filtered.length)}
              >
                {newLabel!(value.trim())}
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
