import { decode } from 'base64-arraybuffer';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import { useFocusEffect } from 'expo-router';
import {
  ArrowLeft,
  CalendarDays,
  Camera as CameraIcon,
  CheckCircle2,
  Clock,
  LogIn,
  LogOut,
  MapPin,
  RotateCcw,
  X,
} from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  Modal,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { useWorkSettings, type WorkSettings } from '../../hooks/useWorkSettings';
import { buildMapHtml } from '../../lib/buildMapHtml';
import { computeOvertime } from '../../lib/overtime';
import { supabase } from '../../lib/supabase';

type Stage = 'choice' | 'camera' | 'preview';
type Mode = 'time-in' | 'time-out';

interface CapturedData {
  uri: string;
  base64: string;
  mode: Mode;
  date: string;
  time: string;
  location: string;
  lat: number;
  lng: number;
}

const timeStringToMinutes = (t: string): number => {
  const [h = '0', m = '0', s = '0'] = t.split(':');
  return Number(h) * 60 + Number(m) + Number(s) / 60;
};

const toDateString = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const formatTime12 = (t: string): string => {
  const [hStr = '0', mStr = '0'] = t.split(':');
  let hours = Number(hStr);
  const minutes = String(Number(mStr)).padStart(2, '0');
  const period = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  if (hours === 0) hours = 12;
  return `${hours}:${minutes} ${period}`;
};

const computeStatus = (
  timeIn: Date,
  settings: WorkSettings
): 'present' | 'late' => {
  const clockInMinutes =
    timeIn.getHours() * 60 + timeIn.getMinutes() + timeIn.getSeconds() / 60;
  const latestClockIn =
    timeStringToMinutes(settings.work_start_time) + settings.grace_period_minutes;
  return clockInMinutes <= latestClockIn ? 'present' : 'late';
};

const computeTotalHours = (timeIn: Date, timeOut: Date): number => {
  const diffMs = timeOut.getTime() - timeIn.getTime();
  if (diffMs <= 0) return 0;
  return Math.round((diffMs / 3_600_000) * 100) / 100;
};

const withTimeout = <T,>(promise: Promise<T>, ms: number): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });

