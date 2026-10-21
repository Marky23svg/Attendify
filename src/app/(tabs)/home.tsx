import { router, useFocusEffect } from 'expo-router';
import type { LucideIcon } from 'lucide-react-native';
import {
  ArrowUpRight,
  CalendarDays,
  Camera,
  CheckCircle2,
  Clock3,
  MapPin,
  Moon,
  Sun,
  SunMoon,
  Timer,
  UserCheck,
  UserX
} from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Image, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AttendanceDetailModal from '../../components/AttendanceDetailModal';
import { useWorkSettings } from '../../hooks/useWorkSettings';
import { supabase } from '../../lib/supabase';

const BLUE = '#0066FF';
const NAVY = '#0F1E36';

interface Stat {
  value: string;
  label: string;
  icon: LucideIcon;
  bg: string;
  iconBg: string;
  iconColor: string;
  textColor: string;
  subColor: string;
}

interface TodayAttendance {
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

const toDateString = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
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

export default function HomeScreen() {
  const { settings } = useWorkSettings();
  const [profile, setProfile] = useState<any>(null);
  const [attendance, setAttendance] = useState<TodayAttendance | null>(null);
  const [inSelfie, setInSelfie] = useState<string | null>(null);
  const [outSelfie, setOutSelfie] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailModalMode, setDetailModalMode] = useState<
    'time-in' | 'time-out' | null
  >(null);

  const handleCloseDetailModal = () => {
    setDetailModalMode(null);
    loadData();
  };

