import {
  ArrowLeft,
  CalendarDays,
  Camera,
  CheckCircle2,
  LogIn,
  LogOut,
  MapPin,
  Pencil,
  Timer,
} from 'lucide-react-native';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { buildMapHtml } from '../lib/buildMapHtml';
import { supabase } from '../lib/supabase';
import TimeCorrectionModal, {
  CorrectionStatusBadge,
  type CorrectionStatus,
} from './TimeCorrectionModal';
import { DEFAULT_WORK_SETTINGS } from '../hooks/useWorkSettings';

export interface AttendanceRecordInfo {
  time: string;
  location: string | null;
  lat: number | null;
  lng: number | null;
  selfieUrl: string | null;
  rawIso?: string;
}

interface AttendanceDetailModalProps {
  visible: boolean;
  mode: 'time-in' | 'time-out';
  onClose: () => void;
  dateLabel: string;
  attendanceDate: string;
  attendanceId: number | null;
  userId: string | null;
  timeIn: AttendanceRecordInfo | null;
  timeOut: AttendanceRecordInfo | null;
  totalHours: number | null;
  overtime: number | null;
  status: string | null;
}

const STATUS_LABELS: Record<string, { label: string; text: string }> = {
  present: { label: 'Present', text: '#16834A' },
  late: { label: 'Late', text: '#D97706' },
  'half-day': { label: 'Half-day', text: '#D97706' },
};

type CorrectionField = 'time_in' | 'time_out';

interface LatestCorrection {
  status: CorrectionStatus;
  correctedTime: string | null;
  offsetMinutes: number | null;
}

interface LatestCorrections {
  time_in: LatestCorrection;
  time_out: LatestCorrection;
}

// Recompute attendance status from a corrected time_in ISO string. When the
// stored timezone offset is available, recover the intended wall-clock time
// from the UTC components (matching the DB trigger); otherwise fall back to the
// device-local clock.
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

