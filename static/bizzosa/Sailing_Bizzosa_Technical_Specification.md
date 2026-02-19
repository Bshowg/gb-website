# SAILING BIZZOSA
Technical Specification (HTML/CSS/JS + PHP + phpMyAdmin DB)
## 1. Scope

Build a responsive bilingual (IT/EN) website (mobile + desktop) with:

5 public sections: Hero, About, Plan Your Sail, Gallery, Contacts

Interactive “Plan Your Sail” configurator

Backend in PHP with a MySQL/MariaDB database managed via phpMyAdmin

Quote request via Email or WhatsApp link

Admin manually maintains: availability, bookings, extras, daily prices, and confirms bookings

No online payments.

## 2. Tech Stack
### Frontend

Plain HTML + CSS + JavaScript

Responsive layout (CSS media queries)

Language toggle (IT/EN) without page reload (recommended)

### Backend

PHP 8+

MySQL/MariaDB

Endpoints returning JSON

Email via mail() or SMTP library (recommended)

### Admin

Database CRUD via phpMyAdmin

Optional: simple password-protected admin PHP pages (not required if admin uses phpMyAdmin only)

## 3. Site Structure

Single-page website (recommended) with anchor navigation:

#hero

#about

#plan

#gallery

#contacts

## 4. Hero Section Requirements

Background video:

video_desktop.mp4

video_mobile.mp4

JS chooses source based on viewport width

Navigation bar with section links

Title overlay

Performance notes:

Use preload="metadata"

Use compressed MP4 + poster image

## 5. Bilingual Requirements (IT/EN)
Frontend behavior

Language toggle button: IT | EN

Text elements marked with data-i18n-key="..." and replaced by JS

Persist preference in localStorage

## 6. Plan Your Sail (Interactive)
### 6.1 User Inputs

Package type: DAY_SAIL, DAILY_CHARTER, WEEKLY_CHARTER

Start date (calendar)

End date (calendar; constrained by package)

Destinations (allowed options depend on package + duration)

Number of guests (max depends on package)

Extras selection (checkbox list)

Contact method:

Email input (required if email submission)

Or WhatsApp button

#### 6.2 Package Rules
##### DAY_SAIL

Duration: fixed 1 day

Max guests: 8

Destinations: Elba/Baratti, Buca delle Fate

Boarding 10:00 / Disembark 19:00

Crew: skipper + marinaio/hostess included

Port fees ESAOM included

Excluded: fuel, food, extra ports

##### DAILY_CHARTER

Duration: 2–6 days

Max guests: 8

Destinations:

2 days: Elba

3–6 days: Elba, Capraia, Giglio

Boarding 11:00 / Disembark 18:00

Crew included

Port fees ESAOM included

Excluded: fuel, food, extra ports

##### WEEKLY_CHARTER

Duration: 7+ days

Max guests: 6

Destinations: Elba, Capraia, Giglio, Corsica (SE), Sardegna (La Maddalena)

Boarding 11:00 / Disembark 18:00

Crew included

Port fees + cleaning included

20% daily discount on base price

Excluded: fuel, food, extra ports

## 7. Price Calculation
### 7.1 Definitions

days = number_of_days(start_date, end_date)

Choose convention explicitly:

Option A (recommended): end date is disembark day, billed nights/days = end - start

Option B: inclusive dates billed = end - start + 1

daily_price: fetched from daily_prices table based on:

package_type

date range overlap

### 7.2 Daily price lookup rule (range-based)

Daily price is defined by rows with:

start_date

end_date

price

For a booking spanning multiple ranges:

sum per-day price across each day (or apply single price if the booking is guaranteed to fall within one range)

Recommended approach: compute per-day total on backend:

base_price = sum(daily_price_for_each_day_in_booking_range)


Apply weekly discount if package_type == WEEKLY_CHARTER:

base_price = base_price * 0.8

### 7.3 Extras

Each extra has:

pricing_type: FLAT_RATE, PER_PERSON, PER_DAY

price

Compute:

extras_total = Σ extra_total


Where:

FLAT_RATE: price

PER_PERSON: price * guests

PER_DAY: price * days

Final:

total = base_price + extras_total

