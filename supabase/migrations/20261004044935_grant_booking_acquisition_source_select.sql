-- D2.9 added the acquisition source after D2.8 restricted booking reads to
-- an explicit column allow-list. The tutor booking list selects this field,
-- so it must be readable without exposing management-token columns.
grant select (acquisition_source) on public.bookings to authenticated;
