/** Fueguito de las rachas: encendido (con su parpadeo) o apagado (gris). */
export default function Flame({ size = 24, lit = true, className }: { size?: number; lit?: boolean; className?: string }) {
  return (
    <svg
      className={`flame${lit ? ' flame--lit' : ' flame--out'}${className ? ` ${className}` : ''}`}
      width={size * 0.75}
      height={size}
      viewBox="0 0 24 32"
      aria-hidden="true"
    >
      <path
        className="flame__outer"
        d="M12 0C14 6 22 10 22 19.5C22 26.4 17.5 31.5 12 31.5S2 26.4 2 19.5C2 14.6 4.6 11.2 7.2 8.2C7.6 11.2 9 13.3 10.6 13.8C9.6 9.2 10.4 4.2 12 0Z"
      />
      <path
        className="flame__inner"
        d="M12.2 14C13.8 17.6 17.2 19.8 17.2 24C17.2 27.4 14.9 30 12 30S6.8 27.4 6.8 24C6.8 21.3 8.4 19.4 9.8 17.8C10.2 19.2 11 20 12 20.3C11.4 18.2 11.5 16 12.2 14Z"
      />
    </svg>
  )
}
