import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  Alert,
  ActivityIndicator,
  TextInput,
  Modal,
  Animated,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import type { LucideIcon } from 'lucide-react-native';
import {
  Mail,
  Phone,
  Briefcase,
  Building2,
  ChevronRight,
  LogOut,
  Lock,
  Camera,
  Settings,
  Pencil,
  Check,
  X,
  BadgeCheck,
  Eye,
  EyeOff,
  ShieldCheck,
} from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { File } from 'expo-file-system';
import { supabase } from '../../lib/supabase';

interface InfoRowProps {
  Icon: LucideIcon;
  label: string;
  value: string;
}

interface EditableRowProps {
  Icon: LucideIcon;
  label: string;
  value: string;
  editing: boolean;
  draft: string;
  saving?: boolean;
  keyboardType?: 'default' | 'email-address' | 'phone-pad';
  onChangeDraft: (text: string) => void;
  onStartEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
}

interface MenuRowProps {
  Icon: LucideIcon;
  label: string;
  subtitle?: string;
  onPress: () => void;
  danger?: boolean;
}

interface Profile {
  id: string;
  email: string | null;
  full_name: string | null;
  employee_id: string | null;
  department: string | null;
  position: string | null;
  phone: string | null;
  role: string;
  avatar_url: string | null;
}

const InfoRow = ({ Icon, label, value }: InfoRowProps) => (
  <View className="flex-row items-center py-3">
    <View className="w-10 h-10 rounded-xl bg-blue-50 items-center justify-center">
      <Icon size={18} color="#2563EB" />
    </View>
    <View className="flex-1 ml-3">
      <Text className="text-gray-400 text-xs">{label}</Text>
      <Text className="text-gray-900 font-semibold text-sm mt-0.5">
        {value || '—'}
      </Text>
    </View>
  </View>
);

const EditableRow = ({
  Icon,
  label,
  value,
  editing,
  draft,
  saving = false,
  keyboardType = 'default',
  onChangeDraft,
  onStartEdit,
  onSave,
  onCancel,
}: EditableRowProps) => {
  return (
    <View className="py-3">
      <View className="flex-row items-center">
        <View className="w-10 h-10 rounded-xl bg-blue-50 items-center justify-center">
          <Icon size={18} color="#2563EB" />
        </View>

        <View className="flex-1 ml-3">
          <Text className="text-gray-400 text-xs">{label}</Text>

          {editing ? (
            <TextInput
              value={draft}
              onChangeText={onChangeDraft}
              keyboardType={keyboardType}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!saving}
              className="text-gray-900 font-semibold text-sm mt-1 pb-1 border-b border-blue-500"
              placeholder={`Enter ${label.toLowerCase()}`}
              placeholderTextColor="#9CA3AF"
            />
          ) : (
            <Text className="text-gray-900 font-semibold text-sm mt-0.5">
              {value || '—'}
            </Text>
          )}
        </View>

        {editing ? (
          <View className="flex-row items-center gap-2">
            <Pressable
              onPress={onCancel}
              disabled={saving}
              className="w-9 h-9 rounded-xl bg-gray-100 items-center justify-center active:opacity-70"
            >
              <X size={16} color="#374151" />
            </Pressable>

            <Pressable
              onPress={onSave}
              disabled={saving}
              className="w-9 h-9 rounded-xl bg-blue-600 items-center justify-center active:opacity-70"
            >
              {saving ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Check size={16} color="#FFFFFF" />
              )}
            </Pressable>
          </View>
        ) : (
          <Pressable
            onPress={onStartEdit}
            className="w-9 h-9 rounded-xl bg-gray-100 items-center justify-center active:opacity-70"
          >
            <Pencil size={16} color="#374151" />
          </Pressable>
        )}
      </View>
    </View>
  );
};

const MenuRow = ({
  Icon,
  label,
  subtitle,
  onPress,
  danger = false,
}: MenuRowProps) => (
  <Pressable
    onPress={onPress}
    className="flex-row items-center py-3.5 active:opacity-70"
  >
    <View
      className={`w-10 h-10 rounded-xl items-center justify-center ${
        danger ? 'bg-red-50' : 'bg-gray-100'
      }`}
    >
      <Icon size={18} color={danger ? '#DC2626' : '#1F2937'} />
    </View>
    <View className="flex-1 ml-3">
      <Text
        className={`font-semibold text-sm ${
          danger ? 'text-red-600' : 'text-gray-900'
        }`}
      >
        {label}
      </Text>
      {subtitle && (
        <Text className="text-gray-400 text-xs mt-0.5">{subtitle}</Text>
      )}
    </View>
    <ChevronRight size={18} color={danger ? '#DC2626' : '#9CA3AF'} />
  </Pressable>
);