## 8. Database Schema (MySQL/MariaDB)
### 8.1 bookings

Stores requests and admin outcomes.

column	type	notes
id	CHAR(36)	UUID string
package_type	ENUM('DAY_SAIL','DAILY_CHARTER','WEEKLY_CHARTER')	
start_date	DATE	
end_date	DATE	
guests	INT	
destinations_json	JSON or TEXT	JSON string
extras_json	JSON or TEXT	JSON string
total_price	DECIMAL(10,2)	computed
customer_email	VARCHAR(255)	nullable if WhatsApp-only
status	ENUM('PENDING','CONFIRMED','CANCELLED')	default PENDING
created_at	DATETIME	

Indexes:

(start_date, end_date)

(status)

### 8.2 availability

Defines whether a date is available for selection.

column	type	notes
date	DATE	PRIMARY KEY
is_available	TINYINT(1)	1/0
### 8.3 extras
column	type
id	INT AUTO_INCREMENT PRIMARY KEY
name_it	VARCHAR(255)
name_en	VARCHAR(255)
pricing_type	ENUM('FLAT_RATE','PER_PERSON','PER_DAY')
price	DECIMAL(10,2)
active	TINYINT(1)
### 8.4 daily_prices 

Requirement change applied: includes start_date, end_date, price.

column	type	notes
id	INT AUTO_INCREMENT PRIMARY KEY	
package_type	ENUM('DAY_SAIL','DAILY_CHARTER','WEEKLY_CHARTER')	
start_date	DATE	inclusive
end_date	DATE	inclusive
price	DECIMAL(10,2)	daily price
active	TINYINT(1)	optional

Indexes:

(package_type, start_date, end_date)

Constraint recommendation:

Prevent overlapping ranges per package_type (enforced by admin discipline or by backend validation tooling).

## 9. Backend API (PHP JSON Endpoints)

All endpoints return JSON. Suggested routes:

### 9.1 GET /api/availability.php

Returns list of available dates (or ranges).
Response:

{
  "availableDates": ["2026-06-01","2026-06-02"]
}

### 9.2 GET /api/extras.php

Returns active extras with price + pricing_type + bilingual names.

### 9.3 POST /api/quote.php

Input (JSON):

{
  "package_type": "DAILY_CHARTER",
  "start_date": "2026-07-10",
  "end_date": "2026-07-13",
  "guests": 6,
  "destinations": ["Elba"],
  "extras": [1, 3],
  "customer_email": "user@example.com"
}


Response:

{
  "days": 3,
  "base_price": 2400.00,
  "extras_total": 300.00,
  "total": 2700.00
}

### 9.4 POST /api/request_quote.php

Creates booking row (status=PENDING) and triggers email to admin.
Returns booking id and summary.

## 10. Email + WhatsApp
### 10.1 Email

When user submits request:

Backend composes a structured email to admin with:

package, dates, days, guests

destinations

extras

computed total

customer email

booking id

### 10.2 WhatsApp

Frontend generates a deep link:

https://wa.me/<ADMIN_NUMBER>?text=<ENCODED_MESSAGE>

Message content mirrors email content.

## 11. Frontend Components (Suggested)

Language toggle

Package selector

Date picker (custom or lightweight JS library)

Destination selector (dynamic)

Guests input (with max constraint)

Extras checklist (loaded from API)

Price summary panel (updates on change)

Submit buttons:

“Request quote by email”

“Request quote on WhatsApp”

## 12. Validation Rules

Frontend validation (UX):

Guests <= package max

End date within allowed duration

Destination list valid for package + duration

Availability: all selected dates must be available

Backend validation (security):

Recompute price server-side (never trust frontend total)

Validate selected dates are available

Validate extras IDs exist and are active

Sanitize inputs, prepared statements for DB queries

## 13. Implementation Notes for Claude

When generating code, Claude should:

Use PHP PDO with prepared statements

Implement daily price selection by date range:

For each day between start/end, find matching daily_prices row by package_type where day BETWEEN start_date AND end_date

Return clear JSON error responses:

{ "error": "INVALID_DATE_RANGE" }

Keep frontend JS framework-free

Ensure mobile/desktop responsiveness via CSS breakpoints