  const [stats, setStats] = useState<Stat[]>([
    {
      value: '0h',
      label: 'Hours Worked',
      icon: Clock3,
      bg: BLUE,
      iconBg: '#FFFFFF',
      iconColor: BLUE,
      textColor: '#FFFFFF',
      subColor: '#DBEAFE',
    },
    {
      value: '0h',
      label: 'Overtime',
      icon: Timer,
      bg: NAVY,
      iconBg: '#263A57',
      iconColor: '#BFDBFE',
      textColor: '#FFFFFF',
      subColor: '#CBD5E1',
    },
    {
      value: '0',
      label: 'Present',
      icon: UserCheck,
      bg: NAVY,
      iconBg: '#263A57',
      iconColor: '#BFDBFE',
      textColor: '#FFFFFF',
      subColor: '#CBD5E1',
    },
    {
      value: '0',
      label: 'Absent',
      icon: UserX,
      bg: BLUE,
      iconBg: '#FFFFFF',
      iconColor: BLUE,
      textColor: '#FFFFFF',
      subColor: '#DBEAFE',
    },
  ]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const loadData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      // 1. Load profile (fresh on every focus)
      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (profileData) setProfile(profileData);

      // 2. Load today's attendance
      const today = new Date().toISOString().split('T')[0];

      const { data: att } = await supabase
        .from('attendance')
        .select('*')
        .eq('user_id', user.id)
        .eq('date', today)
        .maybeSingle();

      setAttendance(att || null);

      // 3. Get signed URLs for selfies
      if (att?.time_in_selfie) {
        const url = await getSignedUrl(att.time_in_selfie);
        setInSelfie(url);
      } else {
        setInSelfie(null);
      }

      if (att?.time_out_selfie) {
        const url = await getSignedUrl(att.time_out_selfie);
        setOutSelfie(url);
      } else {
        setOutSelfie(null);
      }

      // 4. Load monthly stats for the stat cards
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const { data: monthRecords } = await supabase
        .from('attendance')
        .select('*')
        .eq('user_id', user.id)
        .gte('date', startOfMonth.toISOString().split('T')[0]);

      const records = monthRecords || [];

      const completed = records.filter((r) => r.time_in && r.time_out);

      const totalHours = completed.reduce(
        (sum, r) => sum + Number(r.total_hours || 0),
        0
      );

      const totalOvertime = completed.reduce(
        (sum, r) => sum + Number(r.overtime || 0),
        0
      );

      const presentCount = records.filter((r) =>
        ['present', 'late', 'half-day'].includes(r.status)
      ).length;

      let rangeStart = new Date(startOfMonth);
      let createdDay: Date | null = null;
      if (profileData?.created_at) {
        const created = new Date(profileData.created_at);
        created.setHours(0, 0, 0, 0);
        createdDay = created;
        if (created > rangeStart) rangeStart = created;
      }

      const attendedDates = new Set(records.map((r) => r.date));
      const createdKey = createdDay ? toDateString(createdDay) : null;

      const { data: approvedLeaves } = await supabase
        .from('leave_requests')
        .select('start_date, end_date')
        .eq('user_id', user.id)
        .eq('status', 'approved');

      const leaveRanges = (approvedLeaves || []).map((l: any) => {
        const [sy, sm, sd] = String(l.start_date).split('-').map(Number);
        const [ey, em, ed] = String(l.end_date).split('-').map(Number);
        return { start: new Date(sy, sm - 1, sd), end: new Date(ey, em - 1, ed) };
      });

      const isOnLeave = (date: Date) =>
        leaveRanges.some((r) => date >= r.start && date <= r.end);

      const nowDate = new Date();
      const todayMidnight = new Date();
      todayMidnight.setHours(0, 0, 0, 0);

      const [endHour = 0, endMinute = 0] = settings.work_end_time
        .split(':')
        .map(Number);
      const workEndMinutes = endHour * 60 + endMinute;
      const nowMinutes = nowDate.getHours() * 60 + nowDate.getMinutes();

      const lastAbsentDay = new Date(todayMidnight);
      if (nowMinutes < workEndMinutes) {
        lastAbsentDay.setDate(lastAbsentDay.getDate() - 1);
      }

      let absentCount = 0;
      const cursor = new Date(rangeStart);

      while (cursor <= lastAbsentDay) {
        const day = cursor.getDay();
        const isWeekend = day === 0 || day === 6;

        if (!isWeekend) {
          const key = toDateString(cursor);
          if (key !== createdKey && !attendedDates.has(key) && !isOnLeave(cursor)) {
            absentCount++;
          }
        }

        cursor.setDate(cursor.getDate() + 1);
      }

      setStats([
        {
          value: `${totalHours.toFixed(1)}h`,
          label: 'Hours Worked',
          icon: Clock3,
          bg: BLUE,
          iconBg: '#FFFFFF',
          iconColor: BLUE,
          textColor: '#FFFFFF',
          subColor: '#DBEAFE',
        },
        {
          value: `${totalOvertime.toFixed(1)}h`,
          label: 'Overtime',
          icon: Timer,
          bg: NAVY,
          iconBg: '#263A57',
          iconColor: '#BFDBFE',
          textColor: '#FFFFFF',
          subColor: '#CBD5E1',
        },
        {
          value: `${presentCount}`,
          label: 'Present',
          icon: UserCheck,
          bg: NAVY,
          iconBg: '#263A57',
          iconColor: '#BFDBFE',
          textColor: '#FFFFFF',
          subColor: '#CBD5E1',
        },
        {
          value: `${absentCount}`,
          label: 'Absent',
          icon: UserX,
          bg: BLUE,
          iconBg: '#FFFFFF',
          iconColor: BLUE,
          textColor: '#FFFFFF',
          subColor: '#DBEAFE',
        },
      ]);
    } catch (err) {
      console.error('Home load error:', err);
    } finally {
      setLoading(false);
    }
  };

  /* Foreground refresh — refetch when returning from background so approvals
   * made elsewhere (e.g. the admin web) are reflected. */
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (appState.current.match(/inactive|background/) && next === 'active') {
        loadData();
      }
      appState.current = next;
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getInitials = (
    name: string | null | undefined,
    email: string | null | undefined
  ): string => {
    if (name && name.trim()) {
      const parts = name.trim().split(' ');
      if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
      return name.substring(0, 2).toUpperCase();
    }
    if (email) return email.substring(0, 2).toUpperCase();
    return 'U';
  };

  const getTimeIcon = () => {
    const hour = new Date().getHours();

    if (hour >= 5 && hour < 12) return Sun;   // 5 AM – 11:59 AM
    if (hour >= 12 && hour < 17) return Sun;      // 12 PM – 4:59 PM
    if (hour >= 17 && hour < 20) return SunMoon;   // 5 PM – 7:59 PM
    return Moon;                                   // 8 PM – 4:59 AM
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return 'Good Morning';
    if (hour >= 12 && hour < 17) return 'Good Afternoon';
    if (hour >= 17 && hour < 20) return 'Good Evening';
    return 'Good Night';
  };

  const firstName = profile?.full_name?.split(' ')[0] || 'there';
  const initials = getInitials(profile?.full_name, profile?.email);
  const dateStr = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  const hasTimeIn = !!attendance?.time_in;
  const hasTimeOut = !!attendance?.time_out;
  const isRecorded = hasTimeIn || hasTimeOut;

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-[#F5F7FB] items-center justify-center" edges={['top']}>
        <ActivityIndicator size="large" color={BLUE} />
        <Text className="text-gray-500 text-sm mt-4">Loading...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-[#F5F7FB]" edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 28 }}
      >
        {/* Header */}
        <View className="flex-row items-center justify-between px-5 pt-3 pb-2">
          <View className="flex-row items-center">
            <View
              className="w-11 h-11 rounded-xl items-center justify-center overflow-hidden mr-2"
              style={{
                backgroundColor: '#0066FF',
                shadowColor: '#0066FF',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.25,
                shadowRadius: 8,
                elevation: 4,
              }}
            >
              <Image
                source={require('../../../assets/images/Attendify-logo-white.png')}
                style={{ width: '100%', height: '100%' }}
                resizeMode="cover"
              />
            </View>

            <View>
              <Text className="text-2xl font-extrabold text-[#0F1E36] tracking-tight">
                Attendify
              </Text>
              <Text className="text-xs text-[#64748B] mt-0.5">
                Your attendance dashboard
              </Text>
            </View>
          </View>

          {/* ───── Avatar button (now shows uploaded photo) ───── */}
          <Pressable
            onPress={() => router.push('/(tabs)/profile')}
            className="w-11 h-11 rounded-full bg-[#0066FF] items-center justify-center overflow-hidden active:opacity-70"
          >
            {profile?.avatar_url ? (
              <Image
                source={{ uri: profile.avatar_url }}
                style={{ width: '100%', height: '100%' }}
                resizeMode="cover"
              />
            ) : (
              <Text className="text-white text-sm font-bold">{initials}</Text>
            )}
          </Pressable>
        </View>

        {/* Greeting Banner */}
        <View
          className="bg-[#0066FF] justify-center mt-4 mx-4 rounded-3xl overflow-hidden"
          style={{
            minHeight: 145,
            shadowColor: BLUE,
            shadowOffset: { width: 0, height: 5 },
            shadowOpacity: 0.16,
            shadowRadius: 12,
            elevation: 4,
          }}
        >
          <View className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-white/10" />
          <View className="absolute top-10 -right-5 w-24 h-24 rounded-full bg-white/5" />
          <View className="absolute -bottom-12 -left-8 w-32 h-32 rounded-full bg-white/10" />
          <View className="absolute bottom-4 left-20 w-16 h-16 rounded-full bg-white/5" />

          <View className="px-5 py-5">
            <View className="flex-row items-center mb-3">
              <View className="w-10 h-10 rounded-xl bg-white/20 items-center justify-center mr-2">
                {(() => {
                  const Icon = getTimeIcon();
                  return <Icon size={25} color="#FFDF22" strokeWidth={2} />;
                })()}
              </View>
              <Text className="text-blue-100 text-sm font-medium flex-1">
                {dateStr}
              </Text>
            </View>

            <Text className="text-white font-extrabold text-2xl">
              {getGreeting()}, {firstName}!
            </Text>

            <Text className="text-blue-100 text-sm mt-2">
              Ready to make today productive?
            </Text>
          </View>
        </View>

        {/* Main Content */}
        <View className="flex-1 p-4">
          {/* Section Heading */}
          <View className="flex-row items-center justify-between mb-4">
            <View>
              <Text className="text-xl font-bold text-[#0F1E36]">
                Overview
              </Text>
              
            </View>

            {/*<View className="flex-row items-center bg-white border border-[#E8EDF5] rounded-xl px-3 py-2">
              <CalendarDays size={15} color={BLUE} />
              <Text className="text-xs font-semibold text-[#334155] ml-2">
                Today
              </Text>
            </View>*/}
          </View>

          {/* Statistics Cards */}
          <View className="flex-row flex-wrap justify-between">
            {stats.map((stat) => {
              const Icon = stat.icon;
              return (
                <View
                  key={stat.label}
                  className="w-[48%] rounded-2xl p-4 mb-4 justify-between"
                  style={{
                    height: 132,
                    backgroundColor: stat.bg,
                    shadowColor: '#0F1E36',
                    shadowOffset: { width: 0, height: 3 },
                    shadowOpacity: 0.08,
                    shadowRadius: 8,
                    elevation: 2,
                  }}
                >
                  <View className="flex-row items-center justify-between">
                    <View
                      className="w-10 h-10 rounded-xl items-center justify-center"
                      style={{ backgroundColor: stat.iconBg }}
                    >
                      <Icon size={20} color={stat.iconColor} strokeWidth={2} />
                    </View>
                    <ArrowUpRight size={17} color={stat.subColor} strokeWidth={2} />
                  </View>

                  <View>
                    <Text className="font-extrabold text-2xl" style={{ color: stat.textColor }}>
                      {stat.value}
                    </Text>
                    <Text className="text-sm mt-1" style={{ color: stat.subColor }}>
                      {stat.label}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>

          {/* Attendance Section */}
          <View className="bg-white rounded-3xl mt-1 border border-[#E8EDF5] p-4">
            <View className="flex-row items-center justify-between mb-5">
              <View className="flex-row items-center">
                <View className="w-10 h-10 rounded-xl bg-[#EAF2FF] items-center justify-center">
                  <CalendarDays size={21} color={BLUE} strokeWidth={2} />
                </View>

                <View className="ml-3">
                  <Text className="text-[#0F1E36] font-bold text-lg">
                    Attendance
                  </Text>
                  <Text className="text-[#64748B] text-xs mt-1">
                    Your activity for today
                  </Text>
                </View>
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

            {/* Time In Card */}
            <Pressable
              onPress={() => {
                if (attendance?.time_in) setDetailModalMode('time-in');
              }}
              className="bg-[#F8FAFD] rounded-2xl p-3 border border-[#E8EDF5] flex-row items-center mb-3 active:opacity-70"
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
            </Pressable>

            {/* Time Out Card */}
            <Pressable
              onPress={() => {
                if (attendance?.time_out) setDetailModalMode('time-out');
              }}
              className="bg-[#F8FAFD] rounded-2xl p-3 border border-[#E8EDF5] flex-row items-center active:opacity-70"
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
            </Pressable>
          </View>
        </View>
      </ScrollView>

      <AttendanceDetailModal
        visible={detailModalMode !== null}
        mode={detailModalMode ?? 'time-in'}
        onClose={() => handleCloseDetailModal()}
        dateLabel={dateStr}
        attendanceDate={toDateString(new Date())}
        attendanceId={attendance?.id ?? null}
        userId={profile?.id ?? null}
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
        totalHours={attendance ? attendance.total_hours : null}
        overtime={attendance ? attendance.overtime : null}
        status={attendance?.status ?? null}
      />
    </SafeAreaView>
  );
}