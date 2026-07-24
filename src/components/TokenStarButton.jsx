export default function TokenStarButton({
  starred = false,
  onClick,
  ariaLabel,
  className = '',
}) {
  return (
    <button
      type="button"
      className={`token-star-btn${starred ? ' is-starred' : ''}${className ? ` ${className}` : ''}`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick?.(e);
      }}
      aria-label={ariaLabel}
      aria-pressed={starred}
      title={ariaLabel}
    >
      <svg
        className="token-star-icon"
        viewBox="0 0 24 24"
        width="18"
        height="18"
        aria-hidden="true"
        focusable="false"
      >
        <path
          d="M12 2.5l2.76 5.59 6.17.9-4.47 4.35 1.05 6.14L12 17.02l-5.51 2.9 1.05-6.14-4.47-4.35 6.17-.9L12 2.5z"
          fill={starred ? '#f5c518' : 'none'}
          stroke={starred ? '#f5c518' : 'currentColor'}
          strokeWidth="1.75"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
