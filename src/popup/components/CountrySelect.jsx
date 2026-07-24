import { localeFlagUrl } from '../../lib/assets';
import { ONBOARDING_COUNTRIES } from '../../config/onboarding-countries';

export default function CountrySelect({ title, busy, onSelect }) {
  return (
    <div className="country-select">
      <div className="country-select-grid" role="listbox" aria-label={title}>
        {ONBOARDING_COUNTRIES.map((country) => (
          <button
            key={country.locale}
            type="button"
            className="country-select-btn"
            role="option"
            disabled={busy}
            onClick={() => onSelect(country.locale)}
          >
            <img
              src={localeFlagUrl(country.locale)}
              alt=""
              className="country-select-flag"
              width={48}
              height={48}
              draggable={false}
            />
            <span className="country-select-label">{country.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}