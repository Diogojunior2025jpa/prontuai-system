export default function BrandMark({ className = "size-6" }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 48 48"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M20 7a5 5 0 0 1 10 0v10h10a5 5 0 0 1 0 10H30v10a5 5 0 0 1-10 0V27H10a5 5 0 0 1 0-10h10V7Z"
        stroke="#22D3EE"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="3.5"
      />
      <path
        d="m8 27 9 8 23-25"
        stroke="#818CF8"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="4.5"
      />
    </svg>
  );
}
