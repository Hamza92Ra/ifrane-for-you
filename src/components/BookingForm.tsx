"use client";
import { useEffect, useState } from "react";
import type { Locale } from "@/i18n";
import { bookingText } from "@/i18n/booking";
import { getBookingUrl } from "@/content/booking";

type StayOption = { slug: string; name: string };
type PriceEstimate = {
  nights: number;
  currency: string;
  total: number;
  averageNightly: number;
  basePrice: number | null;
  hasSpecialRates: boolean;
};
type Confirmation = {
  reference: string;
  status: "PENDING";
  type: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  priceEstimate?: PriceEstimate | null;
};

export function BookingForm({ locale, initialStay, options }: { locale: Locale; initialStay?: string; options: StayOption[] }) {
  const t = bookingText[locale];
  const [step, setStep] = useState(1);
  const [stay, setStay] = useState(initialStay ?? options[0]?.slug ?? "");
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [guests, setGuests] = useState(1);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [privacy, setPrivacy] = useState(false);
  const [available, setAvailable] = useState<number | null>(null);
  const [maxGuests, setMaxGuests] = useState<number | null>(null);
  const [priceEstimate, setPriceEstimate] = useState<PriceEstimate | null>(null);
  const [whatsapp, setWhatsapp] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  const today = new Date().toISOString().slice(0, 10);
  const stayName = (slug: string) => options.find((option) => option.slug === slug)?.name ?? slug;

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/public/settings", { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setWhatsapp(data.whatsapp);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  const message = (code: string) =>
    ({
      INVALID_DATES: t.invalidDates,
      INVALID_INPUT: t.invalidInput,
      RATE_LIMITED: t.rateLimited,
      UNAVAILABLE: t.unavailable,
      NOT_CONFIGURED: t.notConfigured,
      CAPACITY: t.capacity,
      SERVICE_UNAVAILABLE: t.serviceError,
      ALREADY_PROCESSED: t.alreadyProcessed
    }[code] ?? t.serviceError);

  const resetAvailability = () => {
    setAvailable(null);
    setPriceEstimate(null);
    setError("");
    setRequestKey(crypto.randomUUID());
  };

  const formatNumber = (num: number) => num.toLocaleString(locale === "ar" ? "ar-MA" : locale === "en" ? "en-US" : "fr-FR");

  async function checkAvailability() {
    setError("");
    setBusy(true);
    try {
      const query = new URLSearchParams({ type: stay, checkIn, checkOut, guests: String(guests) });
      const response = await fetch(`/api/availability?${query}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "SERVICE_UNAVAILABLE");
      if (!data.configured) throw new Error("NOT_CONFIGURED");
      if (guests > data.maxGuests) throw new Error("CAPACITY");
      setAvailable(data.available);
      setMaxGuests(data.maxGuests);
      setPriceEstimate(data.priceEstimate ?? null);
      if (!data.available) throw new Error("UNAVAILABLE");
      setStep(3);
    } catch (cause) {
      setError(message(cause instanceof Error ? cause.message : "SERVICE_UNAVAILABLE"));
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    setError("");
    setBusy(true);
    try {
      const response = await fetch("/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: stay, checkIn, checkOut, guests, name, email, phone, requestKey, privacyAccepted: privacy })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "SERVICE_UNAVAILABLE");
      setConfirmation(data);
      setStep(4);
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : "SERVICE_UNAVAILABLE";
      setError(message(code));
      if (code === "UNAVAILABLE") {
        setAvailable(0);
        setStep(2);
      }
    } finally {
      setBusy(false);
    }
  }

  if (confirmation) {
    return (
      <div className="booking-confirmation" role="status">
        <span className="booking-check" aria-hidden="true">✓</span>
        <p className="eyebrow">{t.status}: {t.pending}</p>
        <h2>{t.confirmationTitle}</h2>
        <p>{t.confirmationBody}</p>
        <dl>
          <div><dt>{t.reference}</dt><dd>{confirmation.reference}</dd></div>
          <div><dt>{t.stay}</dt><dd>{stayName(confirmation.type)}</dd></div>
          <div><dt>{t.checkIn} / {t.checkOut}</dt><dd>{confirmation.checkIn} → {confirmation.checkOut}</dd></div>
          <div><dt>{t.guests}</dt><dd>{confirmation.guests}</dd></div>
          {confirmation.priceEstimate && (
            <div>
              <dt>{t.estimatedPrice}</dt>
              <dd>{formatNumber(confirmation.priceEstimate.total)} {confirmation.priceEstimate.currency} ({confirmation.priceEstimate.nights} nuits)</dd>
            </div>
          )}
          <div><dt>{t.status}</dt><dd>{t.pending}</dd></div>
        </dl>
        <button
          type="button"
          className="button button--dark"
          onClick={() => {
            setConfirmation(null);
            setStep(1);
            resetAvailability();
          }}
        >
          {t.newRequest}
        </button>
      </div>
    );
  }

  return (
    <div className="booking-form">
      <div className="booking-progress" aria-label={t.stepOf.replace("{current}", String(step))}>
        <span className={step >= 1 ? "active" : ""}>01</span>
        <span className={step >= 2 ? "active" : ""}>02</span>
        <span className={step >= 3 ? "active" : ""}>03</span>
      </div>

      {step === 1 && (
        <div className="booking-step">
          <p className="eyebrow">{t.stepOf.replace("{current}", "1")}</p>
          <h2>{t.step1}</h2>
          <div className="booking-fields">
            <label>
              {t.stay}
              <select
                value={stay}
                onChange={(e) => {
                  setStay(e.target.value);
                  resetAvailability();
                }}
              >
                {options.map((option) => (
                  <option value={option.slug} key={option.slug}>{option.name}</option>
                ))}
              </select>
            </label>
            <label>
              {t.checkIn}
              <input
                type="date"
                min={today}
                value={checkIn}
                onChange={(e) => {
                  setCheckIn(e.target.value);
                  resetAvailability();
                }}
                required
              />
            </label>
            <label>
              {t.checkOut}
              <input
                type="date"
                min={checkIn || today}
                value={checkOut}
                onChange={(e) => {
                  setCheckOut(e.target.value);
                  resetAvailability();
                }}
                required
              />
            </label>
          </div>
          <div className="booking-actions">
            <button
              type="button"
              className="button button--dark"
              onClick={() => {
                if (!checkIn || !checkOut || checkOut <= checkIn || checkIn < today) {
                  setError(t.invalidDates);
                  return;
                }
                setError("");
                setStep(2);
              }}
            >
              {t.next}
              <span aria-hidden="true">→</span>
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="booking-step">
          <p className="eyebrow">{t.stepOf.replace("{current}", "2")}</p>
          <h2>{t.step2}</h2>
          <p className="booking-summary">{stayName(stay)} · {checkIn} → {checkOut}</p>
          <div className="booking-fields">
            <label>
              {t.guests}
              <input
                type="number"
                inputMode="numeric"
                min="1"
                max={maxGuests ?? 20}
                value={guests}
                onChange={(e) => {
                  setGuests(Number(e.target.value));
                  setAvailable(null);
                }}
                required
              />
            </label>
          </div>
          {available !== null && available > 0 && (
            <p className="booking-availability">{t.available.replace("{count}", String(available))}</p>
          )}
          {priceEstimate && (
            <p className="booking-price-estimate">
              {t.estimatedTotal
                .replace("{total}", formatNumber(priceEstimate.total))
                .replace("{currency}", priceEstimate.currency)
                .replace("{nights}", String(priceEstimate.nights))}
            </p>
          )}
          <p className="booking-note">{t.pendingNote}</p>
          <div className="booking-actions">
            <button type="button" className="booking-back" onClick={() => setStep(1)}>{t.back}</button>
            <button type="button" disabled={busy} className="button button--dark" onClick={checkAvailability}>
              {t.check}
              <span aria-hidden="true">→</span>
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <form
          className="booking-step"
          onSubmit={(e) => {
            e.preventDefault();
            if (!privacy) {
              setError(t.invalidInput);
              return;
            }
            submit();
          }}
        >
          <p className="eyebrow">{t.stepOf.replace("{current}", "3")}</p>
          <h2>{t.step3}</h2>
          <div className="booking-fields">
            <label>
              {t.name}
              <input autoComplete="name" minLength={2} maxLength={120} value={name} onChange={(e) => setName(e.target.value)} required />
            </label>
            <label>
              {t.email}
              <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </label>
            <label>
              {t.phone}
              <input type="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required />
            </label>
          </div>
          <div className="booking-review">
            <h3>{t.review}</h3>
            <p>{stayName(stay)} · {checkIn} → {checkOut} · {guests} {t.guests.toLowerCase()}</p>
            {priceEstimate && (
              <p style={{ fontWeight: 600, color: "var(--forest)" }}>
                {t.estimatedTotal
                  .replace("{total}", formatNumber(priceEstimate.total))
                  .replace("{currency}", priceEstimate.currency)
                  .replace("{nights}", String(priceEstimate.nights))}
              </p>
            )}
            <p>{t.pendingNote}</p>
          </div>
          <label className="booking-consent">
            <input type="checkbox" checked={privacy} onChange={(e) => setPrivacy(e.target.checked)} required />
            {t.privacy}
          </label>
          <div className="booking-actions">
            <button type="button" className="booking-back" onClick={() => setStep(2)}>{t.back}</button>
            <button type="submit" disabled={busy} className="button button--dark">
              {busy ? t.submitting : t.submit}
              <span aria-hidden="true">→</span>
            </button>
          </div>
        </form>
      )}

      {error && (
        <p className="booking-error" role="alert">
          {error}{" "}
          {error === t.notConfigured && whatsapp && (
            <a href={getBookingUrl(locale, undefined, whatsapp)} target="_blank" rel="noopener noreferrer">
              {t.contact} ↗
            </a>
          )}
        </p>
      )}
    </div>
  );
}
