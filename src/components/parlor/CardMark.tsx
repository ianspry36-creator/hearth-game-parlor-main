/** The parlour's playing-card brand mark. */
export function CardMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="currentColor">
      <path
        fillRule="evenodd"
        d="M7 2.5H17a2.5 2.5 0 0 1 2.5 2.5v14A2.5 2.5 0 0 1 17 21.5H7a2.5 2.5 0 0 1-2.5-2.5V5A2.5 2.5 0 0 1 7 2.5ZM12 7l5.5 5-5.5 5-5.5-5Z"
      />
    </svg>
  );
}
