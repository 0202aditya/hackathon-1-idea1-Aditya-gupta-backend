export type Category = 'flights' | 'hotels' | 'dining' | 'online' | 'other';
export type Cabin = 'economy' | 'premium_economy' | 'business' | 'first';

export type TripLeg = { from: string; to: string; date: string }; // IATA or airport code, YYYY-MM-DD
export type TripInput = {
  kind: 'quick' | 'full';
  legs: TripLeg[]; // quick: 1 or 2 (return). full: 2 to 4
  passengers: number; // 1 to 3
  cabin: Cabin; // required, one class for the whole trip
};

export type Card = {
  id: string;
  name: string;
  issuer: string;
  network?: string;
  annualFeeMinor?: number;
  ratesVerifiedAt?: string;
  flightsReturnPct?: number; // shown in the dropdown for context
};

export type UserCard = {
  cardId: string;
  card: Card;
  pointsBalance: number;
  monthlySpendMinor: Partial<Record<Category, number>>;
};

export type FlightOffer = {
  offerId: string;
  totalMinor: number;
  currency: string;
  cabin: Cabin;
  slices: {
    origin: string;
    destination: string;
    departingAt: string;
    arrivingAt: string;
    carrier: string;
    stops: number;
  }[];
  expiresAt: string;
  passengerIds?: string[]; // only on the fresh single-offer endpoint
};

export type Strategy = {
  redeemCardId?: string;
  payCardId?: string;
  redeemOffsetMinor: number; // value of points already held
  earnBackMinor: number; // new rewards earned on this purchase
  hackedPriceMinor: number;
  savingsMinor: number;
  savingsPct: number;
};

export type SavingsResult = {
  normalPriceMinor: number;
  currency: string;
  best: Strategy;
  alternatives: Strategy[];
  projection: {
    pointsByDeparture: Record<string, number>;
    monthlyPointsEarned: Record<string, number>;
  };
  assumptions: string[];
  ratesVerifiedAt?: string;
};

export type AiPlan = {
  headline: string;
  summary: string;
  steps: {
    title: string;
    detail: string;
    type: 'earn' | 'redeem' | 'pay' | 'book' | 'check';
  }[];
  warnings: string[];
  source: 'ai' | 'template';
};

export type Passenger = {
  id?: string; // Duffel passenger id, filled from the fresh offer
  title: 'mr' | 'ms' | 'mrs' | 'miss' | 'dr';
  gender: 'm' | 'f';
  givenName: string;
  familyName: string;
  bornOn: string; // YYYY-MM-DD
  email: string;
  phoneNumber: string; // E.164, e.g. +919876543210
};

export type Booking = {
  id: string;
  tripId: string;
  offerId: string;
  duffelOrderId: string;
  status: 'confirmed' | 'pending' | 'failed';
  totalMinor: number;
  currency: string;
  bookingReference?: string;
  passengers: Passenger[];
  recommendedCardId?: string;
  createdAt: string;
};