export default function AttendanceDetailModal({
  visible,
  mode,
  onClose,
  dateLabel,
  attendanceDate,
  attendanceId,
  userId,
  timeIn,
  timeOut,
  totalHours,
  overtime,
  status: statusProp,
}: AttendanceDetailModalProps) {
  const focus = mode === 'time-in' ? timeIn : timeOut;
  const lat = focus?.lat || 0;
  const lng = focus?.lng || 0;
  const hasMap = !!lat && !!lng;

  const [corrections, setCorrections] = useState<LatestCorrections>({
    time_in: { status: null, correctedTime: null, offsetMinutes: null },
    time_out: { status: null, correctedTime: null, offsetMinutes: null },
  });
  const [workSettings, setWorkSettings] = useState(DEFAULT_WORK_SETTINGS);
  const [correctionModal, setCorrectionModal] = useState<CorrectionField | null>(null);

  // Derive the effective status: if time_in correction is approved, recompute from corrected time
  const timeInCorrection = corrections.time_in;
  const effectiveStatus =
    String(timeInCorrection.status).toLowerCase() === 'approved' &&
    timeInCorrection.correctedTime
      ? recomputeStatus(
          timeInCorrection.correctedTime,
          workSettings.work_start_time,
          workSettings.grace_period_minutes,
          timeInCorrection.offsetMinutes
        )
      : statusProp;

  const statusConfig = effectiveStatus ? STATUS_LABELS[effectiveStatus] : undefined;

  const fetchCorrections = async () => {
    if (!attendanceId) return;
    const { data } = await supabase
      .from('time_corrections')
      .select('field, status, corrected_time, created_at, timezone_offset_minutes')
      .eq('attendance_id', attendanceId)
      .order('created_at', { ascending: false });

    if (!data) return;

    const latest: LatestCorrections = {
      time_in: { status: null, correctedTime: null, offsetMinutes: null },
      time_out: { status: null, correctedTime: null, offsetMinutes: null },
    };
    const approved: LatestCorrections = {
      time_in: { status: null, correctedTime: null, offsetMinutes: null },
      time_out: { status: null, correctedTime: null, offsetMinutes: null },
    };
    for (const row of data) {
      const f = row.field as CorrectionField;
      const entry = {
        status: row.status as CorrectionStatus,
        correctedTime: row.corrected_time ?? null,
        offsetMinutes: row.timezone_offset_minutes ?? null,
      };
      // Most recent correction per field (rows are ordered newest first)
      if (latest[f].status === null) latest[f] = entry;
      // Prefer an approved correction even if a newer one is still pending
      if (
        String(row.status).toLowerCase() === 'approved' &&
        approved[f].status === null
      ) {
        approved[f] = entry;
      }
    }
    setCorrections({
      time_in: approved.time_in.status ? approved.time_in : latest.time_in,
      time_out: approved.time_out.status ? approved.time_out : latest.time_out,
    });
  };

  const fetchWorkSettings = async () => {
    const { data } = await supabase
      .from('settings')
      .select('work_start_time, work_end_time, grace_period_minutes')
      .eq('id', 1)
      .maybeSingle();
    if (data) setWorkSettings(data);
  };

  useEffect(() => {
    if (visible) {
      fetchWorkSettings();
      fetchCorrections();
    }
  }, [visible, attendanceId]);

  const formatIso = (iso: string) =>
    new Date(iso).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });

  // Correct button — hidden when approved
  const CorrectButton = ({ field }: { field: CorrectionField }) => {
    const fieldStatus = corrections[field].status;
    if (fieldStatus === 'approved') return null;
    const hasRecord = field === 'time_in' ? !!timeIn : !!timeOut;
    if (!hasRecord || !attendanceId || !userId) return null;

    return (
      <TouchableOpacity
        onPress={() => setCorrectionModal(field)}
        className="flex-row items-center px-3 py-1.5 rounded-xl bg-[#EAF2FF] border border-[#E8EDF5] ml-2"
        activeOpacity={0.7}
      >
        <Pencil size={12} color="#0066FF" />
        <Text style={{ color: '#0066FF', fontSize: 12, fontWeight: '700', marginLeft: 4 }}>
          Correct
        </Text>
      </TouchableOpacity>
    );
  };

  // Time row with inline status badge + correct button
  const TimeRow = ({
    field,
    icon,
    label,
    value,
  }: {
    field: CorrectionField;
    icon: React.ReactNode;
    label: string;
    value: string;
  }) => {
    const { status: fieldStatus, correctedTime } = corrections[field];
    const displayValue =
      fieldStatus === 'approved' && correctedTime
        ? formatIso(correctedTime)
        : value;
    return (
      <>
        <View className="py-3">
          <View className="flex-row items-center">
            <View className="w-9 h-9 rounded-xl bg-blue-50 items-center justify-center">
              {icon}
            </View>
            <Text className="text-gray-500 text-sm ml-3">{label}</Text>
          </View>
          <View className="flex-row items-center mt-2 ml-12">
            <Text className="text-gray-900 font-bold text-sm">{displayValue}</Text>
            {fieldStatus === 'approved' && (
              <CheckCircle2 size={14} color="#16834A" style={{ marginLeft: 6 }} />
            )}
            {fieldStatus !== 'approved' && fieldStatus !== null && (
              <View style={{ marginLeft: 8 }}>
                <CorrectionStatusBadge status={fieldStatus} />
              </View>
            )}
            <CorrectButton field={field} />
          </View>
        </View>
        <View className="h-px bg-gray-100" />
      </>
    );
  };

  const activeField = correctionModal;
  const activeRawIso =
    activeField === 'time_in' ? timeIn?.rawIso : timeOut?.rawIso;

  return (
    <>
      <Modal
        visible={visible}
        animationType="fade"
        transparent
        onRequestClose={onClose}
        statusBarTranslucent
      >
        <View className="flex-1 bg-white">
          <SafeAreaView className="flex-1">
            <View className="flex-row items-center justify-between px-5 pt-3 pb-4">
              <TouchableOpacity
                onPress={onClose}
                className="w-10 h-10 rounded-full bg-gray-100 items-center justify-center"
              >
                <ArrowLeft size={20} color="#1F2937" />
              </TouchableOpacity>
              <Text className="text-gray-900 font-bold text-lg">
                {mode === 'time-in' ? 'Time In Details' : 'Time Out Details'}
              </Text>
              <View className="w-10" />
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View className="px-5 pb-8">
                {/* Map + selfie card */}
                <View
                  className="rounded-3xl overflow-hidden border border-[#E8EDF5]"
                  style={{
                    height: 360,
                    shadowColor: '#0F1E36',
                    shadowOffset: { width: 0, height: 6 },
                    shadowOpacity: 0.08,
                    shadowRadius: 14,
                    elevation: 4,
                  }}
                >
                  {hasMap ? (
                    <WebView
                      originWhitelist={['*']}
                      source={{ html: buildMapHtml(lat, lng) }}
                      style={{ flex: 1 }}
                      scrollEnabled={false}
                      javaScriptEnabled
                      domStorageEnabled
                      startInLoadingState
                      renderLoading={() => (
                        <View className="absolute inset-0 bg-[#EAF2FF] items-center justify-center">
                          <ActivityIndicator color="#0066FF" />
                        </View>
                      )}
                    />
                  ) : (
                    <View className="flex-1 bg-[#EAF2FF] items-center justify-center">
                      <MapPin size={28} color="#0066FF" />
                      <Text className="text-[#64748B] text-sm mt-2">
                        Location unavailable
                      </Text>
                    </View>
                  )}

                  <View
                    className="absolute items-center"
                    style={{ bottom: 16, left: 0, right: 0 }}
                    pointerEvents="none"
                  >
                    <View
                      style={{
                        width: 140,
                        height: 140,
                        borderRadius: 20,
                        overflow: 'hidden',
                        borderWidth: 1,
                        borderColor: 'white',
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: 6 },
                        shadowOpacity: 0.25,
                        shadowRadius: 12,
                        elevation: 8,
                      }}
                    >
                      {focus?.selfieUrl ? (
                        <Image
                          source={{ uri: focus.selfieUrl }}
                          style={{ width: '100%', height: '100%' }}
                          resizeMode="cover"
                        />
                      ) : (
                        <View className="flex-1 bg-[#EAF2FF] items-center justify-center">
                          <Camera size={22} color="#0066FF" />
                          <Text className="text-[#0066FF] text-[10px] font-medium mt-1">
                            No Selfie
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                </View>

                {/* Detail rows */}
                <View className="mt-5 bg-[#F5F7FB] rounded-2xl p-4 border border-[#E8EDF5]">
                  {/* Date */}
                  <View className="py-3">
                    <View className="flex-row items-center">
                      <View className="w-9 h-9 rounded-xl bg-blue-50 items-center justify-center">
                        <CalendarDays size={16} color="#0066FF" />
                      </View>
                      <Text className="text-gray-500 text-sm ml-3">Date</Text>
                    </View>
                    <Text className="text-gray-900 font-bold text-sm mt-2 ml-12">
                      {dateLabel}
                    </Text>
                  </View>
                  <View className="h-px bg-gray-100" />

                  {/* Status */}
                  {statusConfig && (
                    <>
                      <View className="py-3">
                        <View className="flex-row items-center">
                          <View className="w-9 h-9 rounded-xl bg-blue-50 items-center justify-center">
                            <CheckCircle2 size={16} color={statusConfig.text} />
                          </View>
                          <Text className="text-gray-500 text-sm ml-3">Status</Text>
                        </View>
                        <Text
                          className="text-gray-900 font-bold text-sm mt-2 ml-12"
                          style={{ color: statusConfig.text }}
                        >
                          {statusConfig.label}
                        </Text>
                      </View>
                      <View className="h-px bg-gray-100" />
                    </>
                  )}

                  {/* Time In row with Correct button */}
                  <TimeRow
                    field="time_in"
                    icon={<LogIn size={16} color="#0066FF" />}
                    label="Time In"
                    value={timeIn?.time ?? '--:--'}
                  />

                  {/* Time Out row with Correct button */}
                  <TimeRow
                    field="time_out"
                    icon={<LogOut size={16} color="#0066FF" />}
                    label="Time Out"
                    value={timeOut?.time ?? '--:--'}
                  />

                  {/* Location */}
                  <View className="py-3">
                    <View className="flex-row items-center">
                      <View className="w-9 h-9 rounded-xl bg-blue-50 items-center justify-center">
                        <MapPin size={16} color="#0066FF" />
                      </View>
                      <Text className="text-gray-500 text-sm ml-3">Location</Text>
                    </View>
                    <Text className="text-gray-900 font-bold text-sm mt-2 ml-12">
                      {focus?.location ?? 'No location'}
                    </Text>
                  </View>

                  {totalHours != null && (
                    <>
                      <View className="h-px bg-gray-100" />
                      <View className="py-3">
                        <View className="flex-row items-center">
                          <View className="w-9 h-9 rounded-xl bg-blue-50 items-center justify-center">
                            <Timer size={16} color="#0066FF" />
                          </View>
                          <Text className="text-gray-500 text-sm ml-3">Total Hours</Text>
                        </View>
                        <Text className="text-gray-900 font-bold text-sm mt-2 ml-12">
                          {totalHours.toFixed(1)}h
                        </Text>
                      </View>
                    </>
                  )}

                  {overtime != null && (
                    <>
                      <View className="h-px bg-gray-100" />
                      <View className="py-3">
                        <View className="flex-row items-center">
                          <View className="w-9 h-9 rounded-xl bg-blue-50 items-center justify-center">
                            <Timer size={16} color="#0066FF" />
                          </View>
                          <Text className="text-gray-500 text-sm ml-3">Overtime</Text>
                        </View>
                        <Text className="text-gray-900 font-bold text-sm mt-2 ml-12">
                          {overtime.toFixed(1)}h
                        </Text>
                      </View>
                    </>
                  )}
                </View>
              </View>
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>

      {/* Time Correction bottom-sheet */}
      {correctionModal && attendanceId && userId && activeRawIso && (
        <TimeCorrectionModal
          visible={!!correctionModal}
          onClose={() => setCorrectionModal(null)}
          userId={userId}
          attendanceId={attendanceId}
          field={correctionModal}
          originalTime={activeRawIso}
          attendanceDate={attendanceDate}
          onSubmitted={fetchCorrections}
        />
      )}
    </>
  );
}
