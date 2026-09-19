/** Two falling tears overlaid on a farkling player's avatar.
 *  Render inside a `relative` container that wraps the circular avatar so the
 *  `inset-0` overlay lines up with the face, and the `overflow-hidden rounded-full`
 *  clips the tears to the circle. */
export function CryingTears() {
  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden rounded-full"
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 12 16"
        className="animate-tear absolute left-[30%] top-[30%] size-2 fill-sky-300"
      >
        <path d="M6 0C2.6 4.6 0.5 8 0.5 11a5.5 5.5 0 0 0 11 0C11.5 8 9.4 4.6 6 0Z" />
      </svg>
      <svg
        viewBox="0 0 12 16"
        className="animate-tear absolute left-[55%] top-[30%] size-2 fill-sky-300 [animation-delay:0.45s]"
      >
        <path d="M6 0C2.6 4.6 0.5 8 0.5 11a5.5 5.5 0 0 0 11 0C11.5 8 9.4 4.6 6 0Z" />
      </svg>
    </div>
  );
}
