'use client';

// Prints the page, or saves it as PDF from the browser's print dialog (the terms must be storable and reproducible).
export default function PrintButton({ label }: { label: string }) {
  return <button type="button" className="btn btn-sm print-hide" onClick={() => window.print()}>{label}</button>;
}
