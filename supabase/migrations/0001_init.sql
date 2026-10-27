-- 0001_init.sql
-- Complete Supabase schema for Una Milla (Hackathon Travel Hack App)
-- Covers: Catalog, Profiles, User Wallet, Trips & Results, Bookings, RLS Policies, and User Auto-creation Trigger.

-- 1. CATALOG TABLES (Indian Credit Cards, Reward Rates, Point Valuations)
create table if not exists cards (
  id text primary key,
  name text not null,
  issuer text not null,
  network text,
  annual_fee_minor bigint,
  rates_verified_at date,
  source text default 'cardadvisor.in',
  raw jsonb
);

create table if not exists card_reward_rates (
  card_id text references cards(id) on delete cascade,
  category text not null,
  effective_return_pct numeric not null,
  monthly_cap_minor bigint,
  primary key (card_id, category)
);

create table if not exists card_valuations (
  card_id text primary key references cards(id) on delete cascade,
  point_value_paise numeric not null,
  route text not null
);

-- 2. USER PROFILE TABLE (Linked to auth.users)
create table if not exists profiles (
  id uuid primary key references auth.users on delete cascade,
  full_name text,
  home_airport text,
  created_at timestamptz default now()
);

-- 3. USER WALLET TABLE (Holds points balance and monthly spend per category)
create table if not exists user_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  card_id text not null references cards(id),
  points_balance bigint not null default 0,
  monthly_spend_minor jsonb not null default '{}',
  unique (user_id, card_id)
);

-- 4. TRIPS & RESULTS TABLES
create table if not exists trips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  kind text not null,
  input jsonb not null,
  created_at timestamptz default now()
);

create table if not exists trip_results (
  trip_id uuid primary key references trips(id) on delete cascade,
  offers jsonb,
  savings jsonb,
  ai_plan jsonb,
  created_at timestamptz default now()
);

-- 5. BOOKINGS TABLE
create table if not exists bookings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  trip_id uuid references trips(id),
  duffel_order_id text unique,
  offer_id text not null,
  status text not null default 'pending',
  total_minor bigint,
  currency text,
  passengers jsonb,
  booking_reference text,
  recommended_card_id text,
  created_at timestamptz default now(),
  unique (user_id, offer_id)
);

-- 6. ENABLE ROW LEVEL SECURITY (RLS) ON ALL TABLES
alter table cards enable row level security;
alter table card_reward_rates enable row level security;
alter table card_valuations enable row level security;
alter table profiles enable row level security;
alter table user_cards enable row level security;
alter table trips enable row level security;
alter table trip_results enable row level security;
alter table bookings enable row level security;

-- 7. RLS POLICIES

-- Catalog tables: Public read
drop policy if exists "public read cards" on cards;
create policy "public read cards" on cards for select using (true);

drop policy if exists "public read reward rates" on card_reward_rates;
create policy "public read reward rates" on card_reward_rates for select using (true);

drop policy if exists "public read valuations" on card_valuations;
create policy "public read valuations" on card_valuations for select using (true);

-- User Profiles: Users can manage their own profile
drop policy if exists "own profile" on profiles;
create policy "own profile" on profiles
  for all
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- User Cards (Wallet): Users can only access their own wallet
drop policy if exists "own user_cards" on user_cards;
create policy "own user_cards" on user_cards
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Trips: Users can only access their own trips
drop policy if exists "own trips" on trips;
create policy "own trips" on trips
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Trip Results: Accessible only if the user owns the parent trip
drop policy if exists "own trip_results" on trip_results;
create policy "own trip_results" on trip_results
  for all
  using (
    exists (
      select 1 from trips
      where trips.id = trip_results.trip_id
        and trips.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from trips
      where trips.id = trip_results.trip_id
        and trips.user_id = auth.uid()
    )
  );

-- Bookings: Users can only access their own bookings
drop policy if exists "own bookings" on bookings;
create policy "own bookings" on bookings
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 8. TRIGGER: AUTOMATIC PROFILE CREATION ON SIGNUP
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''));
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