const getInitials = (name: string | null, email: string | null): string => {
  if (name && name.trim()) {
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  }
  if (email) return email.substring(0, 2).toUpperCase();
  return 'U';
};

export default function ProfileScreen() {
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const [savingPhone, setSavingPhone] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);

  const [phone, setPhone] = useState('');
  const [editingPhone, setEditingPhone] = useState(false);
  const [phoneDraft, setPhoneDraft] = useState('');

  // Avatar state
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  // Change Password modal state
  const [passwordModalVisible, setPasswordModalVisible] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  // Slide animation for the modal sheet
  const slideAnim = useRef(new Animated.Value(400)).current;

  useEffect(() => {
    if (passwordModalVisible) {
      slideAnim.setValue(400);
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  }, [passwordModalVisible]);

  useFocusEffect(
    useCallback(() => {
      fetchProfile();
    }, [])
  );

  const fetchProfile = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        return;
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (error) {
        console.error('Profile fetch error:', error);
        Alert.alert('Error', 'Could not load your profile.');
        setLoading(false);
        return;
      }

      setProfile(data);
      setPhone(data.phone || '');
      setPhoneDraft(data.phone || '');
      setAvatarUrl(data.avatar_url || null);
    } catch (err) {
      console.error('Unexpected error:', err);
    } finally {
      setLoading(false);
    }
  };

  /* ------------------------------------------------------------------
   * Avatar upload
   * ---------------------------------------------------------------- */

  const pickImage = async (source: 'library' | 'camera') => {
    if (source === 'camera') {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Camera permission is required.');
        return null;
      }
    } else {
      const { status } =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Gallery permission is required.');
        return null;
      }
    }

    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync({
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.8,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.8,
          });

    if (result.canceled) return null;
    return result.assets[0].uri;
  };

  const processImage = async (uri: string) => {
    const manipulated = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 512, height: 512 } }],
      { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
    );
    return manipulated.uri;
  };

  const uploadAvatar = async (uri: string) => {
    if (!profile) return null;
    setUploadingAvatar(true);

    try {
      console.log('[Avatar] Starting upload for user:', profile.id);

      // 1. Resize / compress
      const processedUri = await processImage(uri);
      console.log('[Avatar] Processed URI:', processedUri);

      // 2. Read file as base64 using new File API
      const file = new File(processedUri);
      const base64 = await file.base64();
      console.log('[Avatar] Base64 length:', base64.length);

      // 3. Convert base64 → Uint8Array
      const binaryString = atob(base64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      console.log('[Avatar] Byte length:', bytes.length);

      // 4. Build path (scoped to user)
      const filePath = `${profile.id}/avatar-${Date.now()}.jpg`;
      console.log('[Avatar] Upload path:', filePath);

      // 5. Upload ArrayBuffer to Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, bytes.buffer, {
          contentType: 'image/jpeg',
          upsert: true,
          cacheControl: '3600',
        });

      console.log('[Avatar] Upload result:', uploadData, uploadError);
      if (uploadError) throw uploadError;

      // 6. Get public URL
      const {
        data: { publicUrl },
      } = supabase.storage.from('avatars').getPublicUrl(filePath);
      console.log('[Avatar] Public URL:', publicUrl);

      // 7. Save URL to profile row
      const { error: dbError } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', profile.id);

      console.log('[Avatar] DB update error:', dbError);
      if (dbError) throw dbError;

      return publicUrl;
    } catch (err: any) {
      console.error('[Avatar] FAILED:', err);
      throw err;
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleAvatarPress = () => {
    if (!profile) return;

    Alert.alert('Change Profile Photo', 'Choose a source', [
      {
        text: 'Take Photo',
        onPress: async () => {
          try {
            const uri = await pickImage('camera');
            if (!uri) return;
            const url = await uploadAvatar(uri);
            if (url) {
              setAvatarUrl(url);
              setProfile({ ...profile, avatar_url: url });
            }
          } catch (e: any) {
            Alert.alert('Upload failed', e?.message || 'Please try again.');
          }
        },
      },
      {
        text: 'Choose from Gallery',
        onPress: async () => {
          try {
            const uri = await pickImage('library');
            if (!uri) return;
            const url = await uploadAvatar(uri);
            if (url) {
              setAvatarUrl(url);
              setProfile({ ...profile, avatar_url: url });
            }
          } catch (e: any) {
            Alert.alert('Upload failed', e?.message || 'Please try again.');
          }
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  /* ------------------------------------------------------------------
   * Phone editing
   * ---------------------------------------------------------------- */

  const handleStartEditPhone = () => {
    setPhoneDraft(phone);
    setEditingPhone(true);
  };

  const handleSavePhone = async () => {
    const trimmed = phoneDraft.trim();

    if (!trimmed) {
      Alert.alert('Invalid phone', 'Phone number cannot be empty.');
      return;
    }

    if (!profile) return;

    setSavingPhone(true);

    const { error } = await supabase
      .from('profiles')
      .update({ phone: trimmed })
      .eq('id', profile.id);

    setSavingPhone(false);

    if (error) {
      Alert.alert('Update failed', error.message);
      return;
    }

    setPhone(trimmed);
    setProfile({ ...profile, phone: trimmed });
    setEditingPhone(false);
    Alert.alert('Saved', 'Your phone number has been updated.');
  };

  const handleCancelPhone = () => {
    setPhoneDraft(phone);
    setEditingPhone(false);
  };

  /* ------------------------------------------------------------------
   * Logout
   * ---------------------------------------------------------------- */

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: async () => {
          setLoggingOut(true);
          await supabase.auth.signOut();
          setLoggingOut(false);
        },
      },
    ]);
  };

  /* ------------------------------------------------------------------
   * Change password
   * ---------------------------------------------------------------- */

  const openPasswordModal = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setShowCurrent(false);
    setShowNew(false);
    setShowConfirm(false);
    setPasswordModalVisible(true);
  };

  const slideDown = (cb: () => void) => {
    Animated.timing(slideAnim, {
      toValue: 400,
      duration: 280,
      useNativeDriver: true,
    }).start(cb);
  };

  const closePasswordModal = () => {
    if (changingPassword) return;
    slideDown(() => setPasswordModalVisible(false));
  };

  const handleChangePassword = async () => {
    if (!currentPassword) {
      Alert.alert('Missing', 'Please enter your current password.');
      return;
    }

    if (!newPassword) {
      Alert.alert('Missing', 'Please enter a new password.');
      return;
    }

    if (newPassword.length < 8) {
      Alert.alert('Too short', 'New password must be at least 8 characters.');
      return;
    }

    if (newPassword !== confirmPassword) {
      Alert.alert('Mismatch', 'New password and confirm password do not match.');
      return;
    }

    if (currentPassword === newPassword) {
      Alert.alert(
        'Same password',
        'New password must be different from your current password.'
      );
      return;
    }

    setChangingPassword(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !user.email) {
        Alert.alert('Error', 'Could not identify your account.');
        setChangingPassword(false);
        return;
      }

      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      });

      if (verifyError) {
        Alert.alert('Wrong password', 'Your current password is incorrect.');
        setChangingPassword(false);
        return;
      }

      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      setChangingPassword(false);

      if (updateError) {
        Alert.alert('Update failed', updateError.message);
        return;
      }

      setPasswordModalVisible(false);
      Alert.alert(
        'Password changed',
        'Your password has been updated successfully.'
      );
    } catch (err) {
      setChangingPassword(false);
      Alert.alert('Error', 'Something went wrong. Please try again.');
      console.error(err);
    }
  };

  /* ------------------------------------------------------------------
   * Render
   * ---------------------------------------------------------------- */

  if (loading) {
    return (
      <SafeAreaView
        className="flex-1 bg-[#F5F7FB] items-center justify-center"
        edges={['top']}
      >
        <ActivityIndicator size="large" color="#0066FF" />
        <Text className="text-gray-500 text-sm mt-4">Loading profile...</Text>
      </SafeAreaView>
    );
  }

  const initials = getInitials(
    profile?.full_name || null,
    profile?.email || null
  );

  return (
    <SafeAreaView className="flex-1 bg-[#F5F7FB]" edges={['top']}>
      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 36 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View className="px-5 pt-5 pb-4">
          <View className="flex-row items-center justify-between">
            <View>
              <Text className="text-gray-900 font-bold text-xl">
                My Profile
              </Text>
              <Text className="text-gray-500 text-xs">
                Manage your account
              </Text>
            </View>
          </View>
        </View>

        {/* Profile Card */}
        <View className="mx-5 bg-white rounded-3xl p-5 border border-gray-200 mb-4">
          <View className="items-center">
            <View className="relative">
              <View className="w-24 h-24 rounded-full bg-blue-600 items-center justify-center overflow-hidden">
                {avatarUrl ? (
                  <Image
                    source={{ uri: avatarUrl }}
                    className="w-full h-full"
                    resizeMode="cover"
                  />
                ) : (
                  <Text className="text-white text-3xl font-bold">
                    {initials}
                  </Text>
                )}

                {uploadingAvatar && (
                  <View className="absolute inset-0 bg-black/50 items-center justify-center">
                    <ActivityIndicator color="#FFFFFF" />
                  </View>
                )}
              </View>

              <Pressable
                onPress={handleAvatarPress}
                disabled={uploadingAvatar}
                className="absolute -bottom-1 -right-1 w-9 h-9 rounded-full bg-white border border-gray-200 items-center justify-center"
              >
                <Camera size={16} color="#2563EB" />
              </Pressable>
            </View>

            <Text className="text-gray-900 font-bold text-xl mt-4">
              {profile?.full_name || 'No name set'}
            </Text>
            <Text className="text-gray-500 text-sm mt-1">
              {profile?.position || '—'}
            </Text>

            {profile?.employee_id && (
              <View className="bg-blue-50 px-3 py-1 rounded-full mt-3">
                <Text className="text-blue-700 text-xs font-semibold">
                  {profile.employee_id}
                </Text>
              </View>
            )}

            {profile?.role === 'admin' && (
              <View className="bg-amber-50 px-3 py-1 rounded-full mt-2">
                <Text className="text-amber-700 text-xs font-semibold">
                  ADMIN
                </Text>
              </View>
            )}
          </View>

          <View className="h-px bg-gray-100 my-4" />

          <InfoRow Icon={Mail} label="Email" value={profile?.email || ''} />

          <EditableRow
            Icon={Phone}
            label="Phone"
            value={phone}
            editing={editingPhone}
            draft={phoneDraft}
            saving={savingPhone}
            keyboardType="phone-pad"
            onChangeDraft={setPhoneDraft}
            onStartEdit={handleStartEditPhone}
            onSave={handleSavePhone}
            onCancel={handleCancelPhone}
          />

          <InfoRow
            Icon={BadgeCheck}
            label="Employee ID"
            value={profile?.employee_id || ''}
          />

          <InfoRow
            Icon={Building2}
            label="Department"
            value={profile?.department || ''}
          />
          <InfoRow
            Icon={Briefcase}
            label="Position"
            value={profile?.position || ''}
          />
        </View>

        {/* Help Note */}
        <Text className="text-gray-400 text-xs text-center mb-5 px-8 leading-5">
          To update your name, email, employee ID, or department, please
          contact HR.
        </Text>

        {/* Account Section */}
        <View className="mx-5 bg-white rounded-3xl p-5 border border-gray-200 mb-4">
          <Text className="text-gray-900 font-bold text-base mb-1">
            Account
          </Text>
          <Text className="text-gray-400 text-xs mb-2">
            Security and preferences
          </Text>

          <MenuRow
            Icon={Lock}
            label="Change Password"
            subtitle="Update your login credentials"
            onPress={openPasswordModal}
          />
        </View>

        {/* Logout Button */}
        <View className="mx-5">
          <Pressable
            onPress={handleLogout}
            disabled={loggingOut}
            className="flex-row items-center justify-center bg-white border border-red-300 rounded-2xl py-4"
          >
            {loggingOut ? (
              <ActivityIndicator size="small" color="#DC2626" />
            ) : (
              <>
                <LogOut size={18} color="#DC2626" />
                <Text className="text-red-600 font-bold text-base ml-2">
                  Log Out
                </Text>
              </>
            )}
          </Pressable>
        </View>

        <Text className="text-gray-400 text-xs text-center mt-6">
          Attendify • Version 1.0.0
        </Text>
      </ScrollView>

      {/* Change Password Modal */}
      <Modal
        visible={passwordModalVisible}
        animationType="fade"
        transparent
        onRequestClose={closePasswordModal}
        statusBarTranslucent
      >
        <Pressable className="flex-1 justify-end bg-black/50" onPress={closePasswordModal}>
          <Animated.View
            style={{ transform: [{ translateY: slideAnim }] }}
            className="bg-white rounded-t-[40px] pb-8"
            onStartShouldSetResponder={() => true}
          >
            <View className="items-center pt-3 pb-2">
              <View className="w-12 h-1.5 bg-gray-200 rounded-full" />
            </View>

            <View className="flex-row items-center justify-between px-6 pt-3 pb-5">
              <View className="flex-row items-center">
                <View className="w-11 h-11 rounded-2xl bg-[#EAF2FF] items-center justify-center">
                  <ShieldCheck size={20} color="#0066FF" />
                </View>
                <View className="ml-3">
                  <Text className="text-[#0F1E36] font-bold text-xl">
                    Change Password
                  </Text>
                  <Text className="text-gray-500 text-xs mt-0.5">
                    Update your login credentials
                  </Text>
                </View>
              </View>
              <Pressable
                onPress={closePasswordModal}
                disabled={changingPassword}
                className="w-9 h-9 rounded-full bg-gray-100 items-center justify-center"
              >
                <X size={18} color="#374151" />
              </Pressable>
            </View>

            <View className="px-6">
              <Text className="text-gray-700 text-xs font-semibold mb-2 ml-1">
                Current Password
              </Text>
              <View className="flex-row items-center bg-[#F5F7FB] rounded-2xl px-4 border border-[#E8EDF5] mb-4">
                <Lock size={18} color="#9CA3AF" />
                <TextInput
                  value={currentPassword}
                  onChangeText={setCurrentPassword}
                  placeholder="Enter current password"
                  placeholderTextColor="#9CA3AF"
                  secureTextEntry={!showCurrent}
                  editable={!changingPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  className="flex-1 py-3.5 ml-3 text-gray-900 text-base"
                />
                <Pressable
                  onPress={() => setShowCurrent((v) => !v)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  {showCurrent ? (
                    <EyeOff size={18} color="#9CA3AF" />
                  ) : (
                    <Eye size={18} color="#9CA3AF" />
                  )}
                </Pressable>
              </View>

              <Text className="text-gray-700 text-xs font-semibold mb-2 ml-1">
                New Password
              </Text>
              <View className="flex-row items-center bg-[#F5F7FB] rounded-2xl px-4 border border-[#E8EDF5] mb-4">
                <Lock size={18} color="#9CA3AF" />
                <TextInput
                  value={newPassword}
                  onChangeText={setNewPassword}
                  placeholder="At least 8 characters"
                  placeholderTextColor="#9CA3AF"
                  secureTextEntry={!showNew}
                  editable={!changingPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  className="flex-1 py-3.5 ml-3 text-gray-900 text-base"
                />
                <Pressable
                  onPress={() => setShowNew((v) => !v)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  {showNew ? (
                    <EyeOff size={18} color="#9CA3AF" />
                  ) : (
                    <Eye size={18} color="#9CA3AF" />
                  )}
                </Pressable>
              </View>

              <Text className="text-gray-700 text-xs font-semibold mb-2 ml-1">
                Confirm New Password
              </Text>
              <View className="flex-row items-center bg-[#F5F7FB] rounded-2xl px-4 border border-[#E8EDF5] mb-5">
                <Lock size={18} color="#9CA3AF" />
                <TextInput
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="Re-enter new password"
                  placeholderTextColor="#9CA3AF"
                  secureTextEntry={!showConfirm}
                  editable={!changingPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  className="flex-1 py-3.5 ml-3 text-gray-900 text-base"
                />
                <Pressable
                  onPress={() => setShowConfirm((v) => !v)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  {showConfirm ? (
                    <EyeOff size={18} color="#9CA3AF" />
                  ) : (
                    <Eye size={18} color="#9CA3AF" />
                  )}
                </Pressable>
              </View>

              <View className="flex-row items-start bg-[#EAF2FF] rounded-2xl px-4 py-3 mb-5">
                <ShieldCheck
                  size={14}
                  color="#0066FF"
                  style={{ marginTop: 2 }}
                />
                <Text className="flex-1 text-[#0F1E36] text-xs ml-2 leading-5">
                  For security, we verify your current password before
                  allowing the change.
                </Text>
              </View>

              <View className="flex-row gap-3">
                <Pressable
                  onPress={closePasswordModal}
                  disabled={changingPassword}
                  className="flex-1 py-4 rounded-2xl items-center border border-gray-200"
                >
                  <Text className="text-gray-700 font-bold text-base">
                    Cancel
                  </Text>
                </Pressable>

                <Pressable
                  onPress={handleChangePassword}
                  disabled={changingPassword}
                  className="flex-1 py-4 rounded-2xl items-center bg-[#0066FF]"
                  style={{
                    shadowColor: '#0066FF',
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.25,
                    shadowRadius: 8,
                    elevation: 4,
                  }}
                >
                  {changingPassword ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text className="text-white font-bold text-base">
                      Update Password
                    </Text>
                  )}
                </Pressable>
              </View>
            </View>
          </Animated.View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}