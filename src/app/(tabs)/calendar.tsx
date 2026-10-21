import { useFocusEffect } from 'expo-router';
import {
  Camera,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  MapPin,
} from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Image,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AttendanceDetailModal from '../../components/AttendanceDetailModal';
import { useWorkSettings } from '../../hooks/useWorkSettings';
import { supabase } from '../../lib/supabase';

function recomputeStatus(
  correctedTimeIso: string,
  workStart: string,
  gracePeriod: number,
  timezoneOffsetMinutes?: number | null
): 'present' | 'late' {
  const d = new Date(correctedTimeIso);
  const hasOffset =
    timezoneOffsetMinutes != null && Number.isFinite(Number(timezoneOffsetMinutes));
  const offset = Number(timezoneOffsetMinutes);
  const utcMins =
    d.getUTCHours() * 60 + d.getUTCMinutes() + d.getUTCSeconds() / 60;
  const clockMins = hasOffset
    ? (((utcMins + offset) % 1440) + 1440) % 1440
    : d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
  const [h = 0, m = 0] = workStart.split(':').map(Number);
  const latestMins = h * 60 + m + gracePeriod;
  return clockMins <= latestMins ? 'present' : 'late';
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const BLUE = '#0066FF';
const BORDER = '#E8EDF5';
const RED = '#DC2626';
const GREEN = '#22C55E';
const YELLOW = '#EAB308';
const PURPLE = '#A855F7';

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

function toDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

interface DayAttendance {
  id: number;
  time_in: string | null;
  time_out: string | null;
  time_in_selfie: string | null;
  time_out_selfie: string | null;
  time_in_location: string | null;
  time_out_location: string | null;
  time_in_lat: number | null;
  time_in_lng: number | null;
  time_out_lat: number | null;
  time_out_lng: number | null;
  total_hours: number | null;
  overtime: number | null;
  status: string | null;
}

const formatTime = (iso: string | null | undefined): string => {
  if (!iso) return '--:--';
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
};

const getSignedUrl = async (
  path: string | null | undefined
): Promise<string | null> => {
  if (!path) return null;
  const { data } = await supabase.storage
    .from('selfies')
    .createSignedUrl(path, 3600);
  return data?.signedUrl || null;
};

export default function CalendarScreen() {
  const { settings } = useWorkSettings();
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState<Date>(today);

  const [attendance, setAttendance] = useState<DayAttendance | null>(null);
  const [inSelfie, setInSelfie] = useState<string | null>(null);
  const [outSelfie, setOutSelfie] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Store attendance records for the whole month so we can mark dots
  const [monthRecords, setMonthRecords] = useState<Record<string, DayAttendance>>({});

  // When the user's account was created — absences only count from this date
  const [accountCreatedAt, setAccountCreatedAt] = useState<Date | null>(null);

  const [leaveRanges, setLeaveRanges] = useState<
    { start: Date; end: Date }[]
  >([]);

  const [detailModalMode, setDetailModalMode] = useState<
    'time-in' | 'time-out' | null
  >(null);

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setCurrentUserId(user?.id ?? null);
    });
  }, []);

  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstDay = getFirstDayOfMonth(viewYear, viewMonth);

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };

  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  };

  const isToday = (day: number) =>
    day === today.getDate() && viewMonth === today.getMonth() && viewYear === today.getFullYear();

  const isSelected = (day: number) =>
    day === selectedDate.getDate() && viewMonth === selectedDate.getMonth() && viewYear === selectedDate.getFullYear();

  const isWeekend = (day: number) => {
    const d = new Date(viewYear, viewMonth, day).getDay();
    return d === 0 || d === 6;
  };

  // A weekday that is after account creation, in the past (or today),
  // and has no attendance record
  const isAbsent = (day: number) => {
    if (isWeekend(day)) return false;
    if (!accountCreatedAt) return false;

    const cellDate = new Date(viewYear, viewMonth, day);
    cellDate.setHours(0, 0, 0, 0);

    const todayMidnight = new Date();
    todayMidnight.setHours(0, 0, 0, 0);

    // Skip future dates
    if (cellDate > todayMidnight) return false;

    // Today is only absent once the workday has ended
    if (cellDate.getTime() === todayMidnight.getTime()) {
      const [endHour = 0, endMinute = 0] = settings.work_end_time
        .split(':')
        .map(Number);
      const workEndToday = new Date(todayMidnight);
      workEndToday.setHours(endHour, endMinute, 0, 0);
      if (new Date().getTime() < workEndToday.getTime()) return false;
    }

    // Skip dates before the account was created
    if (cellDate < accountCreatedAt) return false;

    // Skip the account creation day itself (that's their first day)
    if (cellDate.getTime() === accountCreatedAt.getTime()) return false;

    const key = toDateString(cellDate);
    if (leaveRanges.some((r) => cellDate >= r.start && cellDate <= r.end)) {
      return false;
    }
    return !monthRecords[key];
  };

  const getDotColor = (day: number): string | null => {
    if (isAbsent(day)) return RED;

    const cellDate = new Date(viewYear, viewMonth, day);
    cellDate.setHours(0, 0, 0, 0);

    if (leaveRanges.some((r) => cellDate >= r.start && cellDate <= r.end)) {
      return PURPLE;
    }

    const record = monthRecords[toDateString(cellDate)];

    if (record) {
      if (record.status === 'present') return GREEN;
      if (record.status === 'late' || record.status === 'half-day') return YELLOW;
      return null;
    }

    return isToday(day) ? BLUE : null;
  };

  const cells = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  /* ------------------------------------------------------------------
   * Data loaders (defined before anything that uses them)
   * ---------------------------------------------------------------- */

  const loadAccountCreatedAt = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from('profiles')
        .select('created_at')
        .eq('id', user.id)
        .single();

      if (data?.created_at) {
        const d = new Date(data.created_at);
        d.setHours(0, 0, 0, 0);
        setAccountCreatedAt(d);
      }
    } catch (err) {
      console.error('Created at error:', err);
    }
  }, []);

  const loadMonthRecords = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setMonthRecords({});
        return;
      }

      const startDate = toDateString(new Date(viewYear, viewMonth, 1));
      const endDate = toDateString(new Date(viewYear, viewMonth, daysInMonth));

      const [attResult, corrResult] = await Promise.all([
        supabase
          .from('attendance')
          .select('*')
          .eq('user_id', user.id)
          .gte('date', startDate)
          .lte('date', endDate),
        supabase
          .from('time_corrections')
          .select('attendance_id, field, corrected_time, created_at, timezone_offset_minutes')
          .eq('user_id', user.id)
          .eq('status', 'approved')
          .eq('field', 'time_in'),
      ]);

      if (attResult.error) {
        console.error('Month records error:', attResult.error);
        setMonthRecords({});
        return;
      }

      if (corrResult.error) {
        console.error('Corrections load error:', corrResult.error);
      }

      // Build a map of attendance_id → latest approved time_in correction
      const approvedMap: Record<string, { time: string; offset: number | null }> = {};
      for (const row of (corrResult.data || [])) {
        const key = String(row.attendance_id);
        if (!approvedMap[key]) {
          approvedMap[key] = { time: row.corrected_time, offset: row.timezone_offset_minutes };
        }
      }

      const map: Record<string, DayAttendance> = {};
      for (const r of (attResult.data || [])) {
        const correction = approvedMap[String(r.id)];
        if (correction) {
          r.status = recomputeStatus(
            correction.time,
            settings.work_start_time,
            settings.grace_period_minutes,
            correction.offset
          );
        }
        map[r.date] = r;
      }
      setMonthRecords(map);
    } catch (err) {
      console.error('Month load error:', err);
    }
  }, [viewYear, viewMonth, daysInMonth, settings]);

  const loadApprovedLeaves = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLeaveRanges([]);
        return;
      }

      const startDate = toDateString(new Date(viewYear, viewMonth, 1));
      const endDate = toDateString(new Date(viewYear, viewMonth, daysInMonth));

      const { data, error } = await supabase
        .from('leave_requests')
        .select('start_date, end_date')
        .eq('user_id', user.id)
        .eq('status', 'approved')
        .gte('end_date', startDate)
        .lte('start_date', endDate);

      if (error) {
        console.error('Approved leaves error:', error);
        setLeaveRanges([]);
        return;
      }

      setLeaveRanges(
        (data || []).map((l: any) => {
          const [sy, sm, sd] = String(l.start_date).split('-').map(Number);
          const [ey, em, ed] = String(l.end_date).split('-').map(Number);
          return { start: new Date(sy, sm - 1, sd), end: new Date(ey, em - 1, ed) };
        })
      );
    } catch (err) {
      console.error('Approved leaves load error:', err);
    }
  }, [viewYear, viewMonth, daysInMonth]);

  const loadAttendance = useCallback(async (date: Date) => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setAttendance(null);
        setInSelfie(null);
        setOutSelfie(null);
        setLoading(false);
        return;
      }

      const dateStr = toDateString(date);

      const { data, error } = await supabase
        .from('attendance')
        .select('*')
        .eq('user_id', user.id)
        .eq('date', dateStr)
        .maybeSingle();

      if (error) {
        console.error('Fetch attendance error:', error);
        setAttendance(null);
        setLoading(false);
        return;
      }

      setAttendance(data || null);

      if (data?.time_in_selfie) {
        const url = await getSignedUrl(data.time_in_selfie);
        setInSelfie(url);
      } else {
        setInSelfie(null);
      }

      if (data?.time_out_selfie) {
        const url = await getSignedUrl(data.time_out_selfie);
        setOutSelfie(url);
      } else {
        setOutSelfie(null);
      }
    } catch (err) {
      console.error('Calendar load error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  /* ------------------------------------------------------------------
   * Modal close handler — refetch after a short delay so the
   * DB trigger has time to commit if approval just happened.
   * ---------------------------------------------------------------- */

  const handleCloseDetailModal = () => {
    setDetailModalMode(null);
    loadAttendance(selectedDate);
    loadMonthRecords();
  };

  /* ------------------------------------------------------------------
   * Focus / date change → reload everything
   * ---------------------------------------------------------------- */

  useFocusEffect(
    useCallback(() => {
      loadAccountCreatedAt();
      loadMonthRecords();
      loadApprovedLeaves();
      loadAttendance(selectedDate);
    }, [
      selectedDate,
      viewMonth,
      viewYear,
      settings,
      loadAccountCreatedAt,
      loadMonthRecords,
      loadApprovedLeaves,
      loadAttendance,
    ])
  );

  /* ------------------------------------------------------------------
   * Foreground refresh — refetch when returning from background so
   * approvals made elsewhere (e.g. the admin web) are reflected.
   * ---------------------------------------------------------------- */

  const appState = useRef(AppState.currentState);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (appState.current.match(/inactive|background/) && next === 'active') {
        loadMonthRecords();
        loadApprovedLeaves();
        loadAttendance(selectedDate);
      }
      appState.current = next;
    });
    return () => sub.remove();
  }, [loadMonthRecords, loadApprovedLeaves, loadAttendance, selectedDate]);

  const handleSelectDate = (day: number) => {
    const newDate = new Date(viewYear, viewMonth, day);
    setSelectedDate(newDate);
  };

  const hasTimeIn = !!attendance?.time_in;
  const hasTimeOut = !!attendance?.time_out;
  const isRecorded = hasTimeIn || hasTimeOut;

  return (
    <SafeAreaView className="flex-1 bg-[#F5F7FB]" edges={['top']}>
      <View className="flex px-4 pt-4">

        {/* Header */}
        <View className="flex-row items-center justify-between mb-6">
          <TouchableOpacity
            onPress={prevMonth}
            className="w-10 h-10 items-center justify-center rounded-full bg-white border border-gray-200"
          >
            <ChevronLeft size={20} color="#1F2937" />
          </TouchableOpacity>

          <Text className="text-xl font-bold text-gray-900">
            {MONTHS[viewMonth]} {viewYear}
          </Text>

          <TouchableOpacity
            onPress={nextMonth}
            className="w-10 h-10 items-center justify-center rounded-full bg-white border border-gray-200"
          >
            <ChevronRight size={20} color="#1F2937" />
          </TouchableOpacity>
        </View>

        {/* Calendar Card */}
        <View className="bg-white rounded-3xl p-4 border border-[#E8EDF5]">
          {/* Day labels */}
          <View className="flex-row mb-2">
            {DAYS.map(day => (
              <View key={day} className="flex-1 items-center">
                <Text className="text-xs font-semibold text-gray-400">{day}</Text>
              </View>
            ))}
          </View>

          {/* Grid */}
          <View className="flex-row flex-wrap">
            {cells.map((day, i) => {
              if (!day) return <View key={`empty-${i}`} className="w-[14.28%] aspect-square" />;

              const selected = isSelected(day);
              const todayCell = isToday(day);
              const weekend = isWeekend(day);
              const absent = isAbsent(day);
              const dotColor = getDotColor(day);

              let textColor = '#374151';
              if (selected) textColor = 'white';
              else if (absent) textColor = RED;
              else if (todayCell) textColor = BLUE;
              else if (weekend) textColor = '#9CA3AF';

              return (
                <View key={`day-${day}`} className="w-[14.28%] aspect-square items-center justify-center p-0.5">
                  <TouchableOpacity
                    onPress={() => handleSelectDate(day)}
                    className="w-full h-full items-center justify-center rounded-full"
                    style={{
                      backgroundColor: selected ? BLUE : 'transparent',
                      shadowColor: selected ? BLUE : 'transparent',
                      shadowOffset: { width: 0, height: 3 },
                      shadowOpacity: selected ? 0.3 : 0,
                      shadowRadius: 8,
                      elevation: selected ? 4 : 0,
                    }}
                  >
                    <Text
                      className="text-sm"
                      style={{
                        color: textColor,
                        fontWeight: todayCell || selected || absent ? '700' : '500',
                      }}
                    >
                      {day}
                    </Text>

                    {dotColor && !selected && (
                      <View
                        className="w-1 h-1 rounded-full absolute bottom-1"
                        style={{ backgroundColor: dotColor }}
                      />
                    )}
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>

          {/* Legend */}
          <View className="mt-4 pt-4 border-t border-[#E8EDF5]">
            <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
              Legend
            </Text>
            <View className="flex-row flex-wrap gap-x-4 gap-y-2">
              <View className="flex-row items-center">
                <View className="w-2 h-2 rounded-full bg-[#0066FF] mr-1.5" />
                <Text className="text-xs text-gray-500">Today</Text>
              </View>
              <View className="flex-row items-center">
                <View className="w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: RED }} />
                <Text className="text-xs text-gray-500">Absent</Text>
              </View>
              <View className="flex-row items-center">
                <View className="w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: GREEN }} />
                <Text className="text-xs text-gray-500">Present</Text>
              </View>
              <View className="flex-row items-center">
                <View className="w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: YELLOW }} />
                <Text className="text-xs text-gray-500">Late / Half-day</Text>
              </View>
              <View className="flex-row items-center">
                <View className="w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: PURPLE }} />
                <Text className="text-xs text-gray-500">Leave</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Selected Date Panel */}
        <View className="mt-5 p-4 bg-white rounded-3xl border border-[#E8EDF5]">
          {/* Panel Heading */}
          <View className="flex-row items-center justify-between mb-4">
            <View className="flex-1">
              <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
                Selected Date
              </Text>
              <Text className="text-lg font-bold text-[#0066FF]">
                {selectedDate.toLocaleDateString('en-US', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </Text>
            </View>

            {isRecorded && (
              <View className="flex-row items-center bg-[#EAF8F0] rounded-full px-2.5 py-1.5">
                <CheckCircle2 size={13} color="#16834A" />
                <Text className="text-[#16834A] text-xs font-semibold ml-1">
                  Recorded
                </Text>
              </View>
            )}
          </View>

          {loading ? (
            <View className="items-center justify-center py-8">
              <ActivityIndicator size="small" color={BLUE} />
              <Text className="text-gray-400 text-xs mt-2">
                Loading attendance...
              </Text>
            </View>
          ) : !isRecorded ? (
            <View className="items-center justify-center py-8">
              <View className="w-14 h-14 rounded-2xl bg-[#F5F7FB] items-center justify-center mb-3">
                <Clock3 size={24} color="#9CA3AF" />
              </View>
              <Text className="text-gray-900 font-bold text-base">
                No attendance record
              </Text>
              <Text className="text-gray-400 text-xs mt-1 text-center px-8">
                You did not clock in on this date
              </Text>
            </View>
          ) : (
            <View className="gap-3">

              {/* Time In Card */}
              <TouchableOpacity
                onPress={() => {
                  if (attendance?.time_in) setDetailModalMode('time-in');
                }}
                activeOpacity={0.7}
                className="bg-[#F8FAFD] rounded-2xl p-3 border border-[#E8EDF5] flex-row items-center"
              >
                <View className="w-[68px] h-[68px] bg-[#EAF2FF] rounded-xl justify-center items-center overflow-hidden">
                  {inSelfie ? (
                    <Image
                      source={{ uri: inSelfie }}
                      style={{ width: '100%', height: '100%' }}
                      resizeMode="cover"
                    />
                  ) : (
                    <>
                      <Camera size={23} color={BLUE} strokeWidth={1.8} />
                      <Text className="text-[#0066FF] text-[10px] font-medium mt-1">
                        No Selfie
                      </Text>
                    </>
                  )}
                </View>

                <View className="flex-1 ml-3">
                  <View className="flex-row items-center">
                    <View className="w-7 h-7 rounded-lg bg-[#EAF2FF] items-center justify-center mr-2">
                      <Clock3 size={15} color={BLUE} />
                    </View>

                    <Text className="text-[#0F1E36] font-bold text-base">
                      Time In
                    </Text>
                  </View>

                  <View className="flex-row items-center mt-2">
                    <MapPin size={13} color={BLUE} />
                    <Text
                      className="text-[#64748B] text-xs ml-1 flex-1"
                      numberOfLines={1}
                    >
                      {attendance?.time_in_location || 'No location'}
                    </Text>
                  </View>

                  <Text className="text-[#64748B] text-xs mt-1.5">
                    {formatTime(attendance?.time_in)}
                  </Text>
                </View>

                {hasTimeIn && (
                  <View className="w-8 h-8 rounded-full bg-[#EAF8F0] items-center justify-center">
                    <CheckCircle2 size={17} color="#16834A" />
                  </View>
                )}
              </TouchableOpacity>

              {/* Time Out Card */}
              <TouchableOpacity
                onPress={() => {
                  if (attendance?.time_out) setDetailModalMode('time-out');
                }}
                activeOpacity={0.7}
                className="bg-[#F8FAFD] rounded-2xl p-3 border border-[#E8EDF5] flex-row items-center"
              >
                <View className="w-[68px] h-[68px] bg-[#EAF2FF] rounded-xl justify-center items-center overflow-hidden">
                  {outSelfie ? (
                    <Image
                      source={{ uri: outSelfie }}
                      style={{ width: '100%', height: '100%' }}
                      resizeMode="cover"
                    />
                  ) : (
                    <>
                      <Camera size={23} color={BLUE} strokeWidth={1.8} />
                      <Text className="text-[#0066FF] text-[10px] font-medium mt-1">
                        No Selfie
                      </Text>
                    </>
                  )}
                </View>

                <View className="flex-1 ml-3">
                  <View className="flex-row items-center">
                    <View className="w-7 h-7 rounded-lg bg-[#EAF2FF] items-center justify-center mr-2">
                      <Clock3 size={15} color={BLUE} />
                    </View>

                    <Text className="text-[#0F1E36] font-bold text-base">
                      Time Out
                    </Text>
                  </View>

                  <View className="flex-row items-center mt-2">
                    <MapPin size={13} color={BLUE} />
                    <Text
                      className="text-[#64748B] text-xs ml-1 flex-1"
                      numberOfLines={1}
                    >
                      {attendance?.time_out_location || 'No location'}
                    </Text>
                  </View>

                  <Text className="text-[#64748B] text-xs mt-1.5">
                    {formatTime(attendance?.time_out)}
                  </Text>
                </View>

                {hasTimeOut && (
                  <View className="w-8 h-8 rounded-full bg-[#EAF8F0] items-center justify-center">
                    <CheckCircle2 size={17} color="#16834A" />
                  </View>
                )}
              </TouchableOpacity>

            </View>
          )}
        </View>

      </View>

      <AttendanceDetailModal
        visible={detailModalMode !== null}
        mode={detailModalMode ?? 'time-in'}
        onClose={() => handleCloseDetailModal()}
        dateLabel={selectedDate.toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })}
        attendanceDate={toDateString(selectedDate)}
        attendanceId={attendance?.id ?? null}
        userId={currentUserId}
        timeIn={
          attendance?.time_in
            ? {
                time: formatTime(attendance.time_in),
                location: attendance.time_in_location,
                lat: attendance.time_in_lat,
                lng: attendance.time_in_lng,
                selfieUrl: inSelfie,
                rawIso: attendance.time_in,
              }
            : null
        }
        timeOut={
          attendance?.time_out
            ? {
                time: formatTime(attendance.time_out),
                location: attendance.time_out_location,
                lat: attendance.time_out_lat,
                lng: attendance.time_out_lng,
                selfieUrl: outSelfie,
                rawIso: attendance.time_out,
              }
            : null
        }
        totalHours={attendance?.total_hours ?? null}
        overtime={attendance?.overtime ?? null}
        status={attendance?.status ?? null}
      />
    </SafeAreaView>
  );
}