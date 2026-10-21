import DateTimePicker from '@react-native-community/datetimepicker';
import {
  CheckCircle2,
  Clock3,
  Pencil,
  ShieldCheck,
  X,
} from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Modal,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { supabase } from '../lib/supabase';

export type CorrectionStatus = 'pending' | 'approved' | 'rejected' | null;

interface TimeCorrectionModalProps {
  visible: boolean;
  onClose: () => void;
  userId: string;
  attendanceId: number;
  field: 'time_in' | 'time_out';
  originalTime: string; // ISO string
  attendanceDate: string; // 'YYYY-MM-DD'
  onSubmitted: () => void;
}

export default function TimeCorrectionModal({
  visible,
  onClose,
  userId,
  attendanceId,
  field,
  originalTime,
  attendanceDate,
  onSubmitted,
}: TimeCorrectionModalProps) {
  const slideAnim = useRef(new Animated.Value(600)).current;

  const originalDate = new Date(originalTime);
  const [pickedTime, setPickedTime] = useState(originalDate);
  const [showPicker, setShowPicker] = useState(false);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (visible) {
      setPickedTime(new Date(originalTime));
      setReason('');
      setShowPicker(false);
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start();
    } else {
      slideAnim.setValue(600);
    }
  }, [visible]);

  const slideDown = (cb: () => void) => {
    Animated.timing(slideAnim, {
      toValue: 600,
      duration: 280,
      useNativeDriver: true,
    }).start(cb);
  };

  const handleClose = () => {
    if (submitting) return;
    slideDown(onClose);
  };

  const buildCorrectedTimestamp = (): string => {
    const [y, m, d] = attendanceDate.split('-').map(Number);
    const corrected = new Date(y, m - 1, d);
    corrected.setHours(pickedTime.getHours(), pickedTime.getMinutes(), 0, 0);
    return corrected.toISOString();
  };

  const handleSubmit = async () => {
    if (!reason.trim()) {
      Alert.alert('Reason required', 'Please provide a reason for the correction.');
      return;
    }
    setSubmitting(true);
    try {
      const correctedTime = buildCorrectedTimestamp();
      const payload = {
        user_id: userId,
        attendance_id: attendanceId,
        field,
        original_time: originalTime,
        corrected_time: correctedTime,
        message: reason.trim(),
        status: 'pending',
      };

      // Persist the device's UTC offset so the server-side approval trigger can
      // recover the intended local wall-clock time when recomputing status.
      const timezoneOffsetMinutes = -new Date(correctedTime).getTimezoneOffset();

      let { error } = await supabase.from('time_corrections').insert({
        ...payload,
        timezone_offset_minutes: timezoneOffsetMinutes,
      });

      // Fallback for databases where the offset column has not been added yet.
      if (error && /timezone_offset_minutes/i.test(error.message ?? '')) {
        ({ error } = await supabase.from('time_corrections').insert(payload));
      }

      if (error) throw error;
      onSubmitted();
      onClose();
    } catch (err: any) {
      Alert.alert('Submission failed', err?.message || 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const formattedOriginal = originalDate.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  const formattedDate = new Date(attendanceDate + 'T00:00:00').toLocaleDateString(
    'en-US',
    { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }
  );

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <Pressable className="flex-1 justify-end bg-black/50" onPress={handleClose}>
        <Animated.View
          style={{ transform: [{ translateY: slideAnim }] }}
          className="bg-white rounded-t-[40px] pb-8"
          onStartShouldSetResponder={() => true}
        >
          {/* Drag handle */}
          <View className="items-center pt-3 pb-2">
            <View className="w-12 h-1.5 bg-gray-200 rounded-full" />
          </View>

          {/* Header */}
          <View className="flex-row items-center justify-between px-6 pt-3 pb-5">
            <View className="flex-row items-center">
              <View className="w-11 h-11 rounded-2xl bg-[#EAF2FF] items-center justify-center">
                <Pencil size={20} color="#0066FF" />
              </View>
              <Text className="text-[#0F1E36] font-bold text-xl ml-3">
                Time Correction
              </Text>
            </View>
            <Pressable
              onPress={handleClose}
              disabled={submitting}
              className="w-9 h-9 rounded-full bg-gray-100 items-center justify-center"
            >
              <X size={18} color="#374151" />
            </Pressable>
          </View>

          <View className="px-6">
            {/* Info block */}
            <View className="bg-[#F8FAFD] rounded-2xl p-4 mb-4">
              <Text className="text-[#64748B] text-xs mb-1">Date</Text>
              <Text className="text-[#0F1E36] font-semibold text-sm">
                {formattedDate}
              </Text>
              <Text className="text-[#64748B] text-xs mt-3 mb-1">
                Current {field === 'time_in' ? 'Time In' : 'Time Out'}
              </Text>
              <Text className="text-[#0F1E36] font-semibold text-sm">
                {formattedOriginal}
              </Text>
            </View>

            {/* Time picker */}
            <Text className="text-[#0F1E36] text-xs font-semibold mb-2 ml-1">
              Corrected Time
            </Text>
            {Platform.OS === 'ios' ? (
              <View className="items-center mb-4">
                <DateTimePicker
                  value={pickedTime}
                  mode="time"
                  display="spinner"
                  onChange={(_, date) => date && setPickedTime(date)}
                  style={{ width: '100%' }}
                />
              </View>
            ) : (
              <View className="mb-4">
                <Pressable
                  onPress={() => setShowPicker(true)}
                  className="bg-[#F5F7FB] rounded-2xl border border-[#E8EDF5] px-4 py-3.5 flex-row items-center"
                >
                  <Text className="flex-1 text-[#0F1E36] font-semibold text-sm">
                    {pickedTime.toLocaleTimeString('en-US', {
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: true,
                    })}
                  </Text>
                  <Text className="text-[#0066FF] text-xs font-bold">Change</Text>
                </Pressable>
                {showPicker && (
                  <DateTimePicker
                    value={pickedTime}
                    mode="time"
                    display="default"
                    onChange={(_, date) => {
                      setShowPicker(false);
                      if (date) setPickedTime(date);
                    }}
                  />
                )}
              </View>
            )}

            {/* Reason */}
            <Text className="text-[#0F1E36] text-xs font-semibold mb-2 ml-1">
              Reason
            </Text>
            <TextInput
              value={reason}
              onChangeText={(t) => setReason(t.slice(0, 300))}
              placeholder="Describe why this correction is needed..."
              placeholderTextColor="#9CA3AF"
              multiline
              numberOfLines={3}
              editable={!submitting}
              className="bg-[#F5F7FB] rounded-2xl border border-[#E8EDF5] px-4 py-3 text-[#0F1E36] text-sm mb-1"
              style={{ textAlignVertical: 'top', minHeight: 80 }}
            />
            <Text className="text-[#64748B] text-xs text-right mb-4">
              {reason.length}/300
            </Text>

            {/* Info banner */}
            <View className="flex-row items-start bg-[#EAF2FF] rounded-2xl px-4 py-3 mb-5">
              <ShieldCheck size={14} color="#0066FF" style={{ marginTop: 2 }} />
              <Text className="flex-1 text-[#0F1E36] text-xs ml-2 leading-5">
                Your request will be sent to an admin for approval
              </Text>
            </View>

            {/* Footer */}
            <View className="flex-row gap-3">
              <Pressable
                onPress={handleClose}
                disabled={submitting}
                className="flex-1 py-4 rounded-2xl items-center border border-[#E8EDF5]"
              >
                <Text className="text-[#0F1E36] font-bold text-base">Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleSubmit}
                disabled={submitting}
                className="flex-1 py-4 rounded-2xl items-center bg-[#0066FF]"
                style={{
                  shadowColor: '#0066FF',
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.25,
                  shadowRadius: 8,
                  elevation: 4,
                }}
              >
                {submitting ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text className="text-white font-bold text-base">
                    Submit Request
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

// ── Status pill helper (exported for use in AttendanceDetailModal) ──────────

interface CorrectionStatusBadgeProps {
  status: CorrectionStatus;
}

export function CorrectionStatusBadge({ status }: CorrectionStatusBadgeProps) {
  if (status === 'pending') {
    return (
      <View className="flex-row items-center bg-[#FEF3C7] rounded-full px-2.5 py-1">
        <Clock3 size={11} color="#D97706" />
        <Text className="text-[#D97706] text-[11px] font-bold ml-1">Pending</Text>
      </View>
    );
  }
  if (status === 'approved') {
    return <CheckCircle2 size={16} color="#16834A" />;
  }
  if (status === 'rejected') {
    return (
      <View className="flex-row items-center bg-[#FEE9EB] rounded-full px-2.5 py-1">
        <Text className="text-[#DC2626] text-[11px] font-bold">Rejected</Text>
      </View>
    );
  }
  return null;
}
