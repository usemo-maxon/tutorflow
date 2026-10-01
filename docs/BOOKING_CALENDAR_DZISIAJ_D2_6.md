# Booking in Calendar and Dzisiaj — D2.6

## Booking vs Lesson

A public Booking remains an acquisition and scheduling object for a potential
client. It is not a Student Lesson and does not enter Student Memory,
attendance, package, finance, completion, or Student 360 flows. The schedule
representation is deliberately small: booking ID, guest name, event type,
start/end, timezone, and confirmed status.

A Lesson remains the normal teaching object connected to a Student or group.
Lesson lifecycle, drag interactions, attendance, packages, finance, and Google
sync are unchanged.

## Calendar behavior

`/app/kalendarz` retrieves confirmed, unconverted public bookings through the
existing bounded calendar request. The repository applies workspace and tutor
scope plus visible-range overlap filters. Day, week, month, and agenda views
show the Booking with an explicit **Rezerwacja** label and a distinct dashed
style, so identity does not depend on color alone.

The event links to `/app/rezerwacje/[bookingId]`. It is read-only and exposes no
drag or resize interaction. Existing normal Lesson and CalendarBlock drag
behavior remains unchanged.

Calendar booking payloads do not contain guest email, phone, goal, message, or
level. Those fields remain in booking details.

## Dzisiaj behavior

The bounded dashboard repository retrieves confirmed, unconverted bookings
from the start of the tutor's current local day through the existing 14-day
upcoming boundary. Today's bookings are merged chronologically with Lessons in
**Dzisiejszy plan** and retain an explicit Booking badge and booking-details
CTA. A short goal preview may appear there. Future bookings participate in
**Nadchodzące**.

No separate Action Center notification is created when the booking is already
visible in the schedule, avoiding duplicate dashboard attention.

## Converted booking behavior

Conversion from D2.5 changes the Booking to `converted` and attaches
`student_id` and `converted_lesson_id`. Active schedule queries accept only the
canonical confirmed/unconverted state. Therefore the historical Booking is not
rendered in Calendar or Dzisiaj, while its resulting normal Lesson is rendered
through the existing Lesson path. There is no Booking + Lesson duplicate.

The converted Booking remains available in booking management history.

## Cancelled booking behavior

Cancelled bookings remain historical booking records but are excluded from all
active Calendar, Dzisiaj, and upcoming schedule queries. They no longer occupy
an active schedule card.

## Availability consistency

The shared `isActivePublicBooking` predicate defines the local canonical active
state as `confirmed` with no Student or Lesson reference. Both schedule
projection and local public-availability blocking use this predicate. The
production availability RPC and schedule queries apply the equivalent database
state (`public_booking`, `confirmed`, unconverted) within tutor/workspace scope.

Timezone boundaries continue to use the tutor's IANA timezone and the existing
`date-fns-tz` conversions. No manual UTC offset is introduced, preserving DST
behavior.

## Google sync deferred

D2.6 does not create outbound Google Calendar events for public bookings.
Bookings appear in the easy4tutor Calendar and Dzisiaj only. Converted Lessons
continue through the existing Lesson Google synchronization path.

No schema migration is required for D2.6.