export default function TimeInOutScreen() {
  const { settings, loading: settingsLoading } = useWorkSettings();
  const [timedIn, setTimedIn] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [stage, setStage] = useState<Stage>('choice');
  const [mode, setMode] = useState<Mode>('time-in');
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<'front' | 'back'>('front');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [captured, setCaptured] = useState<CapturedData | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [locState, setLocState] = useState<
    'idle' | 'pending' | 'ready' | 'failed'
  >('idle');
  const locationPromiseRef = useRef<Promise<{
    label: string;
    lat: number;
    lng: number;
  }> | null>(null);
  const cameraRef = useRef<CameraView>(null);

  const [liveTime, setLiveTime] = useState(
    new Date().toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    })
  );

  const [timeInValue, setTimeInValue] = useState<string | null>(null);
  const [timeOutValue, setTimeOutValue] = useState<string | null>(null);

  // Slide animation for the choice sheet
  const slideAnim = useRef(new Animated.Value(400)).current;

  useEffect(() => {
    const tick = () => {
      setLiveTime(
        new Date().toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        })
      );
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // Animate the sheet when the modal opens
  useEffect(() => {
    if (modalVisible) {
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start();
    } else {
      slideAnim.setValue(400);
    }
  }, [modalVisible]);

  /* ------------------------------------------------------------------
   * Load today's attendance from Supabase
   * Runs every time this screen gains focus → reflects DB changes
   * ---------------------------------------------------------------- */

  const loadTodayAttendance = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const now = new Date();
      const today = toDateString(now);

      const { data, error } = await supabase
        .from('attendance')
        .select('time_in, time_out')
        .eq('user_id', user.id)
        .eq('date', today)
        .maybeSingle();

      if (error) {
        console.error('Load today attendance error:', error);
        return;
      }

      const format = (iso: string | null) =>
        iso
          ? new Date(iso).toLocaleTimeString('en-US', {
              hour: '2-digit',
              minute: '2-digit',
              hour12: true,
            })
          : null;

      if (data?.time_in) {
        setTimedIn(true);
        setTimeInValue(format(data.time_in));
      } else {
        setTimedIn(false);
        setTimeInValue(null);
      }

      if (data?.time_out) {
        setTimeOutValue(format(data.time_out));
      } else {
        setTimeOutValue(null);
      }
    } catch (err) {
      console.error('Unexpected error loading attendance:', err);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadTodayAttendance();
    }, [loadTodayAttendance])
  );

  const openModal = () => {
    setStage('choice');
    setCaptured(null);
    setLocationError(null);
    setLocState('idle');
    locationPromiseRef.current = null;
    setModalVisible(true);
  };

  const closeModal = () => {
    Animated.timing(slideAnim, {
      toValue: 400,
      duration: 280,
      useNativeDriver: true,
    }).start(() => {
      setModalVisible(false);
      setStage('choice');
      setCaptured(null);
      setLocationError(null);
      setLocState('idle');
      locationPromiseRef.current = null;
      setIsSubmitting(false);
    });
  };

  const getCurrentLocation = async (): Promise<{
    label: string;
    lat: number;
    lng: number;
  }> => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        return { label: 'Location permission denied', lat: 0, lng: 0 };
      }

      let loc: Location.LocationObject;
      try {
        loc = await withTimeout(
          Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          }),
          10_000
        );
      } catch {
        const lastKnown = await Location.getLastKnownPositionAsync({
          maxAge: 5 * 60 * 1000,
        }).catch(() => null);
        if (!lastKnown) {
          return { label: 'Location unavailable', lat: 0, lng: 0 };
        }
        loc = lastKnown;
      }

      const { latitude, longitude } = loc.coords;
      let label = `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;

      try {
        const controller = new AbortController();
        const abortTimer = setTimeout(() => controller.abort(), 6_000);
        let response: Response;
        try {
          response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`,
            {
              headers: {
                'User-Agent': 'Attendify-App/1.0',
                Accept: 'application/json',
              },
              signal: controller.signal,
            }
          );
        } finally {
          clearTimeout(abortTimer);
        }

        if (response.ok) {
          const data = await response.json();
          const addr = data.address || {};

          const parts = [
            addr.road || addr.pedestrian || addr.path,
            addr.neighbourhood || addr.suburb,
            addr.city || addr.town || addr.village || addr.municipality,
          ].filter(Boolean);

          const unique = Array.from(new Set(parts));

          if (unique.length > 0) {
            label = unique.join(', ');
          } else if (data.display_name) {
            label = data.display_name.split(',').slice(0, 3).join(',').trim();
          }
        }
      } catch (err) {
        console.log('Nominatim error:', err);
      }

      return { label, lat: latitude, lng: longitude };
    } catch {
      return { label: 'Location unavailable', lat: 0, lng: 0 };
    }
  };

  const chooseMode = async (selectedMode: Mode) => {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        Alert.alert(
          'Camera Permission Required',
          'Please allow camera access to submit your attendance.'
        );
        return;
      }
    }
    setMode(selectedMode);
    setStage('camera');
  };

  const takeSelfie = async () => {
    const camera = cameraRef.current;
    if (!camera || isSubmitting) return;
    setIsSubmitting(true);
    setLocationError(null);

    try {
      const photo = await camera.takePictureAsync({
        quality: 0.5,
        base64: true,
      });

      if (!photo?.uri || !photo?.base64) {
        throw new Error('No photo data');
      }

      const now = new Date();
      const timeString = now.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
      const dateString = now.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });

      setCaptured({
        uri: photo.uri,
        base64: photo.base64,
        mode,
        date: dateString,
        time: timeString,
        location: '',
        lat: 0,
        lng: 0,
      });
      setLocState('pending');
      setStage('preview');

      // Location loads in the background while the user reviews the preview
      const locPromise = getCurrentLocation();
      locationPromiseRef.current = locPromise;
      locPromise.then((loc) => {
        if (locationPromiseRef.current !== locPromise) return;
        if (loc.lat === 0 && loc.lng === 0) {
          setLocationError(loc.label);
          setLocState('failed');
          return;
        }
        setLocationError(null);
        setLocState('ready');
        setCaptured((c) =>
          c ? { ...c, location: loc.label, lat: loc.lat, lng: loc.lng } : c
        );
      });
    } catch (err) {
      Alert.alert('Error', 'Failed to capture selfie. Please try again.');
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const retakeSelfie = () => {
    setCaptured(null);
    setLocationError(null);
    setLocState('idle');
    locationPromiseRef.current = null;
    setStage('camera');
  };

  const submitAttendance = async () => {
    if (!captured) return;
    setIsSubmitting(true);

    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();

      if (userError || !user) {
        Alert.alert('Not signed in', 'Please log in again.');
        setIsSubmitting(false);
        return;
      }

      // Ensure we have a location before uploading/saving
      let submitLoc = {
        label: captured.location,
        lat: captured.lat,
        lng: captured.lng,
      };
      if (submitLoc.lat === 0 && submitLoc.lng === 0) {
        const loc = await (locState === 'failed'
          ? getCurrentLocation()
          : (locationPromiseRef.current ?? getCurrentLocation()));
        if (loc.lat === 0 && loc.lng === 0) {
          setLocationError(loc.label);
          setLocState('failed');
          Alert.alert(
            'Location required',
            loc.label === 'Location permission denied'
              ? 'Location permission denied. Please enable it in settings.'
              : 'Could not fetch your location. Please try again.'
          );
          setIsSubmitting(false);
          return;
        }
        submitLoc = { label: loc.label, lat: loc.lat, lng: loc.lng };
        setLocationError(null);
        setLocState('ready');
        setCaptured((c) =>
          c
            ? {
                ...c,
                location: submitLoc.label,
                lat: submitLoc.lat,
                lng: submitLoc.lng,
              }
            : c
        );
      }

      const timestamp = Date.now();
      const safeDate = captured.date.replace(/[^a-zA-Z0-9]/g, '-');
      const fileName = `${user.id}/${safeDate}-${captured.mode}-${timestamp}.jpg`;

      const arrayBuffer = decode(captured.base64);

      const { error: uploadError } = await supabase.storage
        .from('selfies')
        .upload(fileName, arrayBuffer, {
          contentType: 'image/jpeg',
          upsert: false,
        });

      if (uploadError) {
        console.error('Upload error:', uploadError);
        Alert.alert('Upload failed', uploadError.message);
        setIsSubmitting(false);
        return;
      }

      const now = new Date();
      const nowISO = now.toISOString();
      const today = toDateString(now);

      const { data: existing, error: fetchError } = await supabase
        .from('attendance')
        .select('*')
        .eq('user_id', user.id)
        .eq('date', today)
        .maybeSingle();

      if (fetchError) {
        console.error('Fetch error:', fetchError);
        Alert.alert('Error', fetchError.message);
        setIsSubmitting(false);
        return;
      }

      const payload: any = {
        user_id: user.id,
        date: today,
      };

      if (captured.mode === 'time-in') {
        payload.time_in = nowISO;
        payload.time_in_selfie = fileName;
        payload.time_in_location = submitLoc.label;
        payload.time_in_lat = submitLoc.lat;
        payload.time_in_lng = submitLoc.lng;
        payload.status = computeStatus(now, settings);
      } else {
        payload.time_out = nowISO;
        payload.time_out_selfie = fileName;
        payload.time_out_location = submitLoc.label;
        payload.time_out_lat = submitLoc.lat;
        payload.time_out_lng = submitLoc.lng;

        if (existing?.time_in) {
          payload.total_hours = computeTotalHours(new Date(existing.time_in), now);
          payload.overtime = computeOvertime(
            existing.time_in,
            nowISO,
            settings.work_end_time
          );
        }
      }

      let dbError = null;

      if (existing) {
        const { error } = await supabase
          .from('attendance')
          .update(payload)
          .eq('id', existing.id);
        dbError = error;
      } else {
        const { error } = await supabase
          .from('attendance')
          .insert(payload);
        dbError = error;
      }

      if (dbError) {
        console.error('DB error:', dbError);
        Alert.alert('Save failed', dbError.message);
        setIsSubmitting(false);
        return;
      }

      // Refresh the display from DB (single source of truth)
      await loadTodayAttendance();

      Alert.alert(
        'Success',
        `Time ${captured.mode === 'time-in' ? 'In' : 'Out'} saved successfully!`
      );

      closeModal();
    } catch (err) {
      console.error('Unexpected error:', err);
      Alert.alert('Error', 'Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View className="flex-1 bg-[#F5F7FB]">
      <StatusBar barStyle="dark-content" />

      <View
        className="absolute rounded-full"
        style={{
          width: 280,
          height: 280,
          backgroundColor: '#0066FF',
          opacity: 0.06,
          top: -80,
          right: -100,
        }}
      />
      <View
        className="absolute rounded-full"
        style={{
          width: 200,
          height: 200,
          backgroundColor: '#0066FF',
          opacity: 0.05,
          top: 120,
          left: -90,
        }}
      />
      <View
        className="absolute rounded-full"
        style={{
          width: 160,
          height: 160,
          backgroundColor: '#0066FF',
          opacity: 0.05,
          bottom: 80,
          right: -60,
        }}
      />

      <SafeAreaView className="flex-1" edges={['top']}>
        <View className="flex-1 px-6">

          <View className="flex-row items-center justify-between pt-3 pb-2">
            <View className="flex-row items-center">
              <View className="w-11 h-11 rounded-2xl bg-[#0066FF] items-center justify-center">
                <Clock size={22} color="white" />
              </View>
              <View className="ml-3">
                <Text className="text-gray-900 font-bold text-base">
                  Attendance
                </Text>
                <Text className="text-gray-500 text-xs mt-0.5">
                  Submit your time in/out with a selfie
                </Text>
              </View>
            </View>
          </View>

          <View
            className="mt-8 rounded-3xl p-6 items-center"
            style={{
              backgroundColor: '#FFFFFF',
              shadowColor: '#0F1E36',
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.08,
              shadowRadius: 20,
              elevation: 4,
            }}
          >
            <Text
              className="text-gray-900 font-bold"
              style={{ fontSize: 52, letterSpacing: -2 }}
            >
              {liveTime}
            </Text>
            <Text className="text-gray-400 text-xs mt-1 tracking-widest uppercase">
              Current Time
            </Text>

            <View className="w-full h-px bg-gray-100 my-6" />

            <View className="flex-row items-center w-full">
              <View className="flex-1 items-center">
                <View className="flex-row items-center mb-1">
                  <LogIn
                    size={12}
                    color={timeInValue ? '#16834A' : '#9CA3AF'}
                  />
                  <Text className="text-gray-400 text-xs ml-1">
                    Time In
                  </Text>
                </View>
                <Text
                  className="font-bold text-sm"
                  style={{ color: timeInValue ? '#16834A' : '#9CA3AF' }}
                >
                  {timeInValue || '--:--'}
                </Text>
              </View>

              <View className="w-px h-8 bg-gray-100" />

              <View className="flex-1 items-center">
                <Text className="text-gray-400 text-xs mb-1">Today</Text>
                <Text className="text-gray-900 font-bold text-sm">
                  {new Date().toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                  })}
                </Text>
              </View>

              <View className="w-px h-8 bg-gray-100" />

              <View className="flex-1 items-center">
                <View className="flex-row items-center mb-1">
                  <LogOut
                    size={12}
                    color={timeOutValue ? '#16834A' : '#9CA3AF'}
                  />
                  <Text className="text-gray-400 text-xs ml-1">
                    Time Out
                  </Text>
                </View>
                <Text
                  className="font-bold text-sm"
                  style={{ color: timeOutValue ? '#16834A' : '#9CA3AF' }}
                >
                  {timeOutValue || '--:--'}
                </Text>
              </View>
            </View>
          </View>

          {!settingsLoading && (
            <View className="mt-6 bg-white rounded-2xl border border-[#E8EDF5] p-4">
              <View className="flex-row items-center mb-4">
                <View className="w-8 h-8 rounded-lg bg-[#EAF2FF] items-center justify-center">
                  <CalendarDays size={15} color="#0066FF" />
                </View>
                <Text className="text-[#0F1E36] font-bold text-sm ml-2">
                  Work Schedule
                </Text>
              </View>

              <View className="flex-row">
                <View className="flex-1 items-center">
                  <Text className="text-gray-400 text-xs">Time In</Text>
                  <Text className="text-[#0F1E36] font-bold text-sm mt-1">
                    {formatTime12(settings.work_start_time)}
                  </Text>
                </View>

                <View className="w-px bg-gray-100" />

                <View className="flex-1 items-center">
                  <Text className="text-gray-400 text-xs">Time Out</Text>
                  <Text className="text-[#0F1E36] font-bold text-sm mt-1">
                    {formatTime12(settings.work_end_time)}
                  </Text>
                </View>

                <View className="w-px bg-gray-100" />

                <View className="flex-1 items-center">
                  <Text className="text-gray-400 text-xs">Grace</Text>
                  <Text className="text-[#0F1E36] font-bold text-sm mt-1">
                    {settings.grace_period_minutes} min
                  </Text>
                </View>
              </View>
            </View>
          )}

          <TouchableOpacity
            onPress={openModal}
            activeOpacity={0.85}
            className="mt-6 rounded-2xl py-5 flex-row items-center justify-center"
            style={{
              backgroundColor: '#0066FF',
              shadowColor: '#0066FF',
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.3,
              shadowRadius: 16,
              elevation: 8,
            }}
          >
            <View className="w-9 h-9 rounded-xl bg-white/20 items-center justify-center">
              <CameraIcon size={18} color="white" />
            </View>
            <Text className="text-white font-bold text-base ml-3">
              Submit Attendance
            </Text>
          </TouchableOpacity>

          <View className="flex-row items-start mt-6 px-1">
            <View className="w-6 h-6 rounded-lg bg-blue-50 items-center justify-center mt-0.5">
              <MapPin size={12} color="#0066FF" />
            </View>
            <Text className="text-gray-400 text-xs ml-2 flex-1 leading-5">
              Your location and a selfie will be captured when you submit
              attendance for verification.
            </Text>
          </View>

          <View className="flex-1" />

          <Text className="text-gray-400 text-xs text-center pb-6">
            Attendify • Employee Portal
          </Text>
        </View>
      </SafeAreaView>

      <Modal
        visible={modalVisible}
        animationType="fade"
        transparent
        onRequestClose={closeModal}
        statusBarTranslucent
      >
        <View className="flex-1 justify-end bg-black/50" onTouchEnd={(e) => { if (e.target === e.currentTarget) closeModal(); }}>

          {stage === 'choice' && (
            <Animated.View
              style={{ transform: [{ translateY: slideAnim }] }}
              className="bg-white rounded-t-[40px] pb-10 pt-3"
            >
              <View className="items-center mb-4">
                <View className="w-12 h-1.5 bg-gray-200 rounded-full" />
              </View>

              <View className="px-6">
                <Text className="text-gray-900 font-bold text-xl mb-1">
                  Submit Attendance
                </Text>
                <Text className="text-gray-500 text-sm mb-6">
                  Choose an action to continue
                </Text>

                <TouchableOpacity
                  onPress={() => chooseMode('time-in')}
                  disabled={timedIn}
                  className="flex-row items-center py-4 px-5 rounded-2xl mb-3"
                  style={{
                    backgroundColor: timedIn ? '#F3F4F6' : '#0066FF',
                    shadowColor: timedIn ? 'transparent' : '#0066FF',
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.2,
                    shadowRadius: 8,
                    elevation: timedIn ? 0 : 4,
                  }}
                >
                  <View
                    className="w-11 h-11 rounded-xl items-center justify-center"
                    style={{
                      backgroundColor: timedIn
                        ? '#E5E7EB'
                        : 'rgba(255,255,255,0.2)',
                    }}
                  >
                    <LogIn size={20} color={timedIn ? '#9CA3AF' : 'white'} />
                  </View>
                  <View className="flex-1 ml-3">
                    <Text
                      className="font-bold text-base"
                      style={{ color: timedIn ? '#9CA3AF' : 'white' }}
                    >
                      Time In
                    </Text>
                    <Text
                      className="text-xs mt-0.5"
                      style={{
                        color: timedIn ? '#9CA3AF' : 'rgba(255,255,255,0.8)',
                      }}
                    >
                      {timedIn ? 'Already timed in today' : 'Start your workday'}
                    </Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => chooseMode('time-out')}
                  disabled={!timedIn}
                  className="flex-row items-center py-4 px-5 rounded-2xl"
                  style={{
                    backgroundColor: !timedIn ? '#F3F4F6' : '#F45B69',
                    shadowColor: !timedIn ? 'transparent' : '#F45B69',
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.2,
                    shadowRadius: 8,
                    elevation: !timedIn ? 0 : 4,
                  }}
                >
                  <View
                    className="w-11 h-11 rounded-xl items-center justify-center"
                    style={{
                      backgroundColor: !timedIn
                        ? '#E5E7EB'
                        : 'rgba(255,255,255,0.2)',
                    }}
                  >
                    <LogOut size={20} color={!timedIn ? '#9CA3AF' : 'white'} />
                  </View>
                  <View className="flex-1 ml-3">
                    <Text
                      className="font-bold text-base"
                      style={{ color: !timedIn ? '#9CA3AF' : 'white' }}
                    >
                      Time Out
                    </Text>
                    <Text
                      className="text-xs mt-0.5"
                      style={{
                        color: !timedIn ? '#9CA3AF' : 'rgba(255,255,255,0.8)',
                      }}
                    >
                      {!timedIn ? 'Time in first' : 'End your workday'}
                    </Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={closeModal}
                  className="items-center mt-4 py-3"
                >
                  <Text className="text-gray-500 font-medium text-sm">
                    Cancel
                  </Text>
                </TouchableOpacity>
              </View>
            </Animated.View>
          )}

          {stage === 'camera' && (
            <View className="flex-1 bg-black">
              {permission?.granted ? (
                <CameraView
                  ref={cameraRef}
                  style={StyleSheet.absoluteFill}
                  facing={facing}
                />
              ) : (
                <View className="flex-1 items-center justify-center bg-black">
                  <Text className="text-white">
                    Requesting camera permission...
                  </Text>
                </View>
              )}

              <SafeAreaView className="absolute top-0 left-0 right-0">
                <View className="flex-row items-center justify-between px-4 pt-2">
                  <TouchableOpacity
                    onPress={closeModal}
                    className="w-10 h-10 rounded-full items-center justify-center"
                    style={styles.darkOverlay}
                  >
                    <X size={20} color="white" />
                  </TouchableOpacity>
                  <View
                    className="px-4 py-2 rounded-full"
                    style={styles.darkOverlay}
                  >
                    <Text className="text-white font-medium">
                      {mode === 'time-in' ? 'Time In Selfie' : 'Time Out Selfie'}
                    </Text>
                  </View>
                  <View className="w-10" />
                </View>
              </SafeAreaView>

              <View
                pointerEvents="none"
                className="absolute items-center justify-center"
                style={{ top: '27%', left: 0, right: 0 }}
              >
                <View
                  style={{
                    width: '58%',
                    aspectRatio: 0.76,
                    borderRadius: 999,
                    borderWidth: 2,
                    borderColor: 'rgba(255,255,255,0.7)',
                    borderStyle: 'dashed',
                  }}
                />
                <Text
                  className="text-white mt-4 text-sm"
                  style={{ opacity: 0.9 }}
                >
                  Position your face within the frame
                </Text>
              </View>

              <View
                className="absolute bottom-0 left-0 right-0 pb-10 pt-6"
                style={styles.bottomOverlay}
              >
                <View className="items-center">
                  <TouchableOpacity
                    onPress={takeSelfie}
                    disabled={isSubmitting}
                    activeOpacity={0.8}
                    className="items-center justify-center"
                    style={{
                      width: 76,
                      height: 76,
                      borderRadius: 38,
                      borderWidth: 4,
                      borderColor: 'white',
                      backgroundColor: 'rgba(255,255,255,0.25)',
                    }}
                  >
                    {isSubmitting ? (
                      <ActivityIndicator color="white" />
                    ) : (
                      <CameraIcon size={32} color="white" />
                    )}
                  </TouchableOpacity>
                  <Text className="text-white mt-3 text-sm">
                    {isSubmitting ? 'Processing...' : 'Tap to capture selfie'}
                  </Text>

                  <TouchableOpacity
                    onPress={() =>
                      setFacing((f) => (f === 'front' ? 'back' : 'front'))
                    }
                    className="mt-4 px-4 py-2 rounded-full"
                    style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}
                  >
                    <Text className="text-white text-xs">Flip Camera</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}

          {stage === 'preview' && captured && (
            <View className="flex-1 bg-white">
              <SafeAreaView className="flex-1">
                <View className="flex-row items-center justify-between px-5 pt-3 pb-4">
                  <TouchableOpacity
                    onPress={retakeSelfie}
                    className="w-10 h-10 rounded-full bg-gray-100 items-center justify-center"
                  >
                    <ArrowLeft size={20} color="#1F2937" />
                  </TouchableOpacity>
                  <Text className="text-gray-900 font-bold text-lg">
                    Preview
                  </Text>
                  <View className="w-10" />
                </View>

                <View className="px-5">
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
                    {captured.lat && captured.lng ? (
                      <WebView
                        originWhitelist={['*']}
                        source={{
                          html: buildMapHtml(captured.lat, captured.lng),
                        }}
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
                        {locState === 'pending' ? (
                          <ActivityIndicator color="#0066FF" />
                        ) : (
                          <>
                            <MapPin size={28} color="#0066FF" />
                            <Text className="text-[#64748B] text-sm mt-2">
                              Location unavailable
                            </Text>
                          </>
                        )}
                      </View>
                    )}

                    <View
                      className="absolute items-center"
                      style={{
                        bottom: 16,
                        left: 0,
                        right: 0,
                      }}
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
                        <Image
                          source={{ uri: captured.uri }}
                          style={{ width: '100%', height: '100%' }}
                          resizeMode="cover"
                        />
                      </View>
                    </View>
                  </View>
                </View>

                <View className="px-5 mt-5">
                  <View className="bg-[#F5F7FB] rounded-2xl p-4 border border-[#E8EDF5]">
                    <View className="py-3">
                      <View className="flex-row items-center">
                        <View className="w-9 h-9 rounded-xl bg-blue-50 items-center justify-center">
                          <CalendarDays size={16} color="#0066FF" />
                        </View>
                        <Text className="text-gray-500 text-sm ml-3">
                          Date
                        </Text>
                      </View>
                      <Text className="text-gray-900 font-bold text-sm mt-2 ml-12">
                        {captured.date}
                      </Text>
                    </View>

                    <View className="h-px bg-gray-100" />

                    <View className="py-3">
                      <View className="flex-row items-center">
                        <View className="w-9 h-9 rounded-xl bg-blue-50 items-center justify-center">
                          <Clock size={16} color="#0066FF" />
                        </View>
                        <Text className="text-gray-500 text-sm ml-3">
                          Time
                        </Text>
                      </View>
                      <Text className="text-gray-900 font-bold text-sm mt-2 ml-12">
                        {captured.time}
                      </Text>
                    </View>

                    <View className="h-px bg-gray-100" />

                    <View className="py-3">
                      <View className="flex-row items-center">
                        <View className="w-9 h-9 rounded-xl bg-blue-50 items-center justify-center">
                          <MapPin size={16} color="#0066FF" />
                        </View>
                        <Text className="text-gray-500 text-sm ml-3">
                          Location
                        </Text>
                      </View>
                      {locState === 'pending' ? (
                        <View className="flex-row items-center mt-2 ml-12">
                          <ActivityIndicator size="small" color="#0066FF" />
                          <Text className="text-gray-500 text-sm ml-2">
                            Getting location…
                          </Text>
                        </View>
                      ) : locState === 'failed' ? (
                        <Text
                          className="text-sm font-medium mt-2 ml-12"
                          style={{ color: '#DC2626' }}
                        >
                          {locationError === 'Location permission denied'
                            ? 'Location permission denied. Please enable it in settings.'
                            : 'Could not fetch your location. Please try again.'}
                        </Text>
                      ) : (
                        <Text className="text-gray-900 font-bold text-sm mt-2 ml-12">
                          {captured.location}
                        </Text>
                      )}
                    </View>
                  </View>

                  <View className="flex-row items-center mt-4 px-1">
                    <View
                      className="w-8 h-8 rounded-lg items-center justify-center"
                      style={{
                        backgroundColor:
                          captured.mode === 'time-in' ? '#EAF8F0' : '#FEE9EB',
                      }}
                    >
                      {captured.mode === 'time-in' ? (
                        <LogIn size={16} color="#16834A" />
                      ) : (
                        <LogOut size={16} color="#DC2626" />
                      )}
                    </View>
                    <Text className="text-gray-500 text-xs ml-2">
                      You are submitting a{' '}
                      <Text className="font-bold text-gray-900">
                        {captured.mode === 'time-in' ? 'Time In' : 'Time Out'}
                      </Text>{' '}
                      record
                    </Text>
                  </View>
                </View>

                <View className="flex-1" />
                <View className="px-5 pb-6 flex-row gap-3">
                  <TouchableOpacity
                    onPress={retakeSelfie}
                    disabled={isSubmitting}
                    className="flex-1 py-4 rounded-2xl items-center border border-gray-200"
                  >
                    <View className="flex-row items-center">
                      <RotateCcw size={18} color="#374151" />
                      <Text className="text-gray-700 font-bold ml-2">
                        Retake
                      </Text>
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={submitAttendance}
                    disabled={isSubmitting}
                    className="flex-1 py-4 rounded-2xl items-center"
                    style={{
                      backgroundColor: isSubmitting ? '#93C5FD' : '#0066FF',
                      shadowColor: '#0066FF',
                      shadowOffset: { width: 0, height: 4 },
                      shadowOpacity: 0.25,
                      shadowRadius: 8,
                      elevation: 4,
                    }}
                  >
                    <View className="flex-row items-center">
                      {isSubmitting ? (
                        <ActivityIndicator color="white" />
                      ) : (
                        <>
                          <CheckCircle2 size={18} color="white" />
                          <Text className="text-white font-bold ml-2">
                            Submit
                          </Text>
                        </>
                      )}
                    </View>
                  </TouchableOpacity>
                </View>
              </SafeAreaView>
            </View>
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  darkOverlay: {
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  bottomOverlay: {
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
});