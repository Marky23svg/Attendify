-- time_corrections table
create table if not exists public.time_corrections (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,
  attendance_id bigint not null references public.attendance(id) on delete cascade,
  field         text not null check (field in ('time_in', 'time_out')),
  original_time timestamptz not null,
  corrected_time timestamptz not null,
  -- Minutes east of UTC for the device that submitted the correction.
  -- Used to recover the intended local wall-clock time when the correction
  -- is approved on the server (which runs in UTC).
  timezone_offset_minutes int not null default 0,
  message       text,
  status        text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Ensure the timezone offset column exists on already-created tables
alter table public.time_corrections
  add column if not exists timezone_offset_minutes int not null default 0;

-- RLS
alter table public.time_corrections enable row level security;

drop policy if exists "Users can insert own corrections" on public.time_corrections;
create policy "Users can insert own corrections"
  on public.time_corrections for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can read own corrections" on public.time_corrections;
create policy "Users can read own corrections"
  on public.time_corrections for select
  using (auth.uid() = user_id);

-- Admins can read and update all corrections (assumes role stored in profiles)
drop policy if exists "Admins can manage all corrections" on public.time_corrections;
create policy "Admins can manage all corrections"
  on public.time_corrections for all
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- ── Trigger: recalculate attendance.status when a time_in correction is approved ──
--
-- NOTE: corrected_time is stored as a true UTC instant built from the device's
-- local wall-clock time. The server cannot know the device timezone, so the
-- submission stores timezone_offset_minutes (minutes east of UTC) and we add it
-- back to recover the wall-clock time the employee actually intended. Without
-- this, an early-morning correction (e.g. 07:50 for an 08:00 shift) is compared
-- against work_start using its UTC hour and is wrongly kept as 'late'.

create or replace function public.apply_time_correction()
returns trigger
language plpgsql
security definer
as $$
declare
  v_work_start     time;
  v_grace          int;
  v_latest_clock   numeric;
  v_clock_in_mins  numeric;
  v_new_status     text;
  v_time_in        timestamptz;
  v_time_out       timestamptz;
  v_total_hours    numeric;
  v_overtime       numeric;
  v_work_end       time;
  v_local_time     timestamp;
  v_offset         int;
begin
  -- Only act when status transitions to 'approved'
  if NEW.status <> 'approved' or OLD.status = 'approved' then
    return NEW;
  end if;

  v_offset := coalesce(NEW.timezone_offset_minutes, 0);

  -- Local wall-clock time the employee intended: strip the zone to get the UTC
  -- wall-clock, then shift by the device offset (session-timezone independent).
  v_local_time := (NEW.corrected_time at time zone 'UTC') + make_interval(mins => v_offset);

  -- Load work settings (row id = 1)
  select work_start_time, work_end_time, grace_period_minutes
    into v_work_start, v_work_end, v_grace
    from public.settings
   where id = 1;

  -- Recalculate status when time_in is corrected
  if NEW.field = 'time_in' then
    v_clock_in_mins := extract(hour from v_local_time) * 60
                     + extract(minute from v_local_time)
                     + extract(second from v_local_time) / 60.0;

    v_latest_clock := extract(hour from v_work_start) * 60
                    + extract(minute from v_work_start)
                    + coalesce(v_grace, 0);

    if v_clock_in_mins <= v_latest_clock then
      v_new_status := 'present';
    else
      v_new_status := 'late';
    end if;

    -- Also recalculate total_hours if time_out exists
    select time_out into v_time_out
      from public.attendance
     where id = NEW.attendance_id;

    if v_time_out is not null then
      v_total_hours := extract(epoch from (v_time_out - NEW.corrected_time)) / 3600.0;
      if v_total_hours < 0 then v_total_hours := 0; end if;
    end if;

    update public.attendance
       set status      = v_new_status,
           time_in     = NEW.corrected_time,
           total_hours = coalesce(v_total_hours, total_hours)
     where id = NEW.attendance_id;

  -- Recalculate total_hours and overtime when time_out is corrected
  elsif NEW.field = 'time_out' then
    select time_in into v_time_in
      from public.attendance
     where id = NEW.attendance_id;

    if v_time_in is not null then
      v_total_hours := extract(epoch from (NEW.corrected_time - v_time_in)) / 3600.0;
      if v_total_hours < 0 then v_total_hours := 0; end if;
    end if;

    -- Overtime = minutes past work_end (local wall-clock), floored at 0
    v_overtime := extract(epoch from (v_local_time::time - v_work_end)) / 3600.0;
    if v_overtime < 0 then v_overtime := 0; end if;

    update public.attendance
       set time_out    = NEW.corrected_time,
           total_hours = coalesce(v_total_hours, total_hours),
           overtime    = v_overtime
     where id = NEW.attendance_id;
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_apply_time_correction on public.time_corrections;
create trigger trg_apply_time_correction
  after update on public.time_corrections
  for each row
  execute function public.apply_time_correction();
