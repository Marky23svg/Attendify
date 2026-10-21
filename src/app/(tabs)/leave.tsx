import { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  Alert,
  Platform,
  ActivityIndicator,
  Modal,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import DateTimePicker, {
  DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import {
  Plane,
  HeartPulse,
  User,
  MoreHorizontal,
  Calendar,
  Clock,
  Info,
  ArrowRight,
  ChevronRight,
  LayoutGrid,
  FileText,
  CheckCircle2,
  XCircle,
  AlertCircle,
  X,
} from 'lucide-react-native';
import { supabase } from '../../lib/supabase';

type LeaveType = 'vacation' | 'sick' | 'personal' | 'other';
type Tab = 'form' | 'requests';

interface LeaveRequest {
  id: number;
  leave_type: string;
  custom_type: string | null;
  start_date: string;
  end_date: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  review_notes: string | null;
  created_at: string;
  reviewed_at: string | null;
}

export default function LeaveScreen() {
  const [activeTab, setActiveTab] = useState<Tab>('form');

  // Form state
  const [leaveType, setLeaveType] = useState<LeaveType>('vacation');
  const [customLeaveType, setCustomLeaveType] = useState('');
  const [startDate, setStartDate] = useState(new Date());
  const [endDate, setEndDate] = useState(new Date());
  const [reason, setReason] = useState('');
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [loading, setLoading] = useState(false);

  // Requests state
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<LeaveRequest | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  // Slide animation for the request details sheet
  const slideAnim = useRef(new Animated.Value(500)).current;

  useEffect(() => {
    if (modalVisible) {
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start();
    } else {
      slideAnim.setValue(500);
    }
  }, [modalVisible]);

  const leaveTypes = [
    { label: 'Vacation', value: 'vacation' as LeaveType, Icon: Plane },
    { label: 'Sick Leave', value: 'sick' as LeaveType, Icon: HeartPulse },
    { label: 'Personal', value: 'personal' as LeaveType, Icon: User },
    { label: 'Other', value: 'other' as LeaveType, Icon: MoreHorizontal },
  ];

  const formatDate = (date: Date): string =>
    date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

  const formatWeekday = (date: Date): string =>
    date.toLocaleDateString('en-US', { weekday: 'long' });

  const toDateString = (date: Date): string => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const getDayDifference = (): number => {
    const start = new Date(
      startDate.getFullYear(),
      startDate.getMonth(),
      startDate.getDate()
    );
    const end = new Date(
      endDate.getFullYear(),
      endDate.getMonth(),
      endDate.getDate()
    );

    return (
      Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1
    );
  };

  const formatDisplayDate = (dateStr: string): string =>
    new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

  const onStartChange = (event: DateTimePickerEvent, date?: Date) => {
    setShowStartPicker(false);
    if (event.type === 'set' && date) {
      setStartDate(date);
    }
  };

  const onEndChange = (event: DateTimePickerEvent, date?: Date) => {
    setShowEndPicker(false);
    if (event.type === 'set' && date) {
      setEndDate(date);
    }
  };

  const loadRequests = async () => {
    setRequestsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setRequests([]);
        setRequestsLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('leave_requests')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Leave fetch error:', error);
        setRequests([]);
      } else {
        setRequests(data || []);
      }
    } catch (err) {
      console.error('Unexpected error:', err);
    } finally {
      setRequestsLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      if (activeTab === 'requests') {
        loadRequests();
      }
    }, [activeTab])
  );

  const submitLeave = async () => {
    const start = new Date(
      startDate.getFullYear(),
      startDate.getMonth(),
      startDate.getDate()
    );
    const end = new Date(
      endDate.getFullYear(),
      endDate.getMonth(),
      endDate.getDate()
    );

    if (end < start) {
      Alert.alert('Invalid dates', 'End date must be on or after the start date.');
      return;
    }

    if (leaveType === 'other' && !customLeaveType.trim()) {
      Alert.alert('Missing information', 'Please specify your leave type.');
      return;
    }

    if (!reason.trim()) {
      Alert.alert('Missing information', 'Please provide a reason for your leave.');
      return;
    }

    setLoading(true);

    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();

      if (userError || !user) {
        Alert.alert('Not signed in', 'Please log in again.');
        setLoading(false);
        return;
      }

      const { error } = await supabase.from('leave_requests').insert({
        user_id: user.id,
        leave_type: leaveType,
        custom_type: leaveType === 'other' ? customLeaveType.trim() : null,
        start_date: toDateString(start),
        end_date: toDateString(end),
        reason: reason.trim(),
        status: 'pending',
      });

      setLoading(false);

      if (error) {
        Alert.alert('Submission failed', error.message);
        return;
      }

      Alert.alert(
        'Request submitted',
        `Your leave request has been submitted successfully.`,
        [{ text: 'OK' }]
      );

      setReason('');
      setLeaveType('vacation');
      setCustomLeaveType('');
      setStartDate(new Date());
      setEndDate(new Date());
    } catch (err) {
      setLoading(false);
      Alert.alert('Error', 'Something went wrong. Please try again.');
      console.error(err);
    }
  };

  const openRequestDetails = (req: LeaveRequest) => {
    setSelectedRequest(req);
    setModalVisible(true);
  };

  const closeModal = () => {
    setModalVisible(false);
    setSelectedRequest(null);
  };

  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'approved':
        return {
          label: 'Approved',
          bg: '#EAF8F0',
          text: '#16834A',
          Icon: CheckCircle2,
        };
      case 'rejected':
        return {
          label: 'Rejected',
          bg: '#FEE9EB',
          text: '#DC2626',
          Icon: XCircle,
        };
      default:
        return {
          label: 'Pending',
          bg: '#FEF3C7',
          text: '#D97706',
          Icon: AlertCircle,
        };
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-[#F5F7FB]" edges={['top']}>

      {/* Header */}
      <View className="px-5 pt-5 pb-4">
        <Text className="text-gray-900 font-bold text-xl">
          Leave Management
        </Text>
        <Text className="text-gray-500 text-xs leading-5 mt-1">
          Submit requests and track their status
        </Text>
      </View>

      {/* Tabs */}
      <View className="flex-row mx-5 mb-4 bg-white rounded-2xl p-1 border border-gray-200">
        <Pressable
          onPress={() => setActiveTab('form')}
          className={`flex-1 flex-row items-center justify-center py-3 rounded-xl ${
            activeTab === 'form' ? 'bg-[#0066FF]' : 'bg-transparent'
          }`}
        >
          <FileText
            size={16}
            color={activeTab === 'form' ? '#FFFFFF' : '#64748B'}
          />
          <Text
            className={`ml-2 font-semibold text-sm ${
              activeTab === 'form' ? 'text-white' : 'text-gray-500'
            }`}
          >
            New Request
          </Text>
        </Pressable>

        <Pressable
          onPress={() => setActiveTab('requests')}
          className={`flex-1 flex-row items-center justify-center py-3 rounded-xl ${
            activeTab === 'requests' ? 'bg-[#0066FF]' : 'bg-transparent'
          }`}
        >
          <Clock
            size={16}
            color={activeTab === 'requests' ? '#FFFFFF' : '#64748B'}
          />
          <Text
            className={`ml-2 font-semibold text-sm ${
              activeTab === 'requests' ? 'text-white' : 'text-gray-500'
            }`}
          >
            My Requests
          </Text>
        </Pressable>
      </View>

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 36 }}
      >

        {activeTab === 'form' ? (
          <>
            {/* Information Banner */}
            <View className="mx-5 mb-6 rounded-2xl bg-blue-600 p-5 overflow-hidden">
              <View className="flex-row items-start">
                <View className="w-11 h-11 rounded-xl bg-white/20 items-center justify-center">
                  <LayoutGrid size={22} color="#FFFFFF" />
                </View>

                <View className="flex-1 ml-3">
                  <Text className="text-white font-bold text-base">
                    Take time for yourself
                  </Text>
                  <Text className="text-blue-100 text-sm mt-1 leading-5">
                    Submit your preferred dates and provide a reason for your leave.
                  </Text>
                </View>
              </View>
            </View>

            {/* Form Card */}
            <View className="mx-5 bg-white rounded-3xl p-5 border border-gray-200">
              <View className="flex-row items-center mb-5">
                <View className="w-9 h-9 rounded-xl bg-blue-50 items-center justify-center">
                  <Text className="text-blue-600 font-bold text-base">1</Text>
                </View>
                <View className="ml-3">
                  <Text className="text-gray-900 text-lg font-bold">
                    Leave details
                  </Text>
                  <Text className="text-gray-400 text-xs mt-0.5">
                    Choose the type of leave you need
                  </Text>
                </View>
              </View>

              <Text className="text-gray-700 font-semibold text-sm mb-3">
                Leave type <Text className="text-red-500">*</Text>
              </Text>

              <View className="flex-row flex-wrap justify-between">
                {leaveTypes.map((type) => {
                  const selected = leaveType === type.value;
                  const IconComponent = type.Icon;

                  return (
                    <Pressable
                      key={type.value}
                      onPress={() => setLeaveType(type.value)}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: selected }}
                      className={`w-[48%] mb-3 rounded-2xl border p-3 ${
                        selected
                          ? 'bg-blue-50 border-blue-600'
                          : 'bg-white border-gray-200'
                      }`}
                    >
                      <View className="flex-row items-center justify-between mb-3">
                        <View
                          className={`w-10 h-10 rounded-xl items-center justify-center ${
                            selected ? 'bg-blue-600' : 'bg-gray-100'
                          }`}
                        >
                          <IconComponent
                            size={20}
                            color={selected ? '#FFFFFF' : '#4B5563'}
                          />
                        </View>
                        <View
                          className={`w-5 h-5 rounded-full border items-center justify-center ${
                            selected
                              ? 'bg-blue-600 border-blue-600'
                              : 'border-gray-300'
                          }`}
                        >
                          {selected && (
                            <View className="w-2 h-2 rounded-full bg-white" />
                          )}
                        </View>
                      </View>
                      <Text
                        className={`font-semibold text-sm ${
                          selected ? 'text-blue-700' : 'text-gray-700'
                        }`}
                      >
                        {type.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {leaveType === 'other' && (
                <View className="mt-1 mb-5">
                  <Text className="text-gray-700 font-semibold text-sm mb-2">
                    Specify leave type <Text className="text-red-500">*</Text>
                  </Text>
                  <TextInput
                    value={customLeaveType}
                    onChangeText={setCustomLeaveType}
                    placeholder="e.g. Maternity, Emergency"
                    placeholderTextColor="#9CA3AF"
                    className="bg-gray-50 border border-gray-200 rounded-2xl px-4 py-4 text-gray-800"
                  />
                </View>
              )}

              <View className="h-px bg-gray-100 my-5" />

              <View className="flex-row items-center mb-5">
                <View className="w-9 h-9 rounded-xl bg-blue-50 items-center justify-center">
                  <Text className="text-blue-600 font-bold text-base">2</Text>
                </View>
                <View className="ml-3">
                  <Text className="text-gray-900 text-lg font-bold">
                    Select dates
                  </Text>
                  <Text className="text-gray-400 text-xs mt-0.5">
                    When will your leave begin and end?
                  </Text>
                </View>
              </View>

              <Text className="text-gray-700 font-semibold text-sm mb-2">
                Start date <Text className="text-red-500">*</Text>
              </Text>

              <Pressable
                onPress={() => {
                  setShowEndPicker(false);
                  setShowStartPicker(true);
                }}
                className="flex-row items-center rounded-2xl border border-gray-200 bg-gray-50 p-4 mb-4 active:bg-blue-50"
              >
                <View className="w-11 h-11 rounded-xl bg-white border border-gray-100 items-center justify-center">
                  <Calendar size={20} color="#2563EB" />
                </View>
                <View className="flex-1 ml-3">
                  <Text className="text-gray-400 text-xs mb-1">STARTING ON</Text>
                  <Text className="text-gray-900 font-bold text-base">
                    {formatDate(startDate)}
                  </Text>
                  <Text className="text-gray-500 text-xs mt-1">
                    {formatWeekday(startDate)}
                  </Text>
                </View>
                <ChevronRight size={20} color="#2563EB" />
              </Pressable>

              {showStartPicker && (
                <DateTimePicker
                  value={startDate}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={onStartChange}
                />
              )}

              <Text className="text-gray-700 font-semibold text-sm mb-2">
                End date <Text className="text-red-500">*</Text>
              </Text>

              <Pressable
                onPress={() => {
                  setShowStartPicker(false);
                  setShowEndPicker(true);
                }}
                className="flex-row items-center rounded-2xl border border-gray-200 bg-gray-50 p-4"
              >
                <View className="w-11 h-11 rounded-xl bg-white border border-gray-100 items-center justify-center">
                  <Calendar size={20} color="#2563EB" />
                </View>
                <View className="flex-1 ml-3">
                  <Text className="text-gray-400 text-xs mb-1">ENDING ON</Text>
                  <Text className="text-gray-900 font-bold text-base">
                    {formatDate(endDate)}
                  </Text>
                  <Text className="text-gray-500 text-xs mt-1">
                    {formatWeekday(endDate)}
                  </Text>
                </View>
                <ChevronRight size={20} color="#2563EB" />
              </Pressable>

              {showEndPicker && (
                <DateTimePicker
                  value={endDate}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={onEndChange}
                />
              )}

              <View className="flex-row items-center bg-blue-50 rounded-2xl p-4 mt-4">
                <View className="flex-1">
                  <Text className="text-blue-700 text-xs font-medium">
                    TOTAL DURATION
                  </Text>
                  <Text className="text-blue-900 text-lg font-bold mt-1">
                    {getDayDifference() > 0
                      ? `${getDayDifference()} ${
                          getDayDifference() === 1 ? 'day' : 'days'
                        }`
                      : 'Check your dates'}
                  </Text>
                </View>
                <View className="w-10 h-10 rounded-xl bg-white items-center justify-center">
                  <Clock size={20} color="#2563EB" />
                </View>
              </View>

              <View className="h-px bg-gray-100 my-6" />

              <View className="flex-row items-center mb-5">
                <View className="w-9 h-9 rounded-xl bg-blue-50 items-center justify-center">
                  <Text className="text-blue-600 font-bold text-base">3</Text>
                </View>
                <View className="ml-3">
                  <Text className="text-gray-900 text-lg font-bold">
                    Reason for leave
                  </Text>
                  <Text className="text-gray-400 text-xs mt-0.5">
                    Tell us a little about your request
                  </Text>
                </View>
              </View>

              <Text className="text-gray-700 font-semibold text-sm mb-2">
                Reason <Text className="text-red-500">*</Text>
              </Text>

              <TextInput
                value={reason}
                onChangeText={setReason}
                placeholder="Write your reason here..."
                placeholderTextColor="#9CA3AF"
                multiline
                numberOfLines={5}
                maxLength={500}
                textAlignVertical="top"
                className="bg-gray-50 border border-gray-200 rounded-2xl p-4 text-gray-800"
                style={{ minHeight: 130 }}
              />

              <Text className="text-gray-400 text-xs text-right mt-2">
                {reason.length}/500 characters
              </Text>

              <View className="flex-row items-start mt-4 mb-2">
                <Info
                  size={14}
                  color="#9CA3AF"
                  style={{ marginRight: 6, marginTop: 2 }}
                />
                <Text className="flex-1 text-gray-400 text-xs leading-5">
                  Please make sure your dates and details are correct before
                  submitting your leave request.
                </Text>
              </View>

              <Pressable
                onPress={submitLeave}
                disabled={loading}
                className={`rounded-2xl py-4 px-5 mt-5 flex-row items-center justify-center ${
                  loading ? 'bg-blue-400' : 'bg-[#0066FF]'
                }`}
                style={{
                  shadowColor: '#0066FF',
                  shadowOffset: { width: 0, height: 5 },
                  shadowOpacity: loading ? 0 : 0.25,
                  shadowRadius: 10,
                  elevation: loading ? 0 : 4,
                }}
              >
                {loading ? (
                  <>
                    <ActivityIndicator color="#FFFFFF" size="small" />
                    <Text className="text-white font-bold text-base ml-2">
                      Submitting request...
                    </Text>
                  </>
                ) : (
                  <>
                    <Text className="text-white font-bold text-base">
                      Submit Leave Request
                    </Text>
                    <ArrowRight size={20} color="#FFFFFF" style={{ marginLeft: 8 }} />
                  </>
                )}
              </Pressable>

              <Text className="text-gray-400 text-xs text-center mt-4">
                Your request will be submitted for approval.
              </Text>
            </View>
          </>
        ) : (
          <>
            <View className="mx-5">
              <View className="mb-4">
                <Text className="text-lg font-bold text-[#0F1E36]">
                  My Leave Requests
                </Text>
                <Text className="text-xs text-gray-500 mt-1">
                  {requestsLoading
                    ? 'Loading...'
                    : `${requests.length} request${
                        requests.length === 1 ? '' : 's'
                      } submitted`}
                </Text>
              </View>

              {requestsLoading ? (
                <View className="bg-white rounded-3xl p-8 border border-gray-200 items-center">
                  <ActivityIndicator size="large" color="#0066FF" />
                  <Text className="text-gray-500 text-sm mt-3">
                    Loading requests...
                  </Text>
                </View>
              ) : requests.length === 0 ? (
                <View className="bg-white rounded-3xl p-8 border border-gray-200 items-center">
                  <View className="w-16 h-16 rounded-3xl bg-[#EAF2FF] items-center justify-center mb-4">
                    <FileText size={28} color="#0066FF" />
                  </View>
                  <Text className="text-[#0F1E36] font-bold text-lg">
                    No leave requests yet
                  </Text>
                  <Text className="text-sm text-gray-500 mt-1 text-center">
                    Submit your first leave request from the New Request tab.
                  </Text>
                  <Pressable
                    onPress={() => setActiveTab('form')}
                    className="mt-5 bg-[#0066FF] rounded-2xl py-3 px-6 flex-row items-center"
                    style={{
                      shadowColor: '#0066FF',
                      shadowOffset: { width: 0, height: 4 },
                      shadowOpacity: 0.25,
                      shadowRadius: 8,
                      elevation: 4,
                    }}
                  >
                    <FileText size={16} color="white" />
                    <Text className="text-white font-bold ml-2">
                      New Request
                    </Text>
                  </Pressable>
                </View>
              ) : (
                <View className="gap-3">
                  {requests.map((req) => {
                    const status = getStatusConfig(req.status);
                    const StatusIcon = status.Icon;

                    return (
                      <Pressable
                        key={req.id}
                        onPress={() => openRequestDetails(req)}
                        className="bg-white rounded-2xl p-4 border border-gray-200 active:bg-gray-50"
                        style={{
                          shadowColor: '#0F1E36',
                          shadowOffset: { width: 0, height: 3 },
                          shadowOpacity: 0.06,
                          shadowRadius: 8,
                          elevation: 2,
                        }}
                      >
                        <View className="flex-row items-start justify-between mb-3">
                          <View className="flex-1">
                            <Text className="text-[#0F1E36] font-bold text-base capitalize">
                              {req.leave_type === 'other'
                                ? req.custom_type || 'Other'
                                : req.leave_type}
                            </Text>
                            <Text className="text-gray-500 text-xs mt-1">
                              {formatDisplayDate(req.start_date)} –{' '}
                              {formatDisplayDate(req.end_date)}
                            </Text>
                          </View>
                          <View
                            className="flex-row items-center rounded-full px-2.5 py-1.5"
                            style={{ backgroundColor: status.bg }}
                          >
                            <StatusIcon size={12} color={status.text} />
                            <Text
                              className="text-xs font-bold ml-1"
                              style={{ color: status.text }}
                            >
                              {status.label}
                            </Text>
                          </View>
                        </View>

                        <Text
                          className="text-gray-500 text-xs"
                          numberOfLines={2}
                        >
                          {req.reason}
                        </Text>

                        <View className="flex-row items-center justify-between mt-3 pt-3 border-t border-gray-100">
                          <Text className="text-gray-400 text-xs">
                            Submitted {formatDisplayDate(req.created_at)}
                          </Text>
                          <View className="flex-row items-center">
                            <Text className="text-[#0066FF] text-xs font-semibold mr-1">
                              View details
                            </Text>
                            <ChevronRight size={14} color="#0066FF" />
                          </View>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </View>
          </>
        )}
      </ScrollView>

      {/* Request Details Modal — backdrop stays, sheet slides */}
      <Modal
        visible={modalVisible}
        animationType="fade"
        transparent
        onRequestClose={closeModal}
        statusBarTranslucent
      >
        <View className="flex-1 justify-end bg-black/50">
          <Animated.View
            style={{ transform: [{ translateY: slideAnim }] }}
            className="bg-white rounded-t-[40px] max-h-[85%] pb-6"
          >
            {/* Drag handle */}
            <View className="items-center pt-3 pb-2">
              <View className="w-12 h-1.5 bg-gray-200 rounded-full" />
            </View>

            {selectedRequest && (
              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 20 }}
              >
                {/* Modal Header */}
                <View className="flex-row items-center justify-between px-6 pt-3 pb-4">
                  <View className="flex-1">
                    <Text className="text-[#0F1E36] font-bold text-xl">
                      Leave Request
                    </Text>
                    <Text className="text-gray-500 text-xs mt-0.5">
                      Submitted {formatDisplayDate(selectedRequest.created_at)}
                    </Text>
                  </View>
                  <Pressable
                    onPress={closeModal}
                    className="w-9 h-9 rounded-full bg-gray-100 items-center justify-center"
                  >
                    <X size={18} color="#374151" />
                  </Pressable>
                </View>

                {/* Status Badge */}
                <View className="px-6 mb-5">
                  {(() => {
                    const status = getStatusConfig(selectedRequest.status);
                    const StatusIcon = status.Icon;
                    return (
                      <View
                        className="flex-row items-center rounded-2xl px-4 py-3"
                        style={{ backgroundColor: status.bg }}
                      >
                        <StatusIcon size={18} color={status.text} />
                        <Text
                          className="font-bold ml-2"
                          style={{ color: status.text }}
                        >
                          {status.label}
                        </Text>
                        <Text
                          className="text-xs ml-2"
                          style={{ color: status.text, opacity: 0.8 }}
                        >
                          {selectedRequest.status === 'pending'
                            ? '· Awaiting admin approval'
                            : selectedRequest.status === 'approved'
                            ? '· Approved by admin'
                            : '· Rejected by admin'}
                        </Text>
                      </View>
                    );
                  })()}
                </View>

                {/* Info Card */}
                <View className="px-6">
                  <View className="bg-[#F5F7FB] rounded-2xl p-4 border border-[#E8EDF5]">

                    <View className="py-3">
                      <View className="flex-row items-center">
                        <View className="w-9 h-9 rounded-xl bg-blue-50 items-center justify-center">
                          <FileText size={16} color="#0066FF" />
                        </View>
                        <Text className="text-gray-500 text-sm ml-3">
                          Leave Type
                        </Text>
                      </View>
                      <Text className="text-gray-900 font-bold text-sm mt-2 ml-12 capitalize">
                        {selectedRequest.leave_type === 'other'
                          ? selectedRequest.custom_type || 'Other'
                          : selectedRequest.leave_type}
                      </Text>
                    </View>

                    <View className="h-px bg-gray-100" />

                    <View className="py-3">
                      <View className="flex-row items-center">
                        <View className="w-9 h-9 rounded-xl bg-blue-50 items-center justify-center">
                          <Calendar size={16} color="#0066FF" />
                        </View>
                        <Text className="text-gray-500 text-sm ml-3">
                          Duration
                        </Text>
                      </View>
                      <Text className="text-gray-900 font-bold text-sm mt-2 ml-12">
                        {formatDisplayDate(selectedRequest.start_date)} –{' '}
                        {formatDisplayDate(selectedRequest.end_date)}
                      </Text>
                    </View>

                    <View className="h-px bg-gray-100" />

                    <View className="py-3">
                      <View className="flex-row items-center">
                        <View className="w-9 h-9 rounded-xl bg-blue-50 items-center justify-center">
                          <Info size={16} color="#0066FF" />
                        </View>
                        <Text className="text-gray-500 text-sm ml-3">
                          Reason
                        </Text>
                      </View>
                      <Text className="text-gray-900 font-medium text-sm mt-2 ml-12 leading-5">
                        {selectedRequest.reason}
                      </Text>
                    </View>

                    {selectedRequest.review_notes && (
                      <>
                        <View className="h-px bg-gray-100" />
                        <View className="py-3">
                          <View className="flex-row items-center">
                            <View className="w-9 h-9 rounded-xl bg-blue-50 items-center justify-center">
                              <FileText size={16} color="#0066FF" />
                            </View>
                            <Text className="text-gray-500 text-sm ml-3">
                              Admin Notes
                            </Text>
                          </View>
                          <Text className="text-gray-900 font-medium text-sm mt-2 ml-12 leading-5">
                            {selectedRequest.review_notes}
                          </Text>
                        </View>
                      </>
                    )}
                  </View>
                </View>

                {/* Close Button */}
                <View className="px-6 mt-5">
                  <Pressable
                    onPress={closeModal}
                    className="rounded-2xl py-4 items-center bg-[#0066FF]"
                    style={{
                      shadowColor: '#0066FF',
                      shadowOffset: { width: 0, height: 4 },
                      shadowOpacity: 0.25,
                      shadowRadius: 8,
                      elevation: 4,
                    }}
                  >
                    <Text className="text-white font-bold text-base">
                      Close
                    </Text>
                  </Pressable>
                </View>
              </ScrollView>
            )}
          </Animated.View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}