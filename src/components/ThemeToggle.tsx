import { Icon } from "@/components/IconSprite";

export function ThemeToggle({ onToggle }: { onToggle: () => void }) {
  return (
    <button className="thm" onClick={onToggle} aria-label="Toggle theme">
      <div className="thm-knob" />
      <span className="thm-ic thm-sun">
        <Icon name="sun" size={17} />
      </span>
      <span className="thm-ic thm-moon">
        <Icon name="moon" size={17} />
      </span>
    </button>
  );
}
