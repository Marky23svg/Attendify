import { Link, router } from 'expo-router';
import { useState } from 'react';
import {
  Text,
  TextInput,
  TouchableOpacity,
  View,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  User,
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
} from 'lucide-react-native';

export default function SignUpScreen() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  return (
    <View className="flex-1 bg-[#F5F7FB]">
      <StatusBar barStyle="dark-content" />

      {/* Decorative background circles */}
      <View
        className="absolute rounded-full"
        style={{
          width: 280,
          height: 280,
          backgroundColor: '#0066FF',
          opacity: 0.06,
          top: -100,
          right: -100,
        }}
      />
      <View
        className="absolute rounded-full"
        style={{
          width: 220,
          height: 220,
          backgroundColor: '#0066FF',
          opacity: 0.05,
          top: 180,
          left: -110,
        }}
      />
      <View
        className="absolute rounded-full"
        style={{
          width: 160,
          height: 160,
          backgroundColor: '#F45B69',
          opacity: 0.05,
          bottom: 120,
          right: -70,
        }}
      />

      <SafeAreaView className="flex-1" edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          className="flex-1"
        >
          <ScrollView
            contentContainerStyle={{ flexGrow: 1 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View className="flex-1 justify-center px-6 py-8">

              {/* Logo */}
              <View className="items-center mb-8">
                <View
                  className="w-24 h-24 rounded-3xl items-center justify-center mb-4 overflow-hidden"
                  style={{
                    backgroundColor: '#0066FF',
                    shadowColor: '#0066FF',
                    shadowOffset: { width: 0, height: 10 },
                    shadowOpacity: 0.3,
                    shadowRadius: 20,
                    elevation: 8,
                  }}
                >
                  <Image
                    source={require('../../assets/images/Attendify-logo-white.png')}
                    style={{ width: 72, height: 72 }}
                    resizeMode="contain"
                  />
                </View>

                <Text className="text-gray-900 text-3xl font-bold tracking-tight">
                  Attendify
                </Text>
                <Text className="text-gray-500 text-sm mt-2">
                  Create your account
                </Text>
              </View>

              {/* Form Card */}
              <View
                className="bg-white rounded-3xl p-6"
                style={{
                  shadowColor: '#0F1E36',
                  shadowOffset: { width: 0, height: 8 },
                  shadowOpacity: 0.08,
                  shadowRadius: 20,
                  elevation: 4,
                }}
              >
                {/* Heading */}
                <View className="mb-6">
                  <Text className="text-gray-900 text-xl font-bold">
                    Get started
                  </Text>
                  <Text className="text-gray-500 text-sm mt-1">
                    Fill in your details to sign up
                  </Text>
                </View>

                {/* Full Name */}
                <View className="mb-4">
                  <Text className="text-gray-700 text-xs font-semibold mb-2 ml-1">
                    Full Name
                  </Text>
                  <View className="flex-row items-center bg-[#F5F7FB] rounded-2xl px-4 border border-[#E8EDF5]">
                    <User size={18} color="#9CA3AF" />
                    <TextInput
                      className="flex-1 py-3.5 ml-3 text-gray-900 text-base"
                      placeholder="Juan Dela Cruz"
                      placeholderTextColor="#9CA3AF"
                      autoCapitalize="words"
                      value={name}
                      onChangeText={setName}
                    />
                  </View>
                </View>

                {/* Email */}
                <View className="mb-4">
                  <Text className="text-gray-700 text-xs font-semibold mb-2 ml-1">
                    Email
                  </Text>
                  <View className="flex-row items-center bg-[#F5F7FB] rounded-2xl px-4 border border-[#E8EDF5]">
                    <Mail size={18} color="#9CA3AF" />
                    <TextInput
                      className="flex-1 py-3.5 ml-3 text-gray-900 text-base"
                      placeholder="you@company.com"
                      placeholderTextColor="#9CA3AF"
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoCorrect={false}
                      value={email}
                      onChangeText={setEmail}
                    />
                  </View>
                </View>

                {/* Password */}
                <View className="mb-4">
                  <Text className="text-gray-700 text-xs font-semibold mb-2 ml-1">
                    Password
                  </Text>
                  <View className="flex-row items-center bg-[#F5F7FB] rounded-2xl px-4 border border-[#E8EDF5]">
                    <Lock size={18} color="#9CA3AF" />
                    <TextInput
                      className="flex-1 py-3.5 ml-3 text-gray-900 text-base"
                      placeholder="Create a password"
                      placeholderTextColor="#9CA3AF"
                      secureTextEntry={!showPassword}
                      value={password}
                      onChangeText={setPassword}
                    />
                    <TouchableOpacity
                      onPress={() => setShowPassword(!showPassword)}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      {showPassword ? (
                        <EyeOff size={18} color="#9CA3AF" />
                      ) : (
                        <Eye size={18} color="#9CA3AF" />
                      )}
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Confirm Password */}
                <View className="mb-6">
                  <Text className="text-gray-700 text-xs font-semibold mb-2 ml-1">
                    Confirm Password
                  </Text>
                  <View className="flex-row items-center bg-[#F5F7FB] rounded-2xl px-4 border border-[#E8EDF5]">
                    <Lock size={18} color="#9CA3AF" />
                    <TextInput
                      className="flex-1 py-3.5 ml-3 text-gray-900 text-base"
                      placeholder="Re-enter your password"
                      placeholderTextColor="#9CA3AF"
                      secureTextEntry={!showConfirm}
                      value={confirm}
                      onChangeText={setConfirm}
                    />
                    <TouchableOpacity
                      onPress={() => setShowConfirm(!showConfirm)}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      {showConfirm ? (
                        <EyeOff size={18} color="#9CA3AF" />
                      ) : (
                        <Eye size={18} color="#9CA3AF" />
                      )}
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Create Account Button */}
                <TouchableOpacity
                  className="rounded-2xl py-4 flex-row items-center justify-center"
                  onPress={() => router.replace('/')}
                  activeOpacity={0.85}
                  style={{
                    backgroundColor: '#0066FF',
                    shadowColor: '#0066FF',
                    shadowOffset: { width: 0, height: 8 },
                    shadowOpacity: 0.3,
                    shadowRadius: 16,
                    elevation: 8,
                  }}
                >
                  <Text className="text-white font-bold text-base">
                    Create Account
                  </Text>
                  <ArrowRight
                    size={18}
                    color="white"
                    style={{ marginLeft: 8 }}
                  />
                </TouchableOpacity>
              </View>

              {/* Footer */}
              <View className="flex-row justify-center mt-8">
                <Text className="text-gray-500 text-sm">
                  Already have an account?{' '}
                </Text>
                <Link href="/login">
                  <Text className="text-[#0066FF] font-bold text-sm">
                    Log In
                  </Text>
                </Link>
              </View>

              {/* Version */}
              <Text className="text-gray-400 text-xs text-center mt-6">
                Attendify • Version 1.0.0
              </Text>

            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